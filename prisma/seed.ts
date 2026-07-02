/**
 * MechanicFlow — Production Seed
 *
 * Creates a demo organization with realistic data:
 * - 1 organization (Acme Auto Service)
 * - 4 users (owner, manager, 2 technicians)
 * - 6 customers with vehicles
 * - 1 vendor + inventory items
 * - 8 jobs in various statuses
 * - Estimates, invoices, payments
 * - Appointments
 * - Audit log entries
 *
 * Run: npx tsx prisma/seed.ts
 */

import { PrismaClient, UserRole, JobStatus, JobType, Priority, EstimateStatus,
         InvoiceStatus, PaymentMethod, PaymentStatus, AppointmentStatus,
         LineItemType, Plan, NotificationChannel, AuditAction,
         InventoryAdjustmentType, PurchaseOrderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log("🌱 Starting MechanicFlow seed...\n");

  // ─── Clean existing seed data ──────────────────────────────────────────────
  const existingOrg = await prisma.organization.findUnique({
    where: { slug: "acme-auto" },
  });
  if (existingOrg) {
    console.log("♻️  Removing existing seed data...");
    await prisma.organization.delete({ where: { id: existingOrg.id } });
  }

  // ─── Organization ──────────────────────────────────────────────────────────
  console.log("🏢 Creating organization...");
  const org = await prisma.organization.create({
    data: {
      name: "Acme Auto Service",
      slug: "acme-auto",
      plan: Plan.PRO,
      timezone: "America/Chicago",
      currency: "USD",
      phone: "(512) 555-0100",
      email: "hello@acmeauto.example.com",
      website: "https://acmeauto.example.com",
      addressLine1: "1420 S Congress Ave",
      city: "Austin",
      state: "TX",
      zip: "78704",
      country: "US",
      taxRatePct: 0.0825, // 8.25% Texas
      taxLabel: "TX Sales Tax",
      invoicePrefix: "INV",
      invoiceCounter: 1050,
      estimateCounter: 1020,
      jobCounter: 2040,
      laborRateCents: 9500, // $95/hr
      defaultPaymentTermsDays: 30,
      invoiceNotes: "Thank you for choosing Acme Auto Service!",
      invoiceTerms: "Payment due within 30 days of invoice date.",
      smsNotificationsEnabled: true,
      emailNotificationsEnabled: true,
      onlinePaymentsEnabled: true,
      customerPortalEnabled: true,
    },
  });

  // ─── Users ─────────────────────────────────────────────────────────────────
  console.log("👥 Creating users...");

  const ownerPassword = await hash("Owner123!demo");
  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "jamie@acmeauto.example.com",
      fullName: "Jamie Morales",
      phone: "(512) 555-0101",
      role: UserRole.OWNER,
      passwordHash: ownerPassword,
      notifyJobAssigned: true,
      notifyEstimateApproved: true,
      notifyInvoicePaid: true,
    },
  });

  const managerPassword = await hash("Manager123!demo");
  const manager = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "sarah@acmeauto.example.com",
      fullName: "Sarah Chen",
      phone: "(512) 555-0102",
      role: UserRole.MANAGER,
      passwordHash: managerPassword,
    },
  });

  const tech1Password = await hash("Tech123!demo");
  const tech1 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "ray@acmeauto.example.com",
      fullName: "Ray Kim",
      phone: "(512) 555-0103",
      role: UserRole.TECHNICIAN,
      passwordHash: tech1Password,
      hourlyRate: 3500, // $35/hr cost
    },
  });

  const tech2Password = await hash("Tech123!demo");
  const tech2 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "mike@acmeauto.example.com",
      fullName: "Mike Patterson",
      phone: "(512) 555-0104",
      role: UserRole.TECHNICIAN,
      passwordHash: tech2Password,
      hourlyRate: 3000,
    },
  });

  const staffPassword = await hash("Staff123!demo");
  await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "linda@acmeauto.example.com",
      fullName: "Linda Torres",
      phone: "(512) 555-0105",
      role: UserRole.OFFICE_STAFF,
      passwordHash: staffPassword,
    },
  });

  // ─── Vendor ────────────────────────────────────────────────────────────────
  console.log("🏭 Creating vendor...");
  const vendor = await prisma.vendor.create({
    data: {
      organizationId: org.id,
      name: "AutoZone Pro",
      contactName: "Derek Walsh",
      email: "derek.walsh@autozone-pro.example.com",
      phone: "(512) 555-0200",
      accountNumber: "AZ-PRO-48821",
      leadTimeDays: 1,
      notes: "Same-day delivery before 2pm if order placed by 11am.",
    },
  });

  // ─── Inventory ─────────────────────────────────────────────────────────────
  console.log("📦 Creating inventory items...");

  const oil5w30 = await prisma.inventoryItem.create({
    data: {
      organizationId: org.id,
      vendorId: vendor.id,
      partNumber: "MOB-5W30-5Q",
      name: "Mobil 1 Full Synthetic 5W-30 (5qt)",
      category: "Oil & Fluids",
      unitCostCents: 2800,
      sellPriceCents: 4200,
      quantityOnHand: 24,
      reorderPoint: 6,
      reorderQuantity: 24,
      location: "Aisle A, Shelf 2",
    },
  });

  const oilFilter = await prisma.inventoryItem.create({
    data: {
      organizationId: org.id,
      vendorId: vendor.id,
      partNumber: "WIX-57356",
      name: "WIX Oil Filter 57356",
      category: "Filters",
      unitCostCents: 450,
      sellPriceCents: 1200,
      quantityOnHand: 32,
      reorderPoint: 8,
      reorderQuantity: 24,
      location: "Aisle B, Shelf 1",
    },
  });

  const brakepadFront = await prisma.inventoryItem.create({
    data: {
      organizationId: org.id,
      vendorId: vendor.id,
      partNumber: "AKE-D1060",
      name: "Akebono Ceramic Brake Pads — Front",
      category: "Brakes",
      unitCostCents: 4200,
      sellPriceCents: 8900,
      quantityOnHand: 8,
      reorderPoint: 4,
      reorderQuantity: 8,
      location: "Aisle C, Shelf 1",
    },
  });

  const airFilter = await prisma.inventoryItem.create({
    data: {
      organizationId: org.id,
      vendorId: vendor.id,
      partNumber: "K&N-33-2304",
      name: "K&N High-Flow Air Filter",
      category: "Filters",
      unitCostCents: 1800,
      sellPriceCents: 3500,
      quantityOnHand: 6,
      reorderPoint: 3,
      reorderQuantity: 6,
      location: "Aisle B, Shelf 2",
    },
  });

  const acRefrigerant = await prisma.inventoryItem.create({
    data: {
      organizationId: org.id,
      vendorId: vendor.id,
      partNumber: "R134A-30",
      name: "R-134a Refrigerant (30 lb)",
      category: "A/C",
      unitCostCents: 18000,
      sellPriceCents: 32000,
      quantityOnHand: 2,
      reorderPoint: 1,
      reorderQuantity: 2,
      location: "Cage Storage",
    },
  });

  // ─── Customers & Vehicles ──────────────────────────────────────────────────
  console.log("👤 Creating customers and vehicles...");

  const customer1 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: "Maria",
      lastName: "Santos",
      email: "maria.santos@example.com",
      phonePrimary: "(512) 555-1001",
      addressLine1: "2210 Barton Springs Rd",
      city: "Austin",
      state: "TX",
      zip: "78704",
      source: "google",
      tags: ["vip", "repeat"],
      lifetimeRevenueCents: 482000,
      totalJobCount: 7,
    },
  });
  const vehicle1a = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customer1.id,
      year: 2019, make: "Toyota", model: "Camry", trim: "XSE",
      vin: "4T1G11AK0KU801829",
      licensePlate: "TX-XB4921", engine: "2.5L 4-Cyl",
      fuelType: "gasoline", mileageLastSeen: 68450,
      mileageUpdatedAt: new Date(),
    },
  });
  const vehicle1b = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customer1.id,
      year: 2016, make: "Honda", model: "Civic", trim: "LX",
      vin: "2HGFC2F5XGH204411",
      fuelType: "gasoline", mileageLastSeen: 98140,
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: "Devon",
      lastName: "Park",
      email: "devon.park@example.com",
      phonePrimary: "(512) 555-1002",
      city: "Austin", state: "TX",
      source: "referral",
      tags: ["commercial"],
      lifetimeRevenueCents: 218000,
      totalJobCount: 3,
    },
  });
  const vehicle2 = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customer2.id,
      year: 2021, make: "Honda", model: "CR-V", trim: "EX-L",
      fuelType: "gasoline", mileageLastSeen: 31200,
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: "Lucas",
      lastName: "Tran",
      email: "ltran@example.com",
      phonePrimary: "(512) 555-1003",
      city: "Austin", state: "TX",
      source: "walk-in",
      lifetimeRevenueCents: 52000,
      totalJobCount: 1,
    },
  });
  const vehicle3 = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customer3.id,
      year: 2017, make: "Ford", model: "Escape", trim: "SE",
      fuelType: "gasoline", mileageLastSeen: 74800,
    },
  });

  const customer4 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: "Rachel",
      lastName: "Wong",
      email: "rachel.w@example.com",
      phonePrimary: "(512) 555-1004",
      city: "Austin", state: "TX",
      source: "google",
      lifetimeRevenueCents: 124000,
      totalJobCount: 2,
    },
  });
  const vehicle4 = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customer4.id,
      year: 2020, make: "Subaru", model: "Outback", trim: "Limited",
      fuelType: "gasoline", mileageLastSeen: 42300,
    },
  });

  const customer5 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: "Carlos",
      lastName: "Mendez",
      companyName: "Mendez Landscaping LLC",
      email: "carlos@mendezlandscaping.example.com",
      phonePrimary: "(512) 555-1005",
      city: "Austin", state: "TX",
      source: "referral",
      isCommercial: true,
      tags: ["fleet", "commercial"],
      lifetimeRevenueCents: 380000,
      totalJobCount: 5,
    },
  });
  const vehicle5 = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customer5.id,
      year: 2021, make: "Chevrolet", model: "Silverado 2500HD", trim: "Work Truck",
      fuelType: "gasoline", mileageLastSeen: 58900,
    },
  });

  const customer6 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: "Amy",
      lastName: "Kowalski",
      email: "amy.k@example.com",
      phonePrimary: "(512) 555-1006",
      city: "Austin", state: "TX",
      source: "website",
    },
  });
  const vehicle6 = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      customerId: customer6.id,
      year: 2022, make: "Tesla", model: "Model 3", trim: "Long Range",
      fuelType: "electric", mileageLastSeen: 18200,
    },
  });

  // ─── Jobs ──────────────────────────────────────────────────────────────────
  console.log("🔧 Creating jobs...");

  // Job 1: In Progress — Oil Change (Maria, vehicle1a, Ray)
  const job1 = await prisma.job.create({
    data: {
      organizationId: org.id,
      customerId: customer1.id,
      vehicleId: vehicle1a.id,
      jobNumber: "WO-2041",
      title: "Oil change + tire rotation",
      status: JobStatus.IN_PROGRESS,
      jobType: JobType.STANDARD,
      priority: Priority.NORMAL,
      mileageIn: 68450,
      customerNotes: "Customer requested synthetic oil.",
      subtotalCents: 18900,
      taxCents: 1559,
      totalCents: 20459,
      scheduledAt: new Date("2026-06-28T10:00:00"),
      startedAt: new Date("2026-06-28T10:12:00"),
      createdById: owner.id,
    },
  });
  await prisma.jobAssignment.create({
    data: { organizationId: org.id, jobId: job1.id, userId: tech1.id, isLead: true, assignedById: manager.id },
  });
  await prisma.jobLineItem.createMany({
    data: [
      { organizationId: org.id, jobId: job1.id, itemType: LineItemType.LABOR, description: "Oil change service", quantity: 1, unitPriceCents: 8900, totalCents: 8900, taxable: true, sortOrder: 0, technicianId: tech1.id, laborHours: 0.5 },
      { organizationId: org.id, jobId: job1.id, itemType: LineItemType.PART, inventoryItemId: oil5w30.id, description: "Mobil 1 Full Synthetic 5W-30 (5qt)", quantity: 1, unitPriceCents: 4200, totalCents: 4200, taxable: true, sortOrder: 1 },
      { organizationId: org.id, jobId: job1.id, itemType: LineItemType.PART, inventoryItemId: oilFilter.id, description: "WIX Oil Filter 57356", quantity: 1, unitPriceCents: 1200, totalCents: 1200, taxable: true, sortOrder: 2 },
      { organizationId: org.id, jobId: job1.id, itemType: LineItemType.LABOR, description: "Tire rotation", quantity: 1, unitPriceCents: 3600, totalCents: 3600, taxable: true, sortOrder: 3, technicianId: tech1.id, laborHours: 0.3 },
    ],
  });
  await prisma.jobStatusHistory.create({
    data: { organizationId: org.id, jobId: job1.id, fromStatus: JobStatus.SCHEDULED, toStatus: JobStatus.IN_PROGRESS, changedById: tech1.id },
  });

  // Job 2: Scheduled — Brake job (Devon, vehicle2, Ray)
  const job2 = await prisma.job.create({
    data: {
      organizationId: org.id,
      customerId: customer2.id,
      vehicleId: vehicle2.id,
      jobNumber: "WO-2042",
      title: "Front brake pad replacement",
      status: JobStatus.SCHEDULED,
      jobType: JobType.STANDARD,
      priority: Priority.NORMAL,
      subtotalCents: 34000,
      taxCents: 2805,
      totalCents: 36805,
      scheduledAt: new Date("2026-06-28T14:00:00"),
      createdById: manager.id,
    },
  });
  await prisma.jobAssignment.create({
    data: { organizationId: org.id, jobId: job2.id, userId: tech1.id, isLead: true, assignedById: manager.id },
  });
  await prisma.jobLineItem.createMany({
    data: [
      { organizationId: org.id, jobId: job2.id, itemType: LineItemType.LABOR, description: "Front brake pad replacement — labor", quantity: 1, unitPriceCents: 18500, totalCents: 18500, taxable: true, sortOrder: 0, technicianId: tech1.id, laborHours: 1.5 },
      { organizationId: org.id, jobId: job2.id, itemType: LineItemType.PART, inventoryItemId: brakepadFront.id, description: "Akebono Ceramic Brake Pads — Front", quantity: 2, unitPriceCents: 7750, totalCents: 15500, taxable: true, sortOrder: 1 },
    ],
  });

  // Job 3: Completed, invoice overdue (Lucas, vehicle3, Mike)
  const job3 = await prisma.job.create({
    data: {
      organizationId: org.id,
      customerId: customer3.id,
      vehicleId: vehicle3.id,
      jobNumber: "WO-2038",
      title: "A/C diagnostic + recharge",
      status: JobStatus.INVOICED,
      jobType: JobType.STANDARD,
      priority: Priority.HIGH,
      mileageIn: 74800,
      mileageOut: 74800,
      subtotalCents: 48000,
      taxCents: 3960,
      totalCents: 51960,
      scheduledAt: new Date("2026-06-11T09:00:00"),
      startedAt: new Date("2026-06-11T09:10:00"),
      completedAt: new Date("2026-06-11T11:45:00"),
      createdById: manager.id,
    },
  });
  await prisma.jobAssignment.create({
    data: { organizationId: org.id, jobId: job3.id, userId: tech2.id, isLead: true, assignedById: manager.id },
  });
  await prisma.jobLineItem.createMany({
    data: [
      { organizationId: org.id, jobId: job3.id, itemType: LineItemType.LABOR, description: "A/C diagnostic", quantity: 1, unitPriceCents: 9500, totalCents: 9500, taxable: true, sortOrder: 0 },
      { organizationId: org.id, jobId: job3.id, itemType: LineItemType.LABOR, description: "A/C recharge service", quantity: 1, unitPriceCents: 14500, totalCents: 14500, taxable: true, sortOrder: 1 },
      { organizationId: org.id, jobId: job3.id, itemType: LineItemType.PART, inventoryItemId: acRefrigerant.id, description: "R-134a Refrigerant", quantity: 1, unitPriceCents: 24000, totalCents: 24000, taxable: true, sortOrder: 2 },
    ],
  });

  // Job 4: Pending Review (Rachel, Subaru)
  const job4 = await prisma.job.create({
    data: {
      organizationId: org.id,
      customerId: customer4.id,
      vehicleId: vehicle4.id,
      jobNumber: "WO-2036",
      title: "Front suspension overhaul",
      status: JobStatus.PENDING_REVIEW,
      jobType: JobType.STANDARD,
      priority: Priority.HIGH,
      mileageIn: 42300,
      internalNotes: "Found additional wear on rear sway bar links — quoted separately.",
      subtotalCents: 112000,
      taxCents: 9240,
      totalCents: 121240,
      scheduledAt: new Date("2026-06-27T08:00:00"),
      startedAt: new Date("2026-06-27T08:15:00"),
      completedAt: new Date("2026-06-27T15:30:00"),
      createdById: owner.id,
    },
  });
  await prisma.jobAssignment.create({
    data: { organizationId: org.id, jobId: job4.id, userId: tech2.id, isLead: true, assignedById: owner.id },
  });

  // Job 5: Draft (Carlos fleet truck)
  const job5 = await prisma.job.create({
    data: {
      organizationId: org.id,
      customerId: customer5.id,
      vehicleId: vehicle5.id,
      jobNumber: "WO-2045",
      title: "Transmission diagnosis",
      status: JobStatus.DRAFT,
      jobType: JobType.STANDARD,
      priority: Priority.URGENT,
      customerNotes: "Slipping between 2nd and 3rd gear at highway speeds.",
      subtotalCents: 0,
      totalCents: 0,
      createdById: manager.id,
    },
  });

  // Job 6: Completed + Paid (Maria, vehicle1a)
  const job6 = await prisma.job.create({
    data: {
      organizationId: org.id,
      customerId: customer1.id,
      vehicleId: vehicle1a.id,
      jobNumber: "WO-2031",
      title: "Full brake service (all four corners)",
      status: JobStatus.CLOSED,
      jobType: JobType.STANDARD,
      priority: Priority.NORMAL,
      mileageIn: 65200,
      mileageOut: 65200,
      subtotalCents: 62000,
      taxCents: 5115,
      totalCents: 67115,
      scheduledAt: new Date("2026-05-14T09:00:00"),
      startedAt: new Date("2026-05-14T09:05:00"),
      completedAt: new Date("2026-05-14T13:00:00"),
      createdById: owner.id,
    },
  });
  await prisma.jobAssignment.create({
    data: { organizationId: org.id, jobId: job6.id, userId: tech1.id, isLead: true, assignedById: owner.id },
  });

  // Job 7: Estimate-only (Amy, Tesla)
  const job7 = await prisma.job.create({
    data: {
      organizationId: org.id,
      customerId: customer6.id,
      vehicleId: vehicle6.id,
      jobNumber: "WO-2046",
      title: "Diagnostic inspection",
      status: JobStatus.DRAFT,
      jobType: JobType.INSPECTION,
      priority: Priority.NORMAL,
      createdById: manager.id,
    },
  });

  // ─── Estimates ─────────────────────────────────────────────────────────────
  console.log("📋 Creating estimates...");

  const estimate1 = await prisma.estimate.create({
    data: {
      organizationId: org.id,
      jobId: job5.id,
      customerId: customer5.id,
      vehicleId: vehicle5.id,
      estimateNumber: "EST-1018",
      status: EstimateStatus.SENT,
      title: "Transmission diagnosis + rebuild estimate",
      notes: "Estimate based on initial inspection. Final cost may vary based on internal findings.",
      subtotalCents: 185000,
      taxCents: 15262,
      totalCents: 200262,
      expiresAt: new Date("2026-07-12"),
      sentAt: new Date("2026-06-26T14:30:00"),
      createdById: manager.id,
    },
  });
  await prisma.estimateLineItem.createMany({
    data: [
      { organizationId: org.id, estimateId: estimate1.id, itemType: LineItemType.LABOR, description: "Transmission removal and teardown", quantity: 4, unitPriceCents: 9500, totalCents: 38000, taxable: true, sortOrder: 0 },
      { organizationId: org.id, estimateId: estimate1.id, itemType: LineItemType.LABOR, description: "Transmission rebuild — labor", quantity: 8, unitPriceCents: 9500, totalCents: 76000, taxable: true, sortOrder: 1 },
      { organizationId: org.id, estimateId: estimate1.id, itemType: LineItemType.PART, description: "Rebuild kit — seals, clutch packs, bands", quantity: 1, unitPriceCents: 42000, totalCents: 42000, taxable: true, sortOrder: 2 },
      { organizationId: org.id, estimateId: estimate1.id, itemType: LineItemType.PART, description: "Transmission fluid (12qt)", quantity: 1, unitPriceCents: 9500, totalCents: 9500, taxable: true, sortOrder: 3 },
      { organizationId: org.id, estimateId: estimate1.id, itemType: LineItemType.FEE, description: "Shop supplies", quantity: 1, unitPriceCents: 4500, totalCents: 4500, taxable: true, sortOrder: 4 },
      { organizationId: org.id, estimateId: estimate1.id, itemType: LineItemType.DISCOUNT, description: "Fleet account discount (10%)", quantity: 1, unitPriceCents: -15000, totalCents: -15000, taxable: false, sortOrder: 5 },
    ],
  });

  const estimate2 = await prisma.estimate.create({
    data: {
      organizationId: org.id,
      customerId: customer6.id,
      vehicleId: vehicle6.id,
      estimateNumber: "EST-1019",
      status: EstimateStatus.DRAFT,
      title: "EV inspection — 12-point check",
      subtotalCents: 18900,
      taxCents: 1559,
      totalCents: 20459,
      createdById: manager.id,
    },
  });

  // Approved estimate → became job6 (historical)
  await prisma.estimate.create({
    data: {
      organizationId: org.id,
      jobId: job6.id,
      customerId: customer1.id,
      vehicleId: vehicle1a.id,
      estimateNumber: "EST-1008",
      status: EstimateStatus.CONVERTED,
      title: "Full brake service — all four corners",
      subtotalCents: 62000,
      taxCents: 5115,
      totalCents: 67115,
      sentAt: new Date("2026-05-12T11:00:00"),
      approvedAt: new Date("2026-05-12T14:22:00"),
      approvedByName: "Maria Santos",
      approvedIp: "192.168.1.100",
      expiresAt: new Date("2026-05-26"),
      createdById: owner.id,
    },
  });

  // ─── Invoices ──────────────────────────────────────────────────────────────
  console.log("🧾 Creating invoices...");

  // Overdue invoice (Lucas — A/C job)
  const invoice1 = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      jobId: job3.id,
      customerId: customer3.id,
      invoiceNumber: "INV-1094",
      status: InvoiceStatus.OVERDUE,
      subtotalCents: 48000,
      taxCents: 3960,
      totalCents: 51960,
      amountPaidCents: 0,
      balanceCents: 51960,
      dueDate: new Date("2026-06-18"),
      sentAt: new Date("2026-06-11T16:00:00"),
      notes: "Thank you for choosing Acme Auto Service!",
      terms: "Net 7",
      createdById: owner.id,
    },
  });
  await prisma.invoiceLineItem.createMany({
    data: [
      { organizationId: org.id, invoiceId: invoice1.id, itemType: LineItemType.LABOR, description: "A/C diagnostic", quantity: 1, unitPriceCents: 9500, totalCents: 9500, taxable: true, sortOrder: 0 },
      { organizationId: org.id, invoiceId: invoice1.id, itemType: LineItemType.LABOR, description: "A/C recharge service", quantity: 1, unitPriceCents: 14500, totalCents: 14500, taxable: true, sortOrder: 1 },
      { organizationId: org.id, invoiceId: invoice1.id, itemType: LineItemType.PART, description: "R-134a Refrigerant", quantity: 1, unitPriceCents: 24000, totalCents: 24000, taxable: true, sortOrder: 2 },
    ],
  });

  // Partially paid invoice (Devon — brakes)
  const invoice2 = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      jobId: job2.id,
      customerId: customer2.id,
      invoiceNumber: "INV-1093",
      status: InvoiceStatus.PARTIALLY_PAID,
      subtotalCents: 34000,
      taxCents: 2805,
      totalCents: 36805,
      amountPaidCents: 20000,
      balanceCents: 16805,
      dueDate: new Date("2026-07-10"),
      sentAt: new Date("2026-06-15T09:00:00"),
      createdById: manager.id,
    },
  });
  await prisma.payment.create({
    data: {
      organizationId: org.id,
      invoiceId: invoice2.id,
      customerId: customer2.id,
      amountCents: 20000,
      method: PaymentMethod.CARD,
      status: PaymentStatus.SUCCEEDED,
      platformFeeCents: 100,
      processedAt: new Date("2026-06-15T10:22:00"),
      createdById: manager.id,
    },
  });

  // Paid invoice (Maria — brake job, historical)
  const invoice3 = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      jobId: job6.id,
      customerId: customer1.id,
      invoiceNumber: "INV-1088",
      status: InvoiceStatus.PAID,
      subtotalCents: 62000,
      taxCents: 5115,
      totalCents: 67115,
      amountPaidCents: 67115,
      balanceCents: 0,
      dueDate: new Date("2026-06-13"),
      sentAt: new Date("2026-05-14T15:00:00"),
      paidAt: new Date("2026-05-14T15:42:00"),
      createdById: owner.id,
    },
  });
  await prisma.payment.create({
    data: {
      organizationId: org.id,
      invoiceId: invoice3.id,
      customerId: customer1.id,
      amountCents: 67115,
      method: PaymentMethod.CARD,
      status: PaymentStatus.SUCCEEDED,
      platformFeeCents: 336,
      processedAt: new Date("2026-05-14T15:42:00"),
      createdById: owner.id,
    },
  });

  // Rachel — suspension — sent (not yet paid)
  const invoice4 = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      jobId: job4.id,
      customerId: customer4.id,
      invoiceNumber: "INV-1096",
      status: InvoiceStatus.SENT,
      subtotalCents: 112000,
      taxCents: 9240,
      totalCents: 121240,
      amountPaidCents: 0,
      balanceCents: 121240,
      dueDate: new Date("2026-07-27"),
      sentAt: new Date("2026-06-27T17:00:00"),
      createdById: owner.id,
    },
  });

  // ─── Appointments ──────────────────────────────────────────────────────────
  console.log("📅 Creating appointments...");

  await prisma.appointment.create({
    data: {
      organizationId: org.id,
      jobId: job1.id,
      customerId: customer1.id,
      technicianId: tech1.id,
      title: "Oil change + tire rotation — Maria Santos",
      startsAt: new Date("2026-06-28T10:00:00"),
      endsAt: new Date("2026-06-28T11:30:00"),
      status: AppointmentStatus.IN_PROGRESS,
      locationType: "shop",
      confirmationSentAt: new Date("2026-06-27T09:00:00"),
      customerConfirmedAt: new Date("2026-06-27T10:15:00"),
      reminder24hSentAt: new Date("2026-06-27T10:00:00"),
    },
  });

  await prisma.appointment.create({
    data: {
      organizationId: org.id,
      jobId: job2.id,
      customerId: customer2.id,
      technicianId: tech1.id,
      title: "Brake pad replacement — Devon Park",
      startsAt: new Date("2026-06-28T14:00:00"),
      endsAt: new Date("2026-06-28T16:00:00"),
      status: AppointmentStatus.CONFIRMED,
      locationType: "shop",
      confirmationSentAt: new Date("2026-06-27T09:00:00"),
      customerConfirmedAt: new Date("2026-06-27T11:40:00"),
      reminder24hSentAt: new Date("2026-06-27T10:00:00"),
    },
  });

  await prisma.appointment.create({
    data: {
      organizationId: org.id,
      jobId: job5.id,
      customerId: customer5.id,
      technicianId: tech2.id,
      title: "Transmission diagnosis — Carlos Mendez (Silverado)",
      startsAt: new Date("2026-06-30T08:00:00"),
      endsAt: new Date("2026-06-30T11:00:00"),
      status: AppointmentStatus.SCHEDULED,
      locationType: "shop",
      confirmationSentAt: new Date("2026-06-27T15:00:00"),
    },
  });

  // ─── Audit Log entries ─────────────────────────────────────────────────────
  console.log("📝 Creating audit log entries...");

  await prisma.auditLog.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, action: AuditAction.CREATED, resourceType: "organization", resourceId: org.id, metadata: { event: "organization_registered" } },
      { organizationId: org.id, userId: owner.id, action: AuditAction.LOGIN, resourceType: "user", resourceId: owner.id, ipAddress: "203.0.113.1" },
      { organizationId: org.id, userId: owner.id, action: AuditAction.CREATED, resourceType: "customer", resourceId: customer1.id },
      { organizationId: org.id, userId: manager.id, action: AuditAction.CREATED, resourceType: "job", resourceId: job1.id },
      { organizationId: org.id, userId: tech1.id, action: AuditAction.STATUS_CHANGED, resourceType: "job", resourceId: job1.id, changes: { status: ["SCHEDULED", "IN_PROGRESS"] } },
      { organizationId: org.id, userId: owner.id, action: AuditAction.CREATED, resourceType: "invoice", resourceId: invoice1.id },
      { organizationId: org.id, userId: owner.id, action: AuditAction.CREATED, resourceType: "payment", resourceId: "payment-paid-example" },
    ],
  });

  // ─── Communication Logs ────────────────────────────────────────────────────
  await prisma.communicationLog.createMany({
    data: [
      { organizationId: org.id, customerId: customer3.id, userId: manager.id, type: "call", direction: "outbound", subject: "Invoice follow-up", body: "Called regarding overdue invoice INV-1094. No answer — left voicemail.", referenceType: "invoice", referenceId: invoice1.id },
      { organizationId: org.id, customerId: customer1.id, userId: owner.id, type: "sms", direction: "outbound", subject: "Appointment reminder", body: "Hi Maria! Reminder: your oil change is tomorrow at 10am. See you then! — Acme Auto" },
    ],
  });

  // ─── Inventory adjustments (tie to jobs) ──────────────────────────────────
  await prisma.inventoryAdjustment.create({
    data: {
      organizationId: org.id,
      inventoryItemId: oil5w30.id,
      adjustmentType: InventoryAdjustmentType.JOB_USE,
      quantityDelta: -1,
      quantityBefore: 24,
      quantityAfter: 23,
      unitCostCents: 2800,
      totalCostCents: 2800,
      jobId: job1.id,
      createdById: tech1.id,
    },
  });

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏢  Organization:  Acme Auto Service");
  console.log("🌐  Slug:          acme-auto");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n🔐  Login credentials (DEMO ONLY — change before going live):\n");
  console.log("  Role          Email                           Password");
  console.log("  ──────────    ──────────────────────────────  ──────────────────");
  console.log("  Owner         jamie@acmeauto.example.com      Owner123!demo");
  console.log("  Manager       sarah@acmeauto.example.com      Manager123!demo");
  console.log("  Technician    ray@acmeauto.example.com        Tech123!demo");
  console.log("  Technician    mike@acmeauto.example.com       Tech123!demo");
  console.log("  Office Staff  linda@acmeauto.example.com      Staff123!demo");
  console.log("\n  Workspace slug for login form: acme-auto");
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📊  Data created:");
  console.log("  • 5 users (owner, manager, 2 techs, office staff)");
  console.log("  • 6 customers + 7 vehicles");
  console.log("  • 1 vendor + 5 inventory items");
  console.log("  • 7 jobs (all statuses represented)");
  console.log("  • 3 estimates (sent, draft, converted)");
  console.log("  • 4 invoices (overdue, partial, paid, sent)");
  console.log("  • 2 payments ($671 paid, $200 partial)");
  console.log("  • 3 appointments");
  console.log("  • Audit log + communication log entries\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
