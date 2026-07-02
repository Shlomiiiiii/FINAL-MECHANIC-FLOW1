/**
 * Create a Stripe PaymentIntent for invoice payment.
 *
 * Flow:
 * 1. Customer opens portal → sees invoice
 * 2. Browser calls this endpoint to get a client_secret
 * 3. Browser uses Stripe.js to show the payment form
 * 4. Stripe handles card collection (PCI compliant — we never see card data)
 * 5. On success, payment_intent.succeeded webhook fires → we update invoice
 *
 * Connect flow:
 * - PaymentIntent created on the shop's connected account
 * - Platform fee deducted automatically via application_fee_amount
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { stripe, computePlatformFee } from "@/lib/stripe";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoiceId, token, amountCents } = body as {
      invoiceId: string;
      token: string;       // payment link token for auth
      amountCents?: number; // optional partial amount
    };

    if (!invoiceId || !token) {
      return ApiErrors.validation({ invoiceId: ["Required"], token: ["Required"] });
    }

    // Authenticate via payment link token (public portal route)
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, paymentLinkToken: token },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        organization: { select: { id: true, name: true, stripeAccountId: true, stripeAccountOnboarded: true, currency: true } },
      },
    });

    if (!invoice) return ApiErrors.notFound("Invoice");
    if (["PAID","CANCELLED","ARCHIVED"].includes(invoice.status)) {
      return ApiErrors.businessLogic("This invoice cannot be paid.");
    }
    if (invoice.balanceCents <= 0) {
      return ApiErrors.businessLogic("Invoice is already paid in full.");
    }

    const chargeAmount = amountCents ?? invoice.balanceCents;

    if (chargeAmount <= 0 || chargeAmount > invoice.balanceCents) {
      return ApiErrors.validation({ amountCents: ["Invalid payment amount"] });
    }

    const currency  = invoice.organization.currency?.toLowerCase() ?? "usd";
    const platformFee = computePlatformFee(chargeAmount);

    // Build PaymentIntent params
    const piParams: any = {
      amount: chargeAmount,
      currency,
      metadata: {
        invoiceId:     invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        organizationId: invoice.organizationId,
        customerId:    invoice.customerId,
      },
      description: `Invoice ${invoice.invoiceNumber} — ${invoice.organization.name}`,
      receipt_email: invoice.customer.email ?? undefined,
      payment_method_types: ["card"],
      // Enable Apple Pay / Google Pay automatically via card
    };

    // Use Stripe Connect if org has a connected account
    let stripeOptions: Record<string, string> = {};
    if (invoice.organization.stripeAccountId && invoice.organization.stripeAccountOnboarded) {
      piParams.application_fee_amount = platformFee;
      piParams.transfer_data = { destination: invoice.organization.stripeAccountId };
      stripeOptions = { stripeAccount: invoice.organization.stripeAccountId };
    }

    // Create or retrieve existing PaymentIntent (idempotency)
    const existingPayment = await prisma.payment.findFirst({
      where: {
        invoiceId,
        status: "PENDING",
        stripePaymentIntentId: { not: null },
      },
      select: { stripePaymentIntentId: true },
    });

    let paymentIntent: any;

    if (existingPayment?.stripePaymentIntentId) {
      // Retrieve existing PaymentIntent
      try {
        if (stripeOptions.stripeAccount) {
          paymentIntent = await stripe.paymentIntents.retrieve(
            existingPayment.stripePaymentIntentId,
            {},
            stripeOptions as any
          );
        } else {
          paymentIntent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
        }

        // If amount changed (partial payment), update it
        if (paymentIntent.amount !== chargeAmount && paymentIntent.status === "requires_payment_method") {
          paymentIntent = await stripe.paymentIntents.update(
            existingPayment.stripePaymentIntentId,
            { amount: chargeAmount },
            stripeOptions as any
          );
        }
      } catch {
        // PI might be expired — create new one
        existingPayment.stripePaymentIntentId = null as any;
      }
    }

    if (!existingPayment?.stripePaymentIntentId || !paymentIntent) {
      paymentIntent = await stripe.paymentIntents.create(piParams, stripeOptions as any);

      // Create pending payment record
      const orgOwner = await prisma.user.findFirst({
        where: { organizationId: invoice.organizationId, role: "OWNER" },
        select: { id: true },
      });

      await prisma.payment.create({
        data: {
          organizationId:        invoice.organizationId,
          invoiceId:             invoice.id,
          customerId:            invoice.customerId,
          amountCents:           chargeAmount,
          method:                "CARD",
          status:                "PENDING",
          stripePaymentIntentId: paymentIntent.id,
          platformFeeCents:      platformFee,
          source:                "portal",
          ipAddress:             request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          createdById:           orgOwner?.id ?? invoice.organizationId,
        },
      });
    }

    return successResponse({
      clientSecret:      paymentIntent.client_secret,
      paymentIntentId:   paymentIntent.id,
      amount:            chargeAmount,
      currency,
      publishableKey:    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      stripeAccountId:   invoice.organization.stripeAccountOnboarded
        ? invoice.organization.stripeAccountId
        : null,
    });
  } catch (err: any) {
    console.error("POST /stripe/payment-intent:", err);
    if (err?.type?.startsWith("Stripe")) {
      return ApiErrors.businessLogic(err.message);
    }
    return ApiErrors.internal();
  }
}
