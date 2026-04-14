/**
 * ClarificationPrompt — shown when DSPy pipeline requests clarification.
 * Renders one question per missing field; user selects/types answer.
 * On submit, calls onSubmit(answers) which hits /query/clarify.
 */
import { useState } from "react";

export default function ClarificationPrompt({ requestId, missingFields = [], message, onSubmit, onDismiss }) {
  const [answers, setAnswers] = useState({});

  const handleChange = (field, value) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ request_id: requestId, answers });
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 my-3 max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="font-medium text-amber-800 text-sm">Clarification needed</p>
          {message && <p className="text-amber-700 text-xs mt-0.5">{message}</p>}
        </div>
      </div>

      {/* Fields */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {missingFields.length > 0 ? (
          missingFields.map((field) => (
            <div key={field.name || field}>
              <label className="block text-xs font-medium text-amber-900 mb-1">
                {field.label || (field.name || field).replace(/_/g, " ")}
              </label>
              {field.options ? (
                // Multi-choice field
                <div className="flex flex-wrap gap-2">
                  {field.options.map((opt) => (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => handleChange(field.name || field, opt)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors
                        ${answers[field.name || field] === opt
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-amber-800 border-amber-300 hover:border-amber-500"
                        }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                // Free-text field
                <input
                  type="text"
                  value={answers[field.name || field] || ""}
                  onChange={(e) => handleChange(field.name || field, e.target.value)}
                  placeholder={field.placeholder || `Enter ${field.name || field}…`}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-amber-300
                             focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
              )}
            </div>
          ))
        ) : (
          // Fallback: generic text input
          <input
            type="text"
            value={answers["clarification"] || ""}
            onChange={(e) => handleChange("clarification", e.target.value)}
            placeholder="Please clarify…"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-amber-300
                       focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={Object.keys(answers).length === 0}
            className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-white font-medium
                       hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Submit answer
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-1.5 text-sm rounded-lg border border-amber-300 text-amber-700
                       hover:bg-amber-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
