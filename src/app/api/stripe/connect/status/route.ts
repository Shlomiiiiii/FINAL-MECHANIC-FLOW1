import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(_request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const [org, connectAccount] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { stripeAccountId: true, stripeAccountOnboarded: true },
      }),
      prisma.stripeConnectAccount.findUnique({
        where: { organizationId: user.organizationId },
      }),
    ]);

    if (!org?.stripeAccountId) {
      return successResponse({ connected: false, onboarded: false });
    }

    // Sync latest status from Stripe
    let liveStatus = connectAccount;
    try {
      const account = await stripe.accounts.retrieve(org.stripeAccountId);
      if (connectAccount) {
        liveStatus = await prisma.stripeConnectAccount.update({
          where: { organizationId: user.organizationId },
          data: {
            chargesEnabled:   account.charges_enabled,
            payoutsEnabled:   account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            onboardedAt: account.charges_enabled && !connectAccount.onboardedAt ? new Date() : connectAccount.onboardedAt,
          },
        });
      }
    } catch (e) { /* Stripe API unreachable in dev */ }

    return successResponse({
      connected:        true,
      onboarded:        org.stripeAccountOnboarded || liveStatus?.chargesEnabled,
      chargesEnabled:   liveStatus?.chargesEnabled ?? false,
      payoutsEnabled:   liveStatus?.payoutsEnabled ?? false,
      detailsSubmitted: liveStatus?.detailsSubmitted ?? false,
      stripeAccountId:  org.stripeAccountId,
      platformFeeBps:   liveStatus?.platformFeeBps ?? 50,
    });
  } catch (err) {
    console.error("GET /stripe/connect/status:", err);
    return ApiErrors.internal();
  }
}
