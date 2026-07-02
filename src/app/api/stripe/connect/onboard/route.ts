/**
 * Stripe Connect Onboarding
 *
 * Creates a Stripe Account Link for Standard Connect onboarding.
 * Standard = shop owner completes their own KYC/identity verification
 * directly with Stripe. MechanicFlow never touches their banking info.
 */

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, email: true, stripeAccountId: true, stripeAccountOnboarded: true },
    });
    if (!org) return ApiErrors.notFound("Organization");

    if (org.stripeAccountOnboarded) {
      return ApiErrors.businessLogic("Stripe account is already connected and verified.");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    let stripeAccountId = org.stripeAccountId;

    // Create Stripe account if not exists
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        country: "US",
        email: org.email ?? undefined,
        metadata: { organizationId: org.id, organizationName: org.name },
      });

      stripeAccountId = account.id;

      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeAccountId },
      });

      await prisma.stripeConnectAccount.upsert({
        where: { organizationId: org.id },
        create: {
          organizationId: org.id,
          stripeAccountId,
          accountType: "standard",
          country: "US",
          email: org.email ?? undefined,
          platformFeeBps: parseInt(process.env.STRIPE_PLATFORM_FEE_BPS ?? "50"),
        },
        update: { stripeAccountId },
      });
    }

    // Create onboarding link (valid for 5 minutes)
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${appUrl}/settings/billing?connect=refresh`,
      return_url:  `${appUrl}/settings/billing?connect=success`,
      type: "account_onboarding",
    });

    return successResponse({ url: accountLink.url });
  } catch (err: any) {
    console.error("POST /stripe/connect/onboard:", err);
    if (err?.type?.startsWith("Stripe")) return ApiErrors.businessLogic(err.message);
    return ApiErrors.internal();
  }
}
