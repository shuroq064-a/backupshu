"use client";
import { useState } from "react";
import { bookingApi } from "@/lib/api";

interface ReviewFormProps {
  bookingId: string;
  bookingNumber: string;
  serviceType: string;
  specialistName: string;
  onSuccess: () => void;
  onSkip: () => void;
}

export function ReviewForm({ bookingId, bookingNumber, serviceType, specialistName, onSuccess, onSkip }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (rating === 0) { setError("Please select a rating."); return; }
    if (!feedback.trim()) { setError("Please write a short review."); return; }
    setIsSubmitting(true);
    setError("");
    try {
      await bookingApi.submitReview(bookingId, rating, feedback);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-primary to-primary-container px-6 py-6 text-center">
          <div className="text-3xl mb-2">⭐</div>
          <h2 className="text-white font-bold text-lg">Rate your experience</h2>
          <p className="text-teal-100 text-sm mt-1">{specialistName} · {serviceType}</p>
          <p className="text-teal-200 text-xs mt-1">{bookingNumber}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Stars */}
          <div className="text-center">
            <div className="flex justify-center gap-2 mb-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => { setRating(star); setError(""); }}
                  className="text-3xl transition-transform hover:scale-110"
                >
                  {star <= (hover || rating) ? "⭐" : "â˜†"}
                </button>
              ))}
            </div>
            {(hover || rating) > 0 && (
              <p className="text-sm font-semibold text-amber-500">{labels[hover || rating]}</p>
            )}
          </div>

          {/* Feedback */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Your Review</label>
            <textarea
              value={feedback}
              onChange={(e) => { setFeedback(e.target.value); setError(""); }}
              placeholder="Describe your experience with this specialist..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onSkip} className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50">
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 py-3 bg-primary hover:bg-primary-container text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Submit Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
