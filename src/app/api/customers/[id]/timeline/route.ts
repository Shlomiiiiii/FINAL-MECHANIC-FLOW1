import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  icon: string;
  color: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const exists = await prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, createdAt: true, firstName: true, lastName: true },
    });
    if (!exists) return ApiErrors.notFound("Customer");

    const [jobs, estimates, invoices, payments, appointments, vehicles, comms, audits] =
      await Promise.all([
        prisma.job.findMany({
          where: { customerId: id, organizationId: user.organizationId, deletedAt: null },
          select: { id: true, jobNumber: true, title: true, status: true, completedAt: true, createdAt: true, totalCents: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.estimate.findMany({
          where: { customerId: id, organizationId: user.organizationId },
          select: { id: true, estimateNumber: true, title: true, status: true, sentAt: true, approvedAt: true, declinedAt: true, createdAt: true, totalCents: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.invoice.findMany({
          where: { customerId: id, organizationId: user.organizationId },
          select: { id: true, invoiceNumber: true, status: true, sentAt: true, paidAt: true, createdAt: true, totalCents: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.payment.findMany({
          where: { customerId: id, organizationId: user.organizationId, status: "SUCCEEDED" },
          select: { id: true, amountCents: true, method: true, processedAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.appointment.findMany({
          where: { customerId: id, organizationId: user.organizationId },
          select: { id: true, title: true, status: true, startsAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.vehicle.findMany({
          where: { customerId: id, organizationId: user.organizationId, deletedAt: null },
          select: { id: true, year: true, make: true, model: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.communicationLog.findMany({
          where: { customerId: id, organizationId: user.organizationId },
          select: { id: true, type: true, subject: true, body: true, direction: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.auditLog.findMany({
          where: { resourceType: "customer", resourceId: id, organizationId: user.organizationId },
          select: { id: true, action: true, createdAt: true, changes: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    const events: TimelineEvent[] = [];

    // Customer created
    events.push({
      id: `customer-created-${id}`,
      type: "customer_created",
      title: "Customer profile created",
      subtitle: `${exists.firstName} ${exists.lastName} added to your CRM`,
      timestamp: exists.createdAt,
      icon: "UserPlus",
      color: "blue",
    });

    // Vehicles
    for (const v of vehicles) {
      events.push({
        id: `vehicle-${v.id}`,
        type: "vehicle_added",
        title: "Vehicle added",
        subtitle: `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim(),
        timestamp: v.createdAt,
        icon: "Car",
        color: "slate",
      });
    }

    // Jobs
    for (const j of jobs) {
      events.push({
        id: `job-created-${j.id}`,
        type: "job_created",
        title: "Job created",
        subtitle: `${j.jobNumber} — ${j.title}`,
        timestamp: j.createdAt,
        metadata: { jobId: j.id, jobNumber: j.jobNumber },
        icon: "Wrench",
        color: "blue",
      });
      if (j.completedAt) {
        events.push({
          id: `job-completed-${j.id}`,
          type: "job_completed",
          title: "Job completed",
          subtitle: `${j.jobNumber} — ${j.title}`,
          timestamp: j.completedAt,
          metadata: { jobId: j.id, totalCents: j.totalCents },
          icon: "CheckCircle",
          color: "green",
        });
      }
    }

    // Estimates
    for (const e of estimates) {
      events.push({
        id: `estimate-created-${e.id}`,
        type: "estimate_created",
        title: "Estimate created",
        subtitle: `${e.estimateNumber} — ${e.title}`,
        timestamp: e.createdAt,
        metadata: { estimateId: e.id },
        icon: "FileText",
        color: "slate",
      });
      if (e.sentAt) {
        events.push({
          id: `estimate-sent-${e.id}`,
          type: "estimate_sent",
          title: "Estimate sent",
          subtitle: `${e.estimateNumber} — ${e.title}`,
          timestamp: e.sentAt,
          metadata: { estimateId: e.id, totalCents: e.totalCents },
          icon: "Send",
          color: "blue",
        });
      }
      if (e.approvedAt) {
        events.push({
          id: `estimate-approved-${e.id}`,
          type: "estimate_approved",
          title: "Estimate approved",
          subtitle: `${e.estimateNumber} approved by customer`,
          timestamp: e.approvedAt,
          metadata: { estimateId: e.id, totalCents: e.totalCents },
          icon: "ThumbsUp",
          color: "green",
        });
      }
      if (e.declinedAt) {
        events.push({
          id: `estimate-declined-${e.id}`,
          type: "estimate_declined",
          title: "Estimate declined",
          subtitle: `${e.estimateNumber} declined by customer`,
          timestamp: e.declinedAt,
          metadata: { estimateId: e.id },
          icon: "ThumbsDown",
          color: "red",
        });
      }
    }

    // Invoices
    for (const inv of invoices) {
      if (inv.sentAt) {
        events.push({
          id: `invoice-sent-${inv.id}`,
          type: "invoice_sent",
          title: "Invoice sent",
          subtitle: `${inv.invoiceNumber} — $${(inv.totalCents / 100).toFixed(2)}`,
          timestamp: inv.sentAt,
          metadata: { invoiceId: inv.id, totalCents: inv.totalCents },
          icon: "Receipt",
          color: "blue",
        });
      }
      if (inv.paidAt) {
        events.push({
          id: `invoice-paid-${inv.id}`,
          type: "invoice_paid",
          title: "Invoice paid in full",
          subtitle: `${inv.invoiceNumber} — $${(inv.totalCents / 100).toFixed(2)}`,
          timestamp: inv.paidAt,
          metadata: { invoiceId: inv.id, totalCents: inv.totalCents },
          icon: "DollarSign",
          color: "green",
        });
      }
    }

    // Payments
    for (const p of payments) {
      events.push({
        id: `payment-${p.id}`,
        type: "payment_received",
        title: "Payment received",
        subtitle: `$${(p.amountCents / 100).toFixed(2)} via ${p.method.toLowerCase().replace("_", " ")}`,
        timestamp: p.processedAt ?? p.createdAt,
        metadata: { amountCents: p.amountCents, method: p.method },
        icon: "CreditCard",
        color: "green",
      });
    }

    // Appointments
    for (const a of appointments) {
      events.push({
        id: `appt-${a.id}`,
        type: "appointment_booked",
        title: "Appointment scheduled",
        subtitle: a.title,
        timestamp: a.createdAt,
        metadata: { startsAt: a.startsAt, status: a.status },
        icon: "Calendar",
        color: "purple",
      });
    }

    // Communications
    const commLabels: Record<string, string> = {
      call: "Phone call logged",
      sms: "SMS logged",
      email: "Email logged",
      in_person: "In-person visit noted",
      note: "Note added",
    };
    for (const c of comms) {
      events.push({
        id: `comm-${c.id}`,
        type: `communication_${c.type}`,
        title: commLabels[c.type] ?? "Communication logged",
        subtitle: c.subject ?? c.body?.slice(0, 60),
        timestamp: c.createdAt,
        metadata: { type: c.type, direction: c.direction },
        icon: "MessageSquare",
        color: "slate",
      });
    }

    // Sort by timestamp desc
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return successResponse({ timeline: events });
  } catch (error) {
    console.error("GET timeline:", error);
    return ApiErrors.internal();
  }
}
