"use client";

import { useState } from "react";
import { StripePaymentForm } from "./stripe-payment-form";
import { Shield, Phone, Mail, CheckCircle, CreditCard, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

interface Props {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    totalCents: number;
    subtotalCents: number;
    taxCents: number;
    discountCents: number;
    amountPaidCents: number;
    balanceCents: number;
    dueDate: string | null;
    paidAt: string | null;
    warrantyText: string | null;
    notes: string | null;
    lineItems: {
      id: string;
      description: string;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
      category: string | null;
      warranty: string | null;
      laborHours: number | null;
    }[];
    customer: { firstName: string; lastName: string; email: string | null; phonePrimary: string | null };
    vehicle: { year: number | null; make: string | null; model: string | null } | null;
    organization: { name: string; phone: string | null; email: string | null; taxLabel: string | null; stripeAccountOnboarded: boolean };
    payments: { amountCents: number; processedAt: string | null }[];
  };
  token: string;
}

export function InvoicePortalClient({ invoice, token }: Props) {
  const [showPayForm, setShowPayForm] = useState(false);
  const [paid, setPaid]               = useState(invoice.status === "PAID");

  const isPaid    = paid || invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";
  const canPay    = !isPaid && !isCancelled && invoice.balanceCents > 0 && invoice.organization.stripeAccountOnboarded;

  const dueStr = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Upon receipt";
  const isOverdue = !isPaid && invoice.dueDate && new Date(invoice.dueDate) < new Date();

  const grouped: Record<string, typeof invoice.lineItems> = {};
  for (const li of invoice.lineItems) {
    const cat = li.category ?? "Services";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(li);
  }

  if (showPayForm) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setShowPayForm(false)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to invoice
          </button>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4">
            <div className="flex items-center justify-between mb-5 pb-5 border-b border-slate-100">
              <div>
                <p className="font-semibold text-slate-900">{invoice.organization.name}</p>
                <p className="text-sm text-slate-500">Invoice {invoice.invoiceNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">{fmt(invoice.balanceCents)}</p>
                <p className={cn("text-xs mt-0.5", isOverdue ? "text-red-500" : "text-slate-400")}>
                  Due {dueStr}
                </p>
              </div>
            </div>

            <StripePaymentForm
              invoiceId={invoice.id}
              token={token}
              balanceCents={invoice.balanceCents}
              invoiceNumber={invoice.invoiceNumber}
              customerName={`${invoice.customer.firstName} ${invoice.customer.lastName}`}
              onSuccess={() => { setPaid(true); setShowPayForm(false); }}
            />
          </div>

          <p className="text-center text-xs text-slate-400">
            Powered by MechanicFlow & Stripe · Your card data is never stored on our servers
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Invoice card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-900 px-6 py-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-semibold text-lg">{invoice.organization.name}</p>
                <p className="text-slate-400 text-sm mt-0.5">Invoice {invoice.invoiceNumber}</p>
              </div>
              <span className={cn("px-3 py-1 rounded-full text-xs font-semibold",
                isPaid ? "bg-green-500 text-white" :
                isOverdue ? "bg-red-500 text-white" :
                "bg-blue-500 text-white"
              )}>
                {isPaid ? "Paid" : isOverdue ? "Overdue" : invoice.status.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Customer + balance */}
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">Billed to</p>
                <p className="font-semibold">{invoice.customer.firstName} {invoice.customer.lastName}</p>
                {invoice.vehicle && (
                  <p className="text-sm text-slate-500">
                    {invoice.vehicle.year} {invoice.vehicle.make} {invoice.vehicle.model}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-1">Balance due</p>
                <p className={cn("text-2xl font-bold",
                  isPaid ? "text-green-600" : isOverdue ? "text-red-600" : "text-slate-900"
                )}>
                  {fmt(invoice.balanceCents)}
                </p>
                <p className={cn("text-xs mt-0.5", isOverdue ? "text-red-500 font-medium" : "text-slate-400")}>
                  Due {dueStr}{isOverdue ? " — OVERDUE" : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="px-6 py-5">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{cat}</p>
                <div className="space-y-2">
                  {items.map((li, i) => (
                    <div key={i} className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-slate-800">{li.description}</p>
                        {li.warranty && <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1"><Shield className="h-3 w-3" />{li.warranty}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {Number(li.quantity) !== 1 && <p className="text-xs text-slate-400">{Number(li.quantity)} × {fmt(li.unitPriceCents)}</p>}
                        <p className="text-sm font-medium">{fmt(li.totalCents)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Totals */}
            <div className="border-t border-slate-100 pt-4 space-y-1.5">
              <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>{fmt(invoice.subtotalCents)}</span></div>
              {invoice.discountCents > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount</span><span>-{fmt(invoice.discountCents)}</span></div>}
              {invoice.taxCents > 0 && <div className="flex justify-between text-sm text-slate-500"><span>{invoice.organization.taxLabel ?? "Tax"}</span><span>{fmt(invoice.taxCents)}</span></div>}
              <div className="flex justify-between font-bold text-base text-slate-900 border-t border-slate-200 pt-2"><span>Total</span><span>{fmt(invoice.totalCents)}</span></div>
              {invoice.amountPaidCents > 0 && (
                <>
                  <div className="flex justify-between text-sm text-green-600"><span>Paid</span><span>-{fmt(invoice.amountPaidCents)}</span></div>
                  <div className={cn("flex justify-between font-bold", isPaid ? "text-green-600" : "text-red-600")}>
                    <span>Balance due</span><span>{fmt(invoice.balanceCents)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pay / Paid status */}
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <p className="font-semibold text-green-900 text-lg">Paid in full</p>
            {invoice.paidAt && <p className="text-sm text-green-700 mt-1">Paid {new Date(invoice.paidAt).toLocaleDateString()}</p>}
          </div>
        ) : isCancelled ? (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-5 text-center">
            <p className="font-semibold text-slate-600">This invoice has been cancelled</p>
          </div>
        ) : canPay ? (
          <button
            onClick={() => setShowPayForm(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <CreditCard className="h-5 w-5" />
            Pay {fmt(invoice.balanceCents)} online
          </button>
        ) : !invoice.organization.stripeAccountOnboarded ? (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="font-semibold text-slate-800 mb-1">Ready to pay?</p>
            <p className="text-sm text-slate-500 mb-3">Online card payment is not yet set up. Please contact us:</p>
            <div className="space-y-2">
              {invoice.organization.phone && (
                <a href={`tel:${invoice.organization.phone}`}
                  className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-blue-600">
                  <Phone className="h-4 w-4" /> {invoice.organization.phone}
                </a>
              )}
              {invoice.organization.email && (
                <a href={`mailto:${invoice.organization.email}?subject=Invoice ${invoice.invoiceNumber}`}
                  className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-blue-600">
                  <Mail className="h-4 w-4" /> {invoice.organization.email}
                </a>
              )}
            </div>
          </div>
        ) : null}

        {invoice.warrantyText && (
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-start gap-2">
            <Shield className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">Warranty</p>
              <p className="text-sm text-green-700">{invoice.warrantyText}</p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">Powered by MechanicFlow</p>
      </div>
    </div>
  );
}
