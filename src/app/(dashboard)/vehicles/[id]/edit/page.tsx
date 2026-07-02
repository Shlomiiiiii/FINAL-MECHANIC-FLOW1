import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { VehicleForm } from "@/components/vehicles/vehicle-form";

export const metadata: Metadata = { title: "Edit Vehicle" };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!vehicle) notFound();

  const label = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title={`Edit ${label}`} subtitle="Update vehicle details" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <VehicleForm
            mode="edit"
            customerId={vehicle.customerId}
            vehicleId={vehicle.id}
            defaultValues={{
              vin: vehicle.vin ?? "",
              year: vehicle.year ? String(vehicle.year) : "",
              make: vehicle.make ?? "",
              model: vehicle.model ?? "",
              trim: vehicle.trim ?? "",
              licensePlate: vehicle.licensePlate ?? "",
              colorExterior: vehicle.colorExterior ?? "",
              colorInterior: vehicle.colorInterior ?? "",
              engine: vehicle.engine ?? "",
              transmission: vehicle.transmission ?? "",
              drivetrain: vehicle.drivetrain ?? "",
              fuelType: vehicle.fuelType ?? "",
              cylinders: vehicle.cylinders ? String(vehicle.cylinders) : "",
              displacement: vehicle.displacement ?? "",
              horsepower: vehicle.horsepower ? String(vehicle.horsepower) : "",
              oilType: vehicle.oilType ?? "",
              oilCapacityQt: vehicle.oilCapacityQt ? String(vehicle.oilCapacityQt) : "",
              tireSize: vehicle.tireSize ?? "",
              tirePressureFront: vehicle.tirePressureFront ? String(vehicle.tirePressureFront) : "",
              tirePressureRear: vehicle.tirePressureRear ? String(vehicle.tirePressureRear) : "",
              mileageLastSeen: vehicle.mileageLastSeen ? String(vehicle.mileageLastSeen) : "",
              mileageAtPurchase: vehicle.mileageAtPurchase ? String(vehicle.mileageAtPurchase) : "",
              purchaseDate: vehicle.purchaseDate ? vehicle.purchaseDate.toISOString().split("T")[0] : "",
              warrantyExpiry: vehicle.warrantyExpiry ? vehicle.warrantyExpiry.toISOString().split("T")[0] : "",
              warrantyMiles: vehicle.warrantyMiles ? String(vehicle.warrantyMiles) : "",
              warrantyNotes: vehicle.warrantyNotes ?? "",
              notes: vehicle.notes ?? "",
            }}
          />
        </div>
      </main>
    </div>
  );
}
