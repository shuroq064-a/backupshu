"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { paymentApi } from "@/lib/api";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PaymentModalProps {
  bookingId: string;
  bookingNumber: string;
  serviceType: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PaymentModal({ bookingId, bookingNumber, serviceType, amount, onSuccess, onCancel }: PaymentModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setIsProcessing(true);
    setError("");

    try {
      // Step 1: Create order from backend
      const order = await paymentApi.createOrder(bookingId);

      // Step 2: Check Razorpay script loaded
      if (!window.Razorpay) {
        throw new Error("Payment system failed to load. Please refresh and try again.");
      }

      // Step 3: Open Razorpay checkout
      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "ShuroqX",
        description: `Payment for ${serviceType} — ${bookingNumber}`,
        order_id: order.orderId,
        handler: async function (response: any) {
          // Step 3: Verify payment server-side
          try {
            await paymentApi.verify(
              bookingId,
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature,
            );
            onSuccess();
          } catch (err) {
            setError("Payment was received but verification failed. Please contact support.");
            setIsProcessing(false);
          }
        },
        prefill: {
          name: "",
          email: "",
          contact: "",
        },
        theme: {
          color: "#00897B",
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        setError(response.error?.description || "Payment failed. Please try again.");
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate payment.");
      setIsProcessing(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] p-4 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center">
        <div className="bg-surface-container-lowest rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl my-8">

          {/* Header */}
          <div className="bg-gradient-to-br from-primary to-primary-container px-6 py-6 text-center">
            <div className="text-3xl mb-2 material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>payments</div>
            <h2 className="text-white font-bold text-lg">Complete Payment</h2>
            <p className="text-teal-100 text-sm mt-1">{serviceType}</p>
            <p className="text-teal-200 text-xs mt-1">{bookingNumber}</p>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Amount */}
            <div className="text-center">
              <p className="text-sm text-gray-500">Total Amount</p>
              <p className="text-3xl font-extrabold text-gray-900">₹{amount}</p>
            </div>

            {/* Info */}
            <div className="bg-surface-container-low rounded-xl p-3 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">info</span>
              <p className="text-xs text-gray-500 leading-relaxed">
                Payment is processed securely via Razorpay. You will receive a confirmation once the payment is successful.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-red-500 text-[18px] mt-0.5">error</span>
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>

          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={isProcessing}
              className="flex-1 py-3 bg-primary hover:bg-primary-container text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Pay ₹{amount}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
