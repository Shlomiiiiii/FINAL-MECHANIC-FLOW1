import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [org, profile] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        id: true, name: true, slug: true, phone: true, email: true,
        website: true, addressLine1: true, addressLine2: true,
        city: true, state: true, zip: true, country: true,
        timezone: true, currency: true, logoUrl: true,
        taxRatePct: true, taxLabel: true, invoicePrefix: true,
        laborRateCents: true, defaultPaymentTermsDays: true,
        invoiceNotes: true, invoiceTerms: true,
        emailNotificationsEnabled: true, smsNotificationsEnabled: true,
        onlinePaymentsEnabled: true, customerPortalEnabled: true,
        portalWelcomeMessage: true, portalAllowBooking: true,
        portalAllowChat: true, portalAllowPhotoUpload: true,
        portalRequireOtp: true,
        plan: true, trialEndsAt: true, stripeAccountOnboarded: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, fullName: true, email: true, phone: true,
        avatarUrl: true, color: true, role: true,
        notifyJobAssigned: true, notifyEstimateApproved: true,
        notifyInvoicePaid: true, notifySmsEnabled: true,
      },
    }),
  ]);

  if (!org || !profile) redirect("/login");

  // Prisma Decimal objects are not serializable — convert to plain numbers first
  const orgPlain = {
    ...org,
    taxRatePct: Number(org.taxRatePct),
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="Settings" subtitle={org.name} />
      <main className="flex-1 overflow-y-auto">
        <SettingsClient
          org={orgPlain as any}
          profile={profile as any}
          userRole={user.role}
        />
      </main>
    </div>
  );
}
