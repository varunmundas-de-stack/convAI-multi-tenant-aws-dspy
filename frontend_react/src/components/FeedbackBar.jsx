import { useState } from "react";
import { Star, ThumbsUp, ThumbsDown, Check, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { submitFeedback } from "../api/client";
import RetryModal from "./RetryModal";

export default function FeedbackBar({
  requestId,
  query,
  promptVersion,
  abGroup,
  responseSummary,
  fullResponse,
  sqlQuery,
  originalQuery,
  onRetry,
}) {
  const [phase, setPhase] = useState("idle"); // idle | rating | submitted | retrying
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);

  async function handleSubmit() {
    if (rating === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitFeedback({
        request_id: requestId,
        query,
        response_summary: (responseSummary || "").slice(0, 500),
        prompt_version: promptVersion || "v1",
        rating,
        ab_group: abGroup || null,
        correction: correction.trim() || null,
        full_response: fullResponse || null,
        sql_query: sqlQuery || null,
      });
      setPhase("submitted");
    } catch (err) {
      console.error("Feedback submission failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleThumb(direction) {
    setRating(direction === "up" ? 4 : 2);
    setPhase("rating");
  }

  function handleRetryClick() {
    if (!onRetry) return;
    setShowRetryModal(true);
  }

  async function handleRetrySubmit(modifiedQuery) {
    if (!onRetry) return;
    setShowRetryModal(false);
    setPhase("retrying");
    try {
      await onRetry(modifiedQuery);
      setPhase("idle");
    } catch {
      setPhase("idle");
    }
  }

  if (phase === "submitted") {
    return (
      <div className="flex items-center gap-1.5 mt-3 text-green-600 text-xs">
        <Check size={14} strokeWidth={2.5} />
        <span>Thanks for your feedback</span>
      </div>
    );
  }

  if (phase === "retrying") {
    return (
      <div className="flex items-center gap-1.5 mt-3 text-blue-600 text-xs">
        <RotateCcw size={14} className="animate-spin" strokeWidth={2.5} />
        <span>Processing retry...</span>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => handleThumb("up")}
            className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
            title="Good response"
          >
            <ThumbsUp size={14} />
          </button>
          <button
            onClick={() => handleThumb("down")}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Bad response"
          >
            <ThumbsDown size={14} />
          </button>
          {onRetry && (
            <button
              onClick={handleRetryClick}
              className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Retry with different query"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
        <RetryModal
          isOpen={showRetryModal}
          originalQuery={originalQuery || query}
          onSubmit={handleRetrySubmit}
          onCancel={() => setShowRetryModal(false)}
        />
      </>
    );
  }

  // Rating phase
  return (
    <div className="mt-3 space-y-2">
      {/* Star rating */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredStar(star)}
            onMouseLeave={() => setHoveredStar(0)}
            className="p-0.5 transition-colors"
          >
            <Star
              size={16}
              className={
                star <= (hoveredStar || rating)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300"
              }
            />
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-1">
          {rating > 0 ? `${rating}/5` : "Rate this response"}
        </span>
      </div>

      {/* Correction toggle */}
      <button
        onClick={() => setShowCorrection(!showCorrection)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        {showCorrection ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showCorrection ? "Hide correction" : "Correct this response"}
      </button>

      {showCorrection && (
        <textarea
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          placeholder="How should this response be improved?"
          className="w-full text-xs border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:border-gray-400 text-gray-700"
          rows={3}
        />
      )}

      {/* Submit */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || isSubmitting}
          className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
        <button
          onClick={() => { setPhase("idle"); setRating(0); }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
