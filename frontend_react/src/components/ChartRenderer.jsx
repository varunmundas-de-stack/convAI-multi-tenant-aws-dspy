import { useEffect, useState, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Table2,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";
import TableRenderer from "./TableRenderer";

// ─── Utilities ────────────────────────────────────────────────────────────────

function cleanColumnName(col) {
  if (!col) return "Value";
  let cleaned = col;
  const prefixes = [
    "fact_secondary_sales.", "fact_primary_sales.",
    "fact secondary sales.", "fact primary sales.",
    "dim_product.", "dim_region.", "dim_time.", "fact_", "dim_",
  ];
  for (const prefix of prefixes) {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleaned = cleaned.substring(prefix.length);
      break;
    }
  }
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    cleaned = parts[parts.length - 1];
  }
  return cleaned.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatNumber(value) {
  if (value >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value % 1 !== 0) return value.toFixed(2);
  return value.toString();
}

function formatCellValue(value, isPrice = false) {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    try {
      return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return String(value); }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return String(value); }
  }
  if (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "") value = Number(value);
  if (typeof value === "number") {
    const prefix = isPrice ? "₹ " : "";
    if (Number.isInteger(value) || Math.abs(value) > 100)
      return prefix + value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    return prefix + value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

function isNumericColumn(rows, col) {
  return rows.slice(0, 5).map(r => r[col]).filter(v => v != null)
    .some(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v.trim() !== ""));
}

function isPriceColumn(col) {
  if (!col) return false;
  const lower = col.toLowerCase();
  if (lower.includes("qty") || lower.includes("quantity") || lower.includes("volume") || lower.includes("count")) return false;
  return lower.includes("sales") || lower.includes("value") || lower.includes("revenue") ||
    lower.includes("amount") || lower.includes("price") || lower.includes("cost") || lower.includes("margin");
}

function isSeriesConfig(s) {
  return "key" in s && typeof s.key === "string";
}

const dateTickFormatter = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    try { return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
    catch { return value; }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try { return new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
    catch { return value; }
  }
  return value;
};

const TIME_GRAN = new Set(["day", "week", "month", "quarter", "year"]);
function deduplicateTimeColumns(columns) {
  const shadowed = new Set();
  for (const col of columns) {
    const lastDot = col.lastIndexOf(".");
    if (lastDot === -1) continue;
    if (TIME_GRAN.has(col.substring(lastDot + 1))) shadowed.add(col.substring(0, lastDot));
  }
  return shadowed.size === 0 ? columns : columns.filter(col => !shadowed.has(col));
}

// ─── Inline table for Chart→Table toggle ─────────────────────────────────────

function InlineTable({ columns: rawColumns, rows }) {
  const columns = deduplicateTimeColumns(rawColumns || []);
  const numericCols = new Set(columns.filter(c => isNumericColumn(rows, c)));
  const [view, setView] = useState("flat");

  if (!columns.length) return null;

  // Build pivot state at top level
  const categoricalCols = columns.filter(c => !isNumericColumn(rows, c));
  const numCols = columns.filter(c => isNumericColumn(rows, c));
  const [rowDim, setRowDim] = useState(categoricalCols[0] ?? columns[0] ?? "");
  const [colDim, setColDim] = useState(categoricalCols[1] ?? categoricalCols[0] ?? columns[0] ?? "");
  const [valMetric, setValMetric] = useState(numCols[0] ?? columns[columns.length - 1] ?? "");

  const { rowKeys, colKeys, matrix } = useMemo(() => {
    const rkSet = new Set(); const ckSet = new Set(); const cells = {};
    for (const row of rows) {
      const rk = String(row[rowDim] ?? "–"); const ck = String(row[colDim] ?? "–");
      const num = parseFloat(row[valMetric]);
      rkSet.add(rk); ckSet.add(ck);
      if (!cells[rk]) cells[rk] = {};
      if (!cells[rk][ck]) cells[rk][ck] = [];
      if (!isNaN(num)) cells[rk][ck].push(num);
    }
    const rowKeys = Array.from(rkSet).sort(); const colKeys = Array.from(ckSet).sort();
    const matrix = {};
    for (const rk of rowKeys) { matrix[rk] = {}; for (const ck of colKeys) { const v = cells[rk]?.[ck]; matrix[rk][ck] = v?.length ? v.reduce((a, b) => a + b, 0) : null; } }
    return { rowKeys, colKeys, matrix };
  }, [rows, rowDim, colDim, valMetric]);

  const rowTotals = rowKeys.map(rk => colKeys.reduce((s, ck) => s + (matrix[rk][ck] ?? 0), 0));
  const colTotals = colKeys.map(ck => rowKeys.reduce((s, rk) => s + (matrix[rk][ck] ?? 0), 0));
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);
  const maxVal = Math.max(...rowTotals, 1);
  const heat = (v) => { if (!v) return ""; const p = (v / maxVal) * 100; return p > 80 ? "bg-blue-100 text-blue-900" : p > 50 ? "bg-blue-50 text-blue-800" : p > 20 ? "bg-sky-50 text-sky-700" : ""; };
  const isPrice = isPriceColumn(valMetric);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{rows.length} rows</span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setView("flat")} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${view === "flat" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
            Flat
          </button>
          {columns.length > 2 && (
            <button onClick={() => setView("pivot")} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${view === "pivot" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
              Pivot
            </button>
          )}
        </div>
      </div>
      {view === "flat" ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} className={`px-4 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase border-b border-gray-200 ${numericCols.has(col) ? "text-right" : "text-left"}`}>
                      {cleanColumnName(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, ri) => (
                  <tr key={ri} className={`${ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/40`}>
                    {columns.map((col, ci) => (
                      <td key={ci} className={`px-4 py-2.5 text-gray-800 ${numericCols.has(col) ? "text-right font-mono tabular-nums" : "text-left"}`}>
                        {formatCellValue(row[col], isPriceColumn(col))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 px-1">
            {[["Rows", rowDim, setRowDim], ["Columns", colDim, setColDim], ["Values", valMetric, setValMetric]].map(([label, val, setter]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
                <select value={val} onChange={e => setter(e.target.value)} className="appearance-none w-36 pl-2 pr-6 py-1 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer">
                  {columns.map(o => <option key={o} value={o}>{cleanColumnName(o)}</option>)}
                </select>
              </div>
            ))}
          </div>
          {rowDim === colDim ? (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Choose different row and column fields for a meaningful pivot.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="min-w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500 border-r border-gray-200 min-w-[120px]">
                        {cleanColumnName(rowDim)} / {cleanColumnName(colDim)}
                      </th>
                      {colKeys.map(ck => <th key={ck} className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gray-500 whitespace-nowrap">{ck}</th>)}
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gray-700 bg-gray-100 border-l border-gray-200">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rowKeys.map((rk, ri) => (
                      <tr key={rk} className={`hover:bg-blue-50/30 ${ri % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-4 py-2.5 text-left font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap">{rk}</td>
                        {colKeys.map(ck => { const v = matrix[rk][ck]; return <td key={ck} className={`px-3 py-2.5 text-right tabular-nums font-mono ${heat(v)}`}>{v !== null ? formatCellValue(v, isPrice) : "–"}</td>; })}
                        <td className="px-3 py-2.5 text-right tabular-nums font-mono font-semibold text-gray-800 bg-gray-50 border-l border-gray-200">{formatCellValue(rowTotals[ri], isPrice)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold text-gray-800">
                      <td className="px-4 py-2.5 text-xs uppercase border-r border-gray-200">Total</td>
                      {colTotals.map((t, i) => <td key={i} className="px-3 py-2.5 text-right tabular-nums font-mono">{formatCellValue(t, isPrice)}</td>)}
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-blue-700 bg-blue-50 border-l border-gray-200">{formatCellValue(grandTotal, isPrice)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chart renderers ──────────────────────────────────────────────────────────

function BarChartRenderer({ spec }) {
  const rawSeries = spec.series?.[0];
  const series = rawSeries && !isSeriesConfig(rawSeries) ? rawSeries : null;
  const xLabels = spec.x_axis?.values || [];
  const yValues = series?.values || [];
  const pointColors = series?.point_colors || [];
  if (yValues.length === 0) return null;
  const data = yValues.map((value, idx) => ({ name: xLabels[idx] || String(idx), value: typeof value === "number" ? value : 0, color: pointColors[idx] || "#3b82f6" }));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 w-full">
      {spec.primary_value && (
        <div className="mb-2 flex items-baseline gap-4">
          <div><p className="text-xs text-gray-500">{spec.primary_label}</p><p className="text-2xl font-bold text-gray-900">{spec.primary_value}</p></div>
          {spec.secondary_value && <div><p className="text-xs text-gray-500">{spec.secondary_label}</p><p className="text-lg font-semibold text-gray-700">{spec.secondary_value}</p></div>}
        </div>
      )}
      <div className="h-[380px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 32, right: 24, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} tickMargin={20} angle={-40} textAnchor="end" height={40} interval={0} tickFormatter={dateTickFormatter} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(val) => formatNumber(val)} width={80} axisLine={false} tickLine={false} />
            <RechartsTooltip formatter={(value) => [formatNumber(Number(value)), spec.y_axis?.label || "Value"]} cursor={{ fill: "rgba(59,130,246,0.05)" }} labelStyle={{ color: "#111827", fontWeight: 600 }} contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: "13px" }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
              {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
            </Bar>
            {spec.markers?.filter(m => m.marker_type === "threshold").map((marker, idx) => (
              <ReferenceLine key={idx} y={marker.value} stroke="#ef4444" strokeDasharray="5 3" label={{ position: "insideTopLeft", value: marker.label, fill: "#ef4444", fontSize: 11 }} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LineChartRenderer({ spec }) {
  const rawSeries = spec.series?.[0];
  const series = rawSeries && !isSeriesConfig(rawSeries) ? rawSeries : null;
  const xLabels = spec.x_axis?.values || [];
  const yValues = series?.values || [];
  if (yValues.length === 0) return null;
  const lineColor = series?.color_hint === "positive" ? "#10b981" : series?.color_hint === "negative" ? "#ef4444" : "#3b82f6";
  const data = yValues.map((value, idx) => ({ name: xLabels[idx] || String(idx), value: typeof value === "number" ? value : 0 }));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 w-full">
      {spec.primary_value && (
        <div className="mb-2"><p className="text-xs text-gray-500">{spec.primary_label}</p><p className="text-2xl font-bold text-gray-900">{spec.primary_value}</p></div>
      )}
      <div className="h-[380px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 32, right: 24, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} tickMargin={20} angle={-40} textAnchor="end" height={40} interval={0} tickFormatter={dateTickFormatter} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(val) => formatNumber(val)} width={80} axisLine={false} tickLine={false} />
            <RechartsTooltip formatter={(value) => [formatNumber(Number(value)), spec.y_axis?.label || "Value"]} labelStyle={{ color: "#111827", fontWeight: 600 }} contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: "13px" }} />
            <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: lineColor }} />
            {spec.markers?.filter(m => m.marker_type === "threshold").map((marker, idx) => (
              <ReferenceLine key={idx} y={marker.value} stroke="#ef4444" strokeDasharray="5 3" label={{ position: "insideTopLeft", value: marker.label, fill: "#ef4444", fontSize: 11 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PieChartRenderer({ spec }) {
  const rawSeries = spec.series?.[0];
  const series = rawSeries && !isSeriesConfig(rawSeries) ? rawSeries : null;
  const labels = spec.x_axis?.values || [];
  const values = series?.values || [];
  if (values.length === 0) return null;
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
  const data = values.map((value, idx) => ({ name: labels[idx] || `Segment ${idx + 1}`, value: typeof value === "number" ? value : 0, color: colors[idx % colors.length] }));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 w-full">
      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div className="h-[320px] w-full md:w-[320px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <RechartsTooltip formatter={(value) => [formatNumber(Number(value)), ""]} contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: "13px" }} />
              <Pie data={data} cx="50%" cy="50%" labelLine={false} outerRadius="80%" innerRadius="45%" dataKey="value" paddingAngle={2}>
                {data.map((entry, idx) => <Cell key={`cell-${idx}`} fill={entry.color} stroke="none" />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2.5 min-w-0">
          {data.map((slice, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800 truncate">{slice.name}</p></div>
              <p className="text-sm font-mono text-gray-500 flex-shrink-0">{formatNumber(slice.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Multi-series chart renderer (grouped_bar, stacked_bar, multi_line)
function RechartsRenderer({ spec }) {
  if (!spec.data || spec.data.length === 0) return null;
  const data = spec.data;
  const xAxisKey = spec.x_axis_key || "label";
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

  // Find actual column matching x_axis_key (handles Cube.js prefixed names)
  const actualXAxisKey = (() => {
    if (!data.length) return xAxisKey;
    const keys = Object.keys(data[0]);
    if (keys.includes(xAxisKey)) return xAxisKey;
    return keys.find(k => k.endsWith(`.${xAxisKey}`) || k === xAxisKey) || xAxisKey;
  })();

  const seriesConfigs = spec.series?.filter(s => isSeriesConfig(s)) || [];
  const seriesKeys = seriesConfigs.length > 0
    ? seriesConfigs.map(s => s.key)
    : Object.keys(data[0] || {}).filter(k => k !== actualXAxisKey);

  const commonMargin = { top: 32, right: 24, left: 0, bottom: 48 };
  const commonXAxisProps = {
    dataKey: actualXAxisKey,
    tick: { fontSize: 11, fill: "#9ca3af" },
    tickMargin: 24,
    angle: -40,
    textAnchor: "end",
    height: 48,
    interval: 0,
    tickFormatter: dateTickFormatter,
  };
  const commonYAxisProps = {
    tick: { fontSize: 11, fill: "#9ca3af" },
    tickFormatter: (val) => formatCellValue(val, false),
    width: 80,
    axisLine: false,
    tickLine: false,
  };
  const commonTooltip = (
    <RechartsTooltip
      formatter={(value) => formatCellValue(Number(value), false)}
      labelStyle={{ color: "#111827", fontWeight: 600 }}
      contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: "13px" }}
    />
  );

  const chartBody = (() => {
    if (spec.chart_type === "multi_line") {
      return (
        <LineChart data={data} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis {...commonXAxisProps} />
          <YAxis {...commonYAxisProps} />
          {commonTooltip}
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
          {seriesKeys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={false}
              name={seriesConfigs[i]?.label || cleanColumnName(key)} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      );
    }
    if (spec.chart_type === "stacked_bar") {
      return (
        <BarChart data={data} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis {...commonXAxisProps} />
          <YAxis {...commonYAxisProps} />
          {commonTooltip}
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
          {seriesKeys.map((key, i) => (
            <Bar key={key} dataKey={key} stackId="a" fill={colors[i % colors.length]} radius={i === seriesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              name={seriesConfigs[i]?.label || cleanColumnName(key)} />
          ))}
        </BarChart>
      );
    }
    // grouped_bar (default)
    return (
      <BarChart data={data} margin={commonMargin}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis {...commonXAxisProps} />
        <YAxis {...commonYAxisProps} />
        {commonTooltip}
        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
        {seriesKeys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} maxBarSize={32}
            name={seriesConfigs[i]?.label || cleanColumnName(key)} />
        ))}
      </BarChart>
    );
  })();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 w-full">
      {spec.primary_value && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{spec.primary_label || "Total"}</p>
          <p className="text-2xl font-bold text-gray-900">{spec.primary_value}</p>
        </div>
      )}
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">{chartBody}</ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Compound sections renderer ───────────────────────────────────────────────

function CompoundSectionsRenderer({ spec }) {
  const isPartial = spec.chart_type === "compound_sections_partial";
  const { sections = [], completed_sections = 0, pending_sections = 0, total_sections = 0 } = spec;
  return (
    <div className="flex flex-col gap-6 mt-4">
      {isPartial && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-blue-900">Progress: {completed_sections} of {total_sections} sections complete</h4>
            <div className="text-xs text-blue-600">{pending_sections} pending</div>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(completed_sections / total_sections) * 100}%` }} />
          </div>
        </div>
      )}
      {sections.map((section, idx) => {
        const status = section.status || "completed";
        const isCompleted = status === "completed";
        return (
          <div key={idx} className={`border rounded-xl overflow-hidden shadow-sm bg-white ${!isCompleted ? "border-yellow-200 bg-yellow-50" : "border-gray-200"}`}>
            <div className={`border-b px-4 py-3 ${!isCompleted ? "bg-yellow-100 border-yellow-200" : "bg-gray-50 border-gray-200"}`}>
              <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${isCompleted ? "bg-green-100 text-green-700" : status === "clarifying" ? "bg-yellow-100 text-yellow-700" : status === "error" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                  {isCompleted ? "✓" : status === "clarifying" ? "?" : status === "error" ? "✗" : idx + 1}
                </span>
                {section.subquery_text}
              </h4>
              {!isCompleted && status === "clarifying" && (
                <span className="mt-1 inline-flex items-center gap-1 px-2 py-1 bg-yellow-200 text-yellow-800 rounded-full text-xs">
                  <div className="w-2 h-2 bg-yellow-600 rounded-full animate-pulse" /> Needs clarification
                </span>
              )}
            </div>
            <div className="p-4">
              {isCompleted && section.visual_spec ? (
                <ChartRenderer visual_spec={section.visual_spec} />
              ) : !isCompleted ? (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm">Processing...</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-400"><p className="text-sm">No data available</p></div>
              )}
            </div>
          </div>
        );
      })}
      {isPartial && pending_sections > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-600">{completed_sections > 0 && "Partial results shown above. "}{pending_sections} section{pending_sections !== 1 ? "s" : ""} still processing...</p>
        </div>
      )}
    </div>
  );
}

// ─── Annotations block ────────────────────────────────────────────────────────

function AnnotationsBlock({ annotations }) {
  if (!annotations || annotations.length === 0) return null;
  const getSeverityStyles = (sev) => {
    if (sev === "critical") return "bg-red-50 border-red-300 text-red-900";
    if (sev === "high") return "bg-orange-50 border-orange-300 text-orange-900";
    if (sev === "medium") return "bg-yellow-50 border-yellow-300 text-yellow-900";
    return "bg-gray-50 border-gray-300 text-gray-700";
  };
  return (
    <div className="space-y-2 mt-2">
      {annotations.map((ann, i) => (
        <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${getSeverityStyles(ann.severity)}`}>
          <span className="mt-0.5 font-bold">{ann.direction === "up" ? "▲" : ann.direction === "down" ? "▼" : "●"}</span>
          <span>{ann.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main ChartRenderer ───────────────────────────────────────────────────────

export default function ChartRenderer({ visual_spec, refined_insights }) {
  const [isClient, setIsClient] = useState(false);
  const [viewMode, setViewMode] = useState("chart");

  useEffect(() => { setIsClient(true); }, []);

  // Build table data for chart→table view toggle
  const tableData = useMemo(() => {
    if (!visual_spec) return { columns: [], rows: [] };
    if (visual_spec.columns && visual_spec.rows && visual_spec.rows.length > 0)
      return { columns: visual_spec.columns, rows: visual_spec.rows };
    if (visual_spec.chart_type === "table" && visual_spec.columns && visual_spec.rows)
      return { columns: visual_spec.columns, rows: visual_spec.rows };
    const xLabels = visual_spec.x_axis?.values ?? [];
    const series = visual_spec.series ?? [];
    if (xLabels.length === 0 && series.length === 0) return { columns: [], rows: [] };
    const columns = [visual_spec.x_axis?.label || "Category", ...series.map(s => s.label || "Value")];
    const rows = xLabels.map((label, i) => {
      const row = { [columns[0]]: label };
      series.forEach((s, si) => { row[columns[si + 1]] = !isSeriesConfig(s) ? (s.values?.[i] ?? null) : null; });
      return row;
    });
    return { columns, rows };
  }, [visual_spec]);

  if (!isClient) return <div className="bg-white p-6 rounded-lg border border-gray-200 h-[200px] flex items-center justify-center"><p className="text-gray-400 text-sm">Loading chart...</p></div>;
  if (!visual_spec) return <div className="bg-white p-4 rounded-lg border border-gray-200"><p className="text-gray-400 text-sm">No visualization data available</p></div>;
  if (visual_spec.empty) return <div className="bg-white p-4 rounded-lg border border-gray-200"><p className="text-gray-400 text-sm">No data returned for this query</p></div>;

  const { chart_type, title, subtitle, primary_value, primary_label, secondary_value, secondary_label, direction, trend_slope } = visual_spec;
  const isChartable = !["number_card", "table", "compound_sections", "compound_sections_partial"].includes(chart_type);

  const keyRisks = Object.entries(refined_insights?.key_risks || {});
  const possibleDrivers = Object.entries(refined_insights?.possible_drivers || {});
  const recommendations = Object.entries(refined_insights?.recommendations || {});

  return (
    <div className="space-y-4">

      {/* Executive Summary */}
      {refined_insights?.executive_summary && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-xs font-bold text-blue-900 mb-2 uppercase tracking-wide">Executive Summary</h4>
          <p className="text-sm text-blue-800 leading-relaxed font-medium">{refined_insights.executive_summary}</p>
        </div>
      )}

      {/* Narrative panels: Risks / Drivers / Recommendations */}
      {(keyRisks.length > 0 || possibleDrivers.length > 0 || recommendations.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {keyRisks.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-red-800 mb-3 uppercase tracking-wide">⚠️ Key Risks</h4>
              <ul className="space-y-2">
                {keyRisks.map(([k, v]) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="text-sm text-red-900 leading-snug">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {possibleDrivers.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-amber-800 mb-3 uppercase tracking-wide">🔍 Possible Drivers</h4>
              <ul className="space-y-2">
                {possibleDrivers.map(([k, v]) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-sm text-amber-900 leading-snug">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-green-800 mb-3 uppercase tracking-wide">✅ Recommendations</h4>
              <ul className="space-y-2">
                {recommendations.map(([k, v]) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-sm text-green-900 leading-snug">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Chart ↔ Table toggle */}
      {isChartable && (
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("chart")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${viewMode === "chart" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <BarChart2 className="h-3.5 w-3.5" /> Chart
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${viewMode === "table" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" && isChartable ? (
        tableData.rows.length > 0
          ? <InlineTable columns={tableData.columns} rows={tableData.rows} />
          : <div className="bg-white p-4 rounded-lg border border-gray-200 text-center text-gray-500 text-sm">No tabular data for this chart.</div>
      ) : (
        <>
          {/* Number card */}
          {chart_type === "number_card" && primary_value && (
            <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50/80 rounded-2xl border border-blue-100 shadow-sm p-6 overflow-hidden">
              <div className="absolute -top-6 -right-6 text-blue-600/5 pointer-events-none">
                {direction === "up" ? <TrendingUp className="w-40 h-40" /> : direction === "down" ? <TrendingDown className="w-40 h-40" /> : <BarChart2 className="w-40 h-40" />}
              </div>
              <div className="relative z-10 flex flex-col gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-blue-700/80 uppercase tracking-wider">{primary_label || "Value"}</p>
                  <div className="flex flex-wrap items-baseline gap-4">
                    <p className="text-5xl font-extrabold text-blue-950 tracking-tight">{primary_value}</p>
                    {direction && direction !== "unknown" && trend_slope !== undefined && (
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm border ${direction === "up" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : direction === "down" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                        {direction === "up" && <TrendingUp className="h-4 w-4 stroke-[2.5]" />}
                        {direction === "down" && <TrendingDown className="h-4 w-4 stroke-[2.5]" />}
                        {direction === "flat" && <Minus className="h-4 w-4 stroke-[2.5]" />}
                        <span>{Math.abs(trend_slope).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                </div>
                {secondary_value && (
                  <div className="pt-4 border-t border-blue-200/50">
                    <p className="text-xs font-semibold text-blue-800/60 uppercase tracking-widest">{secondary_label || "Secondary"}</p>
                    <p className="text-2xl font-bold text-blue-900">{secondary_value}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chart */}
          {chart_type === "table" && visual_spec.columns && visual_spec.rows ? (
            <TableRenderer data={{ type: "table", columns: visual_spec.columns, rows: visual_spec.rows }} />
          ) : chart_type === "grouped_bar" || chart_type === "stacked_bar" || chart_type === "multi_line" ? (
            <RechartsRenderer spec={visual_spec} />
          ) : chart_type === "bar" || chart_type === "horizontal_bar" ? (
            <BarChartRenderer spec={visual_spec} />
          ) : chart_type === "line" ? (
            <LineChartRenderer spec={visual_spec} />
          ) : chart_type === "pie" ? (
            <PieChartRenderer spec={visual_spec} />
          ) : chart_type === "compound_sections" || chart_type === "compound_sections_partial" ? (
            <CompoundSectionsRenderer spec={visual_spec} />
          ) : chart_type !== "number_card" && chart_type ? (
            <div className="bg-white p-2 rounded-lg border border-gray-200">
              <p className="text-gray-500 text-sm">Unsupported chart type: {chart_type}</p>
            </div>
          ) : null}

          {/* Insight annotations */}
          <AnnotationsBlock annotations={visual_spec.annotations} />
        </>
      )}
    </div>
  );
}
