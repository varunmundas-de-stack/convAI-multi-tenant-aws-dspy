/**
 * DomainSelector — dropdown to switch between analytics domains.
 * CPG (live) and Cold Chain (coming soon / greyed out).
 * Placed in the Header next to the user's tenant name.
 */
import { useState } from "react";

const DOMAINS = [
  {
    id: "cpg",
    label: "CPG / FMCG Sales",
    description: "Secondary sales analytics — Nestlé, HUL, ITC",
    available: true,
    icon: "🛒",
  },
  {
    id: "cold_chain",
    label: "Cold Chain Supply",
    description: "Temperature-sensitive supply chain analytics (coming soon)",
    available: false,
    icon: "🧊",
  },
];

export default function DomainSelector({ currentDomain, onDomainChange }) {
  const [open, setOpen] = useState(false);
  const active = DOMAINS.find((d) => d.id === currentDomain) || DOMAINS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                   bg-white/10 hover:bg-white/20 text-white text-sm
                   border border-white/20 transition-colors"
      >
        <span>{active.icon}</span>
        <span className="font-medium">{active.label}</span>
        <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-72 rounded-xl shadow-2xl
                        bg-white border border-gray-100 z-50 overflow-hidden">
          {DOMAINS.map((domain) => (
            <button
              key={domain.id}
              disabled={!domain.available}
              onClick={() => {
                if (domain.available) {
                  onDomainChange(domain.id);
                  setOpen(false);
                }
              }}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors
                ${domain.available
                  ? "hover:bg-indigo-50 cursor-pointer"
                  : "opacity-50 cursor-not-allowed bg-gray-50"
                }
                ${currentDomain === domain.id ? "bg-indigo-50 border-l-4 border-indigo-500" : ""}
              `}
            >
              <span className="text-xl mt-0.5">{domain.icon}</span>
              <div>
                <div className="font-medium text-gray-900 text-sm flex items-center gap-2">
                  {domain.label}
                  {!domain.available && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-normal">
                      Coming Soon
                    </span>
                  )}
                  {currentDomain === domain.id && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-normal">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{domain.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* click-away overlay */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
