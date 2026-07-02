/**
 * Stripe Webhook Handler
 *
 * Security:
 * - Signature verified with stripe.webhooks.constructEvent (HMAC-SHA256)
 * - Every event stored in StripeWebhookEvent for idempotency + replay protection
 * - Processed flag prevents double-processing on retries
 *
 * Events handled:
 *   payment_intent.succeeded          → mark payment succeeded, reconcile invoice
 *   payment_intent.payment_failed     → mark payment failed, notify shop
 *   charge.refunded                   → record refund, reconcile invoice
 *   charge.dispute.created            → flag payment as disputed
 *   customer.subscription.created     → activate plan, create Subscription record
 *   customer.subscription.updated     → sync plan changes, trial end, etc.
 *   customer.subscription.deleted     → downgrade to STARTER, mark cancelled
 *   invoice.payment_succeeded         → record subscription invoice paid
 *   invoice.payment_failed            → flag org for dunning
 *   account.updated                   → sync Connect account onboarding status
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { constructWebhookEvent, computePlatformFee, estimateStripeFee, computeNetRevenue } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs"; // required for raw body access

async function getRawBody(request: NextRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  // ── 1. Verify signature ────────────────────────────────────────────────────
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await getRawBody(request);

  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── 2. Idempotency check ───────────────────────────────────────────────────
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true, processed: true },
  });

  if (existing?.processed) {
    // Already processed — return 200 to acknowledge without reprocessing
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ── 3. Store event ─────────────────────────────────────────────────────────
  const webhookRecord = existing ?? await prisma.stripeWebhookEvent.create({
    data: {
      stripeEventId: event.id,
      type: event.type,
      payload: event as any,
    },
  });

  // ── 4. Process event ───────────────────────────────────────────────────────
  try {
    await processEvent(event);

    await prisma.stripeWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processed: true, processedAt: new Date() },
    });
  } catch (err: any) {
    console.error(`Webhook processing failed for ${event.type}:`, err);

    await prisma.stripeWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { error: err.message ?? "Unknown error" },
    });

    // Return 500 so Stripe retries (up to 3 days)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Event Processors ─────────────────────────────────────────────────────────

async function processEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;

    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;

    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;

    case "charge.dispute.created":
      await handleDisputeCreated(event.data.object as Stripe.Dispute);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case "invoice.payment_succeeded":
      await handleSubscriptionInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handleSubscriptionInvoiceFailed(event.data.object as Stripe.Invoice);
      break;

    case "account.updated":
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;

    default:
      // Unhandled event type — log and acknowledge
      console.log(`Unhandled Stripe event: ${event.type}`);
  }
}

// ─── payment_intent.succeeded ─────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
    select: { id: true, invoiceId: true, amountCents: true, status: true, customerId: true },
  });

  if (!payment) {
    // Portal-initiated payment: look up invoice via metadata
    const invoiceId = pi.metadata?.invoiceId;
    if (!invoiceId) return;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, organizationId: true, customerId: true, totalCents: true, amountPaidCents: true },
    });
    if (!invoice) return;

    const amountCents = pi.amount_received;
    const platformFee = computePlatformFee(amountCents);
    const stripeFeeEst = estimateStripeFee(amountCents);

    // Find or create a system user for webhook-recorded payments
    const orgOwner = await prisma.user.findFirst({
      where: { organizationId: invoice.organizationId, role: "OWNER" },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const pmt = await tx.payment.create({
        data: {
          organizationId:       invoice.organizationId,
          invoiceId:            invoiceId,
          customerId:           invoice.customerId,
          amountCents,
          method:               getPaymentMethodFromIntent(pi),
          status:               "SUCCEEDED",
          stripePaymentIntentId: pi.id,
          stripeChargeId:       pi.latest_charge as string ?? undefined,
          stripeCustomerId:     pi.customer as string ?? undefined,
          platformFeeCents:     platformFee,
          stripeFeeEstCents:    stripeFeeEst,
          netRevenueCents:      computeNetRevenue(amountCents),
          receiptUrl:           pi.metadata?.receiptUrl,
          source:               "portal",
          processedAt:          new Date(),
          createdById:          orgOwner?.id ?? invoice.organizationId,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaidCents: { increment: amountCents } },
      });

      await reconcileInvoice(invoiceId, tx);

      await tx.invoiceEvent.create({
        data: {
          invoiceId,
          eventType: "paid",
          note: `$${(amountCents / 100).toFixed(2)} received via Stripe (webhook)`,
          metadata: { paymentId: pmt.id, stripePaymentIntentId: pi.id } as any,
        },
      });

      // Update customer lifetime value
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: {
          lifetimeRevenueCents: { increment: amountCents },
          lastServiceAt: new Date(),
        },
      });
    });
    return;
  }

  if (payment.status === "SUCCEEDED") return; // already processed

  const amountCents    = pi.amount_received;
  const platformFee    = computePlatformFee(amountCents);
  const stripeFeeEst   = estimateStripeFee(amountCents);

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status:            "SUCCEEDED",
        stripeChargeId:    pi.latest_charge as string ?? undefined,
        platformFeeCents:  platformFee,
        stripeFeeEstCents: stripeFeeEst,
        netRevenueCents:   computeNetRevenue(amountCents),
        processedAt:       new Date(),
      },
    });

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: { amountPaidCents: { increment: amountCents } },
    });

    await reconcileInvoice(payment.invoiceId, tx);

    await tx.customer.update({
      where: { id: payment.customerId },
      data: { lifetimeRevenueCents: { increment: amountCents }, lastServiceAt: new Date() },
    });
  });
}

// ─── payment_intent.payment_failed ────────────────────────────────────────────

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: pi.id },
    data: {
      status:     "FAILED",
      failedAt:   new Date(),
      failReason: pi.last_payment_error?.message ?? "Payment failed",
    },
  });
}

// ─── charge.refunded ──────────────────────────────────────────────────────────

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { stripeChargeId: charge.id },
    select: { id: true, invoiceId: true, amountCents: true, customerId: true },
  });
  if (!payment) return;

  const refundAmount = charge.amount_refunded;
  const isFullRefund = charge.refunded;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status:           isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
        refundedAt:       new Date(),
        refundAmountCents: refundAmount,
        stripeRefundId:   charge.refunds?.data?.[0]?.id,
      },
    });

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: { amountPaidCents: { decrement: refundAmount } },
    });

    await reconcileInvoice(payment.invoiceId, tx);

    await tx.customer.update({
      where: { id: payment.customerId },
      data: { lifetimeRevenueCents: { decrement: refundAmount } },
    });

    await tx.invoiceEvent.create({
      data: {
        invoiceId: payment.invoiceId,
        eventType: "refunded",
        note: `Refund of $${(refundAmount / 100).toFixed(2)} processed by Stripe`,
        metadata: { chargeId: charge.id, refundAmount } as any,
      },
    });
  });
}

// ─── charge.dispute.created ───────────────────────────────────────────────────

async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  await prisma.payment.updateMany({
    where: { stripeChargeId: chargeId },
    data: {
      status:     "FAILED",
      failReason: `Chargeback filed: ${dispute.reason} — $${(dispute.amount / 100).toFixed(2)}`,
    },
  });
}

// ─── customer.subscription.created / updated ──────────────────────────────────

async function handleSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
  const orgId = sub.metadata?.organizationId;
  if (!orgId) return;

  const priceId = sub.items.data[0]?.price.id;
  const plan    = getPlanFromPriceId(priceId ?? "");
  const amount  = sub.items.data[0]?.price.unit_amount ?? 0;
  const interval = sub.items.data[0]?.price.recurring?.interval ?? "month";

  await prisma.subscription.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId:      orgId,
      stripeCustomerId:    sub.customer as string,
      stripeSubscriptionId: sub.id,
      stripePriceId:       priceId ?? "",
      stripeProductId:     sub.items.data[0]?.price.product as string ?? "",
      plan,
      status:              sub.status,
      interval,
      intervalCount:       sub.items.data[0]?.price.recurring?.interval_count ?? 1,
      currentPeriodStart:  new Date(sub.current_period_start * 1000),
      currentPeriodEnd:    new Date(sub.current_period_end * 1000),
      trialStart:          sub.trial_start ? new Date(sub.trial_start * 1000) : null,
      trialEnd:            sub.trial_end   ? new Date(sub.trial_end   * 1000) : null,
      cancelAt:            sub.cancel_at   ? new Date(sub.cancel_at   * 1000) : null,
      canceledAt:          sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      cancelAtPeriodEnd:   sub.cancel_at_period_end,
      amountCents:         amount,
      currency:            sub.currency,
    },
    update: {
      stripeSubscriptionId: sub.id,
      stripePriceId:       priceId ?? "",
      plan,
      status:              sub.status,
      interval,
      currentPeriodStart:  new Date(sub.current_period_start * 1000),
      currentPeriodEnd:    new Date(sub.current_period_end   * 1000),
      trialEnd:            sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      cancelAt:            sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
      canceledAt:          sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      cancelAtPeriodEnd:   sub.cancel_at_period_end,
      amountCents:         amount,
    },
  });

  // Sync plan on org
  if (["active","trialing"].includes(sub.status)) {
    await prisma.organization.update({
      where: { id: orgId },
      data: { plan: plan as any, isActive: true },
    });
  }
}

// ─── customer.subscription.deleted ────────────────────────────────────────────

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const orgId = sub.metadata?.organizationId;
  if (!orgId) return;

  await prisma.subscription.updateMany({
    where: { organizationId: orgId, stripeSubscriptionId: sub.id },
    data: { status: "canceled", canceledAt: new Date() },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { plan: "STARTER" },
  });
}

// ─── invoice.payment_succeeded (subscription billing) ────────────────────────

async function handleSubscriptionInvoicePaid(inv: Stripe.Invoice): Promise<void> {
  const orgId = inv.subscription_details?.metadata?.organizationId
    ?? inv.metadata?.organizationId;
  if (!orgId || !inv.subscription) return;

  // Sync subscription status
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: inv.subscription as string },
    data: { status: "active" },
  });
}

// ─── invoice.payment_failed (subscription billing) ────────────────────────────

async function handleSubscriptionInvoiceFailed(inv: Stripe.Invoice): Promise<void> {
  const orgId = inv.metadata?.organizationId;
  if (!orgId || !inv.subscription) return;

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: inv.subscription as string },
    data: { status: "past_due" },
  });
}

// ─── account.updated (Stripe Connect) ────────────────────────────────────────

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  await prisma.stripeConnectAccount.updateMany({
    where: { stripeAccountId: account.id },
    data: {
      chargesEnabled:   account.charges_enabled,
      payoutsEnabled:   account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      onboardedAt: account.charges_enabled ? new Date() : undefined,
    },
  });

  // If charges just became enabled, mark org as onboarded
  if (account.charges_enabled) {
    await prisma.organization.updateMany({
      where: { stripeAccountId: account.id },
      data: { stripeAccountOnboarded: true },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function reconcileInvoice(
  invoiceId: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { totalCents: true, amountPaidCents: true },
  });
  if (!invoice) return;

  const balance = Math.max(0, invoice.totalCents - invoice.amountPaidCents);
  const status  = balance <= 0 ? "PAID" : invoice.amountPaidCents > 0 ? "PARTIALLY_PAID" : "SENT";

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { balanceCents: balance, status, paidAt: balance <= 0 ? new Date() : null },
  });
}

function getPaymentMethodFromIntent(pi: Stripe.PaymentIntent): "CARD" | "ACH" | "OTHER" {
  const type = pi.payment_method_types?.[0];
  if (type === "card") return "CARD";
  if (type === "us_bank_account") return "ACH";
  return "OTHER";
}

function getPlanFromPriceId(priceId: string): "STARTER" | "PRO" | "GROWTH" | "ENTERPRISE" {
  const env = process.env;
  if ([env.STRIPE_PRICE_PRO_MONTHLY,      env.STRIPE_PRICE_PRO_YEARLY].includes(priceId))        return "PRO";
  if ([env.STRIPE_PRICE_GROWTH_MONTHLY,   env.STRIPE_PRICE_GROWTH_YEARLY].includes(priceId))     return "GROWTH";
  if ([env.STRIPE_PRICE_ENTERPRISE_MONTHLY, env.STRIPE_PRICE_ENTERPRISE_YEARLY].includes(priceId)) return "ENTERPRISE";
  return "STARTER";
}
