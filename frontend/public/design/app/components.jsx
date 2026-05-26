// =============================================================
// Atome VoC — shared UI components (v2)
// =============================================================

const { useState, useMemo, useEffect } = React;

const cardCls = "bg-white rounded-[14px] border border-gray-200 shadow-sm";
const sectionTitleCls = "text-sm font-bold text-gray-900";
const sectionSubCls = "text-xs text-gray-500 mt-0.5";

// ---- Sidebar ---------------------------------------------------------
function Sidebar({ route, navigate }) {
  const groups = [
    { label: "Monitor", items: [
      { href: "overview", label: "Overview" },
      { href: "mentions", label: "All Posts with Filter" },
      { href: "queue",    label: "Items Needing Attention" },
    ]},
    { label: "Logic", items: [
      { href: "taxonomy",  label: "Taxonomy" },
      { href: "routing",   label: "Routing Matrix" },
      { href: "methodology", label: "Methodology" },
      { href: "rationale", label: "Logic & Rationale" },
    ]},
    { label: "Admin", items: [
      { href: "settings", label: "Settings" },
      { href: "log",      label: "Correction Log" },
    ]},
  ];

  return (
    <aside className="bg-[#141c30] px-3.5 py-5 sticky top-0 h-screen overflow-y-auto" data-screen-label="Sidebar">
      <div className="flex items-center gap-2.5 px-2 pb-4 border-b border-white/10 mb-3.5">
        <div className="w-8 h-8 rounded-lg bg-[#f0ff5f] flex items-center justify-center text-[#141c30] font-extrabold text-[15px]">A</div>
        <div>
          <div className="font-bold text-[15px] text-white leading-tight">Atome VoC</div>
          <div className="text-[11px] text-white/50">PH · Early Warning</div>
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="text-[11px] uppercase tracking-wider text-white/35 px-2 pt-3.5 pb-1.5">{g.label}</div>
          {g.items.map((item) => {
            const active = item.href === route;
            return (
              <a key={item.href} href={"#/" + item.href}
                 onClick={(e) => { e.preventDefault(); navigate(item.href); }}
                 className={"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] mb-0.5 transition-colors " +
                   (active ? "bg-[#f0ff5f]/15 text-[#f0ff5f] font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white")}>
                {item.label}
              </a>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

// ---- Topbar ----------------------------------------------------------
const PAGE_TITLES = {
  overview: "Executive Overview", mentions: "All Posts with Filter", queue: "Items Needing Attention",
  taxonomy: "Taxonomy", routing: "Routing Matrix", methodology: "Methodology",
  rationale: "Logic & Rationale", settings: "Settings", log: "Correction Log",
};

function Topbar({ route, settings }) {
  const title = PAGE_TITLES[route] || "Dashboard";
  const breadcrumb = ["settings","log"].includes(route) ? "Admin"
    : ["taxonomy","routing","methodology","rationale"].includes(route) ? "Logic" : "Monitor";
  return (
    <div className="bg-white border-b border-gray-200 px-7 py-3.5 flex items-center gap-3.5 sticky top-0 z-10">
      <div className="text-[13px] text-gray-500">
        {breadcrumb} &nbsp;/&nbsp; <strong className="text-gray-800 font-semibold">{title}</strong>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 bg-brand-50 border border-brand-300 px-2.5 py-1.5 rounded-lg text-[13px] text-brand-500 font-semibold">{settings.defaultMarket} Philippines</div>
      <div className="flex items-center gap-1.5 bg-brand-50 border border-brand-300 px-2.5 py-1.5 rounded-lg text-[13px] text-brand-500 font-semibold">{settings.defaultSource}</div>
      <div className="w-[34px] h-[34px] rounded-full bg-[#141c30] flex items-center justify-center text-[#f0ff5f] font-bold text-xs">DS</div>
    </div>
  );
}

// ---- Data freshness banner -------------------------------------------
function DataFreshnessBanner({ settings }) {
  const f = VoC.dataFreshness();
  const tone = f.state === "Fresh" ? "#10B981" : f.state === "Delayed" ? "#F59E0B" : "#DC2626";
  return (
    <div className="flex items-center gap-3 flex-wrap text-[12px] text-gray-600 mb-3.5">
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: tone }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }}></span>
        {f.state}
      </span>
      <span className="text-gray-300">·</span>
      <span>Last refresh <strong className="text-gray-800">{f.lastUpdated}</strong></span>
      <span className="text-gray-300">·</span>
      <span>Next refresh <strong className="text-gray-800">{f.nextRefresh}</strong></span>
      <span className="text-gray-300">·</span>
      <span>Market <strong className="text-gray-800">{settings.defaultMarket}</strong></span>
      <span className="text-gray-300">·</span>
      <span className="inline-flex items-center gap-1">
        Active sources:&nbsp;
        <span className="bg-gray-900 text-white px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase">X</span>
        <span className="bg-[#FF4500] text-white px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase">RD</span>
        <span className="text-gray-400 text-[11px] ml-1">(Facebook + TikTok: planned)</span>
      </span>
    </div>
  );
}

// ---- Badges ----------------------------------------------------------
const SENTIMENT_STYLES = {
  "Positive": { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
  "Negative": { bg: "#FEF2F2", text: "#991B1B", dot: "#EF4444" },
  "Neutral":  { bg: "#F3F4F6", text: "#4B5563", dot: "#9CA3AF" },
};

function SentimentBadge({ sentiment }) {
  const s = SENTIMENT_STYLES[sentiment] || SENTIMENT_STYLES["Neutral"];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full tracking-wide"
          style={{ backgroundColor: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }}></span>
      {sentiment || "Neutral"}
    </span>
  );
}

const ALERT_STATUS_STYLES = {
  "Not triggered":  { bg: "#F3F4F6", text: "#6B7280" },
  "Triggered":      { bg: "#FEF3C7", text: "#92400E" },
  "Acknowledged":   { bg: "#DBEAFE", text: "#1E40AF" },
  "Resolved":       { bg: "#D1FAE5", text: "#065F46" },
};

function AlertStatusBadge({ status }) {
  const s = ALERT_STATUS_STYLES[status] || ALERT_STATUS_STYLES["Not triggered"];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
          style={{ backgroundColor: s.bg, color: s.text }}>
      🔔 {status || "Not triggered"}
    </span>
  );
}

const LEVEL_STYLES = {
  Low:    { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
  Medium: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  High:   { bg: "#FEE2E2", text: "#991B1B", dot: "#DC2626" },
};

function EngagementBadge({ level }) {
  const s = LEVEL_STYLES[level] || LEVEL_STYLES.Low;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full tracking-wide"
          style={{ backgroundColor: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }}></span>
      {level.toUpperCase()}
    </span>
  );
}

const STATUS_STYLES = {
  "New":           { bg: "#FEE2E2", text: "#991B1B" },
  "In Review":     { bg: "#FEF3C7", text: "#92400E" },
  "Actioned":      { bg: "#DBEAFE", text: "#1E40AF" },
  "Closed":        { bg: "#D1FAE5", text: "#065F46" },
  "Rejected":      { bg: "#F3F4F6", text: "#4B5563" },
  "Not Relevant":  { bg: "#F3F4F6", text: "#9CA3AF" },
  "Duplicate":     { bg: "#E0E7FF", text: "#3730A3" },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES["New"];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
          style={{ backgroundColor: s.bg, color: s.text }}>
      {status}
    </span>
  );
}

const ACTION_STYLES = {
  "Monitor":             { bg: "#F3F4F6", text: "#4B5563" },
  "Review":              { bg: "#FEF3C7", text: "#92400E" },
  "Priority Review":     { bg: "#FFE4E6", text: "#9F1239" },
  "Priority Escalation": { bg: "#FEE2E2", text: "#991B1B" },
  "Respond":             { bg: "#DBEAFE", text: "#1E40AF" },
  "Create Ticket":       { bg: "#E0E7FF", text: "#3730A3" },
  "Close":               { bg: "#D1FAE5", text: "#065F46" },
};

function ActionPill({ actionType, label }) {
  const key = actionType || label;
  const s = ACTION_STYLES[key] || ACTION_STYLES["Monitor"];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide whitespace-nowrap"
          style={{ backgroundColor: s.bg, color: s.text }}>
      {label || actionType}
    </span>
  );
}

function EscalationFlag({ note, compact }) {
  return (
    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold whitespace-nowrap " +
      (compact ? "text-[10.5px]" : "text-[11px]")}
          style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z" />
      </svg>
      Escalation
      {!compact && note && <span className="font-medium ml-1 normal-case">· {note}</span>}
    </span>
  );
}

function OwnerPill({ owner }) {
  return <span className="inline-block bg-[#f0ff5f]/30 text-brand-500 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap">{owner}</span>;
}

function CategoryTag({ category }) {
  const t = VoC.taxonomyFor(category);
  return <span className="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[11px] font-medium">{t ? t.label : category}</span>;
}

function PlatformPill({ platform }) {
  if (platform === "twitter") return <span className="bg-gray-900 text-white px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase">X</span>;
  return <span className="bg-[#FF4500] text-white px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase">RD</span>;
}

// ---- Why routed here panel — simplified ------------------------------
function WhyRoutedHere({ mention, level, engagement, routing, taxonomy }) {
  return (
    <div className="bg-gradient-to-b from-brand-50/60 to-white rounded-xl border border-brand-300/30 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-brand-500 font-bold mb-2 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Why routed here?
      </div>
      <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-[12.5px]">
        <dt className="text-gray-500">Category</dt><dd className="font-semibold text-gray-900">{taxonomy.label}</dd>
        <dt className="text-gray-500">Primary Owner</dt><dd className="font-semibold text-gray-900">{routing.owner}</dd>
        <dt className="text-gray-500">Engagement</dt><dd className="font-semibold text-gray-900">{engagement}</dd>
        <dt className="text-gray-500">Engagement Level</dt><dd className="font-semibold text-gray-900">{level}</dd>
        <dt className="text-gray-500">Action</dt><dd className="font-semibold text-gray-900">{routing.action}</dd>
      </dl>
      {routing.escalation && (
        <div className="mt-2 pt-2 border-t border-brand-100/60 text-[12px] text-coral flex items-start gap-1.5">
          <span className="font-bold uppercase tracking-wider text-[10.5px] whitespace-nowrap pt-0.5">Escalation Flag · Yes</span>
          <span className="text-gray-700">— {routing.escalationNote}</span>
        </div>
      )}
    </div>
  );
}

// ---- KPI card --------------------------------------------------------
function KPICard({ label, value, suffix, delta, deltaDirection, critical }) {
  const deltaColor = { up: "text-red-600", down: "text-emerald-600", neutral: "text-gray-500" }[deltaDirection || "neutral"];
  return (
    <div className={"rounded-[14px] p-4 border shadow-sm " +
      (critical ? "border-red-300 bg-gradient-to-br from-red-50 to-white" : "bg-white border-gray-200")}>
      <div className="text-xs text-gray-500 font-medium tracking-wide">{label}</div>
      <div className={"text-[26px] font-bold mt-1 tracking-tight " + (critical ? "text-red-700" : "text-gray-900")}>
        {value}{suffix && <span className="text-sm text-gray-500 font-medium ml-1">{suffix}</span>}
      </div>
      {delta && <div className={"flex items-center gap-1.5 mt-1.5 text-xs font-semibold " + deltaColor}>{delta}</div>}
    </div>
  );
}

function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-gray-500 mt-1 max-w-[640px]">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ---- Filter select ---------------------------------------------------
function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-[12.5px]">
      <span className="text-gray-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              className="bg-white border border-gray-200 rounded-md px-2 py-1.5 text-[12.5px] text-gray-700">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

// ---- Export ----------------------------------------------------------
Object.assign(window, {
  Sidebar, Topbar, DataFreshnessBanner,
  EngagementBadge, SentimentBadge, AlertStatusBadge, StatusPill, ActionPill, EscalationFlag, OwnerPill, CategoryTag, PlatformPill,
  WhyRoutedHere, KPICard, PageHeader, FilterSelect,
  LEVEL_STYLES, SENTIMENT_STYLES, ALERT_STATUS_STYLES, ACTION_STYLES, STATUS_STYLES, PAGE_TITLES,
  cardCls, sectionTitleCls, sectionSubCls,
});
