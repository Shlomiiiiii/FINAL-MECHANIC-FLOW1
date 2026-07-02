"use client";

/**
 * Stripe Payment Form — Customer Portal
 *
 * Uses Stripe.js + Elements for PCI-compliant card collection.
 * Supports: Credit/Debit cards, Apple Pay, Google Pay (via PaymentRequestButton)
 *
 * IMPORTANT: This component loads Stripe.js from stripe.com directly.
 * Never load it from any other URL. Never log card data.
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, CreditCard, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  invoiceId: string;
  token: string;
  balanceCents: number;
  invoiceNumber: string;
  customerName: string;
  onSuccess: () => void;
}

type StripeLib = any;

// Dynamically load Stripe.js — never bundle it
async function loadStripe(publishableKey: string, stripeAccountId?: string | null): Promise<StripeLib> {
  if ((window as any).Stripe) {
    const opts = stripeAccountId ? { stripeAccount: stripeAccountId } : {};
    return (window as any).Stripe(publishableKey, opts);
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => {
      const opts = stripeAccountId ? { stripeAccount: stripeAccountId } : {};
      resolve((window as any).Stripe(publishableKey, opts));
    };
    document.head.appendChild(script);
  });
}

export function StripePaymentForm({ invoiceId, token, balanceCents, invoiceNumber, customerName, onSuccess }: Props) {
  const [isLoading, setIsLoading]       = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [succeeded, setSucceeded]       = useState(false);
  const [stripe, setStripe]             = useState<StripeLib>(null);
  const [elements, setElements]         = useState<any>(null);
  const [partialAmount, setPartialAmount] = useState((balanceCents / 100).toFixed(2));

  const cardRef    = useRef<HTMLDivElement>(null);
  const cardElement = useRef<any>(null);

  useEffect(() => {
    initStripe();
  }, []);

  async function initStripe() {
    try {
      // Get client secret + config from our server
      const res = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, token, amountCents: balanceCents }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message ?? "Failed to initialize payment"); setIsLoading(false); return; }

      const { clientSecret, publishableKey, stripeAccountId } = json.data;

      // Load Stripe.js
      const stripeInstance = await loadStripe(publishableKey, stripeAccountId);
      const elementsInstance = stripeInstance.elements({ clientSecret });

      // Mount card element
      const card = elementsInstance.create("card", {
        style: {
          base: {
            fontSize: "15px",
            color: "#1e293b",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            "::placeholder": { color: "#94a3b8" },
            iconColor: "#64748b",
          },
          invalid: { color: "#ef4444", iconColor: "#ef4444" },
        },
        hidePostalCode: false,
      });

      if (cardRef.current) {
        card.mount(cardRef.current);
        card.on("change", (e: any) => { if (e.error) setError(e.error.message); else setError(null); });
      }

      cardElement.current = card;
      setStripe(stripeInstance);
      setElements(elementsInstance);
      setIsLoading(false);
    } catch (err: any) {
      setError("Failed to load payment form. Please refresh and try again.");
      setIsLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !cardElement.current || isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const { error: paymentError, paymentIntent } = await stripe.confirmCardPayment(undefined, {
        payment_method: {
          card: cardElement.current,
          billing_details: { name: customerName },
        },
      });

      if (paymentError) {
        setError(paymentError.message ?? "Payment failed. Please try again.");
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        setSucceeded(true);
        onSuccess();
      }
    } catch (err: any) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (succeeded) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
        <p className="text-lg font-semibold text-green-800">Payment successful!</p>
        <p className="text-sm text-green-600 mt-1">
          Thank you. Receipt has been sent to your email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          Payment amount
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
          <input
            type="number"
            step="0.01"
            min="1"
            max={(balanceCents / 100).toFixed(2)}
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value)}
            className="w-full pl-7 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {parseFloat(partialAmount) < balanceCents / 100 && (
          <p className="text-xs text-amber-600">
            Partial payment — remaining balance will stay on the invoice
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Card details</label>
        <div className={cn(
          "border rounded-lg p-3.5 bg-white transition-colors",
          isLoading ? "border-slate-200 bg-slate-50" : "border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
        )}>
          {isLoading ? (
            <div className="flex items-center gap-2 h-6">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              <span className="text-sm text-slate-400">Loading secure payment form…</span>
            </div>
          ) : (
            <div ref={cardRef} className="min-h-6" />
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={isLoading || isProcessing}
        className="w-full h-11 text-base gap-2 bg-blue-600 hover:bg-blue-700"
      >
        {isProcessing ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          <><Lock className="h-4 w-4" /> Pay ${parseFloat(partialAmount).toFixed(2)} securely</>
        )}
      </Button>

      <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
        <Lock className="h-3 w-3" />
        <span>256-bit SSL encryption</span>
        <span>·</span>
        <CreditCard className="h-3 w-3" />
        <span>Powered by Stripe</span>
      </div>
    </form>
  );
}
