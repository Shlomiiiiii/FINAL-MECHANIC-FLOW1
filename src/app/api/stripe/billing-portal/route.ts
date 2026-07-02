import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(_request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { stripeCustomerId: true },
    });

    if (!org?.stripeCustomerId) {
      return ApiErrors.businessLogic("No billing account found. Subscribe to a plan first.");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer:   org.stripeCustomerId,
      return_url: `${appUrl}/settings/billing`,
    });

    return successResponse({ url: session.url });
  } catch (err: any) {
    console.error("POST /stripe/billing-portal:", err);
    if (err?.type?.startsWith("Stripe")) return ApiErrors.businessLogic(err.message);
    return ApiErrors.internal();
  }
}
