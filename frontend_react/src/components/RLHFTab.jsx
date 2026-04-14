/**
 * RLHFTab — Admin panel for RLHF management.
 * Shows: feedback ratings over time, prompt versions, A/B test controls, refinement trigger.
 * Only visible to admin role.
 */
import { useState, useEffect } from "react";
import { apiClient } from "../api/client";

export default function RLHFTab() {
  const [activeSection, setActiveSection] = useState("feedback");
  const [versions, setVersions] = useState([]);
  const [abStatus, setAbStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchVersions();
    fetchAbStatus();
  }, []);

  const fetchVersions = async () => {
    try {
      const data = await apiClient.get("/rlhf/prompt-versions");
      setVersions(data.versions || []);
    } catch (e) {
      console.error("Failed to fetch versions", e);
    }
  };

  const fetchAbStatus = async () => {
    try {
      const data = await apiClient.get("/rlhf/ab-status");
      setAbStatus(data);
    } catch (e) {
      setAbStatus(null);
    }
  };

  const triggerRefinement = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await apiClient.post("/rlhf/run-cycle", {});
      setMessage({ type: "success", text: `Refinement complete. New version: ${data.new_version}` });
      fetchVersions();
    } catch (e) {
      setMessage({ type: "error", text: "Refinement failed: " + e.message });
    } finally {
      setLoading(false);
    }
  };

  const promoteVersion = async (versionTag) => {
    try {
      await apiClient.post("/rlhf/promote", { version_tag: versionTag });
      setMessage({ type: "success", text: `Promoted ${versionTag} to active` });
      fetchVersions();
    } catch (e) {
      setMessage({ type: "error", text: "Promote failed: " + e.message });
    }
  };

  const NAV = [
    { id: "feedback",  label: "Feedback" },
    { id: "versions",  label: "Prompt Versions" },
    { id: "ab",        label: "A/B Testing" },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">RLHF — Reinforcement Learning from Human Feedback</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage prompt versions, review feedback ratings, and run automated refinement cycles.
          </p>
        </div>

        {/* Toast */}
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium
            ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200"
                                         : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.text}
            <button onClick={() => setMessage(null)} className="ml-3 opacity-60 hover:opacity-100">×</button>
          </div>
        )}

        {/* Tab Nav */}
        <div className="flex gap-1 mb-6 bg-white p-1 rounded-xl border border-gray-200 w-fit">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveSection(n.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeSection === n.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
            >
              {n.label}
            </button>
          ))}
        </div>

        {/* ── Feedback section ── */}
        {activeSection === "feedback" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Recent Feedback</h3>
            <p className="text-sm text-gray-500">
              Feedback is collected from the chat interface (thumbs up/down and star ratings).
              Use the refinement cycle to incorporate it into a new prompt version.
            </p>
            <div className="mt-4">
              <button
                onClick={triggerRefinement}
                disabled={loading}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium
                           hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {loading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                )}
                {loading ? "Running refinement…" : "Run Refinement Cycle"}
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Collects feedback, sends to Claude for analysis, creates a new prompt version.
              </p>
            </div>
          </div>
        )}

        {/* ── Versions section ── */}
        {activeSection === "versions" && (
          <div className="space-y-3">
            {versions.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-500">
                No prompt versions yet. Run a refinement cycle to create one.
              </div>
            ) : (
              versions.map((v) => (
                <div key={v.version_tag}
                     className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{v.version_tag}</span>
                      {v.is_active && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex gap-3">
                      <span>Avg rating: {v.avg_rating ? Number(v.avg_rating).toFixed(1) : "—"} / 5</span>
                      <span>Feedback: {v.feedback_count || 0}</span>
                      <span>Created: {new Date(v.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {!v.is_active && (
                    <button
                      onClick={() => promoteVersion(v.version_tag)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700
                                 hover:bg-indigo-50 transition-colors"
                    >
                      Promote
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── A/B Testing section ── */}
        {activeSection === "ab" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">A/B Test Status</h3>
            {abStatus?.is_active ? (
              <div className="space-y-3 text-sm">
                <div className="flex gap-6">
                  <div>
                    <span className="text-gray-500">Version A:</span>{" "}
                    <span className="font-medium">{abStatus.version_a}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Version B:</span>{" "}
                    <span className="font-medium">{abStatus.version_b}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Traffic to B:</span>{" "}
                    <span className="font-medium">{Math.round((abStatus.traffic_split || 0.5) * 100)}%</span>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await apiClient.post("/rlhf/ab-stop", {});
                    fetchAbStatus();
                    setMessage({ type: "success", text: "A/B test stopped" });
                  }}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors"
                >
                  Stop A/B Test
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No active A/B test. Start one from the prompt versions tab.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
