/**
 * MechanicFlow Stripe Client
 *
 * Single authoritative Stripe instance for the entire server.
 * Never import Stripe directly in route files — always use this.
 *
 * Architecture:
 *   - Platform account: MechanicFlow's Stripe account
 *   - Connected accounts: each shop's Stripe account (Standard)
 *   - PaymentIntents: created on the connected account with application_fee
 *   - Subscriptions: created on the platform account for MechanicFlow billing
 */

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  typescript: true,
  appInfo: {
    name: "MechanicFlow",
    version: "1.0.0",
    url: "https://mechanicflow.com",
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────

/** Platform fee in basis points (50 = 0.5%) */
export const PLATFORM_FEE_BPS = parseInt(process.env.STRIPE_PLATFORM_FEE_BPS ?? "50");

/** Compute platform fee in cents from a transaction amount */
export function computePlatformFee(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
}

/** Estimate Stripe processing fee (2.9% + $0.30 for card) */
export function estimateStripeFee(amountCents: number): number {
  return Math.round(amountCents * 0.029) + 30;
}

/** Compute net revenue after platform fee and estimated Stripe fee */
export function computeNetRevenue(amountCents: number): number {
  return amountCents - computePlatformFee(amountCents) - estimateStripeFee(amountCents);
}

// ─── Subscription plan config ─────────────────────────────────────────────────

export interface PlanConfig {
  id: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  features: string[];
  limits: {
    users: number | "unlimited";
    customers: number | "unlimited";
    invoicesPerMonth: number | "unlimited";
  };
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
}

export const PLANS: Record<string, PlanConfig> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    description: "Perfect for solo mechanics",
    monthlyPriceCents: 4900,
    yearlyPriceCents: 47040, // 20% off
    features: [
      "1 user",
      "Up to 50 customers",
      "Unlimited invoices",
      "Basic reporting",
      "Email support",
    ],
    limits: { users: 1, customers: 50, invoicesPerMonth: "unlimited" },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "",
    stripePriceIdYearly:  process.env.STRIPE_PRICE_STARTER_YEARLY  ?? "",
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    description: "For growing shops",
    monthlyPriceCents: 9900,
    yearlyPriceCents: 95040,
    features: [
      "Up to 5 users",
      "Unlimited customers",
      "All estimate & job features",
      "SMS notifications",
      "Custom invoice branding",
      "Priority support",
    ],
    limits: { users: 5, customers: "unlimited", invoicesPerMonth: "unlimited" },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
    stripePriceIdYearly:  process.env.STRIPE_PRICE_PRO_YEARLY  ?? "",
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    description: "For multi-technician shops",
    monthlyPriceCents: 19900,
    yearlyPriceCents: 191040,
    features: [
      "Up to 15 users",
      "Unlimited everything",
      "Advanced reporting",
      "Booking widget",
      "Inventory management",
      "Dedicated onboarding",
    ],
    limits: { users: 15, customers: "unlimited", invoicesPerMonth: "unlimited" },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? "",
    stripePriceIdYearly:  process.env.STRIPE_PRICE_GROWTH_YEARLY  ?? "",
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    description: "For large operations",
    monthlyPriceCents: 49900,
    yearlyPriceCents: 479040,
    features: [
      "Unlimited users",
      "Unlimited everything",
      "SSO / SAML",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantee",
    ],
    limits: { users: "unlimited", customers: "unlimited", invoicesPerMonth: "unlimited" },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? "",
    stripePriceIdYearly:  process.env.STRIPE_PRICE_ENTERPRISE_YEARLY  ?? "",
  },
};

// ─── Webhook verification ──────────────────────────────────────────────────────

/**
 * Verify and construct a Stripe webhook event.
 * Throws if signature is invalid.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

// ─── Helper: get Stripe instance for a connected account ──────────────────────

/**
 * Returns a Stripe-like object that automatically passes stripeAccount
 * header for all requests to a connected account.
 * We do this by wrapping the global stripe client since Standard accounts
 * don't require a separate secret key.
 */
export function getConnectedStripe(stripeAccountId: string) {
  return {
    paymentIntents: {
      create: (params: Stripe.PaymentIntentCreateParams) =>
        stripe.paymentIntents.create(params, { stripeAccount: stripeAccountId }),
      retrieve: (id: string) =>
        stripe.paymentIntents.retrieve(id, {}, { stripeAccount: stripeAccountId }),
    },
    refunds: {
      create: (params: Stripe.RefundCreateParams) =>
        stripe.refunds.create(params, { stripeAccount: stripeAccountId }),
    },
    charges: {
      retrieve: (id: string) =>
        stripe.charges.retrieve(id, {}, { stripeAccount: stripeAccountId }),
    },
  };
}
