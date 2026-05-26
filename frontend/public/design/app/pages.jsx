// =============================================================
// Atome VoC — pages (v3 · monitoring-first)
// =============================================================

const { useState: useP, useMemo: useM, useEffect: useE } = React;

function levelCountsFor(mentions, thresholds) {
  let low = 0, medium = 0, high = 0;
  for (const m of mentions) {
    const lv = VoC.engagementLevel(VoC.engagementOf(m), thresholds);
    if (lv === "Low") low++; else if (lv === "Medium") medium++; else high++;
  }
  return { low, medium, high, total: mentions.length };
}

function byCategory(mentions) {
  const m = {};
  for (const x of mentions) m[x.category] = (m[x.category] || 0) + 1;
  return Object.entries(m).map(([c, n]) => ({ category: c, count: n })).sort((a, b) => b.count - a.count);
}

function trendByDay(mentions, thresholds) {
  const buckets = {};
  for (const m of mentions) {
    const day = m.created.slice(0, 10);
    if (!buckets[day]) buckets[day] = { day, total: 0, low: 0, medium: 0, high: 0, negative: 0, positive: 0 };
    const lv = VoC.engagementLevel(VoC.engagementOf(m), thresholds);
    buckets[day].total++;
    if (lv === "Low") buckets[day].low++; else if (lv === "Medium") buckets[day].medium++; else buckets[day].high++;
    const sent = VoC.sentimentOf(m);
    if (sent === "Negative") buckets[day].negative++;
    else if (sent === "Positive") buckets[day].positive++;
  }
  return Object.values(buckets).sort((a, b) => a.day.localeCompare(b.day));
}

// Returns mentions that need attention: high-eng, neg+medium-eng, sensitive category, or In Review
function getAttentionItems(mentions, settings) {
  return mentions.filter((m) => {
    const eng = VoC.engagementOf(m);
    const lv  = VoC.engagementLevel(eng, settings.engagementThresholds);
    const sent = VoC.sentimentOf(m);
    const sensitive = VoC.isSensitive(m, settings.sensitiveKeywords);
    if (lv === "High") return true;
    if (sent === "Negative" && lv === "Medium") return true;
    if (sensitive) return true;
    if (m.status === "In Review") return true;
    return false;
  }).filter((m) => !["Closed", "Rejected", "Not Relevant"].includes(m.status))
    .sort((a, b) => VoC.engagementOf(b) - VoC.engagementOf(a));
}

function attentionReason(m, lv, sent, sensitive) {
  if (lv === "High" && sensitive) return "High engagement · Sensitive category";
  if (lv === "High" && sent === "Negative") return "High engagement · Negative sentiment";
  if (lv === "High") return "High engagement";
  if (sent === "Negative" && lv === "Medium") return "Negative · Medium engagement";
  if (sensitive) return "Sensitive category";
  if (m.status === "In Review") return "Manually flagged";
  return "Needs attention";
}

// Client-side time-window filter
function applyTimeWindow(mentions, window) {
  if (!window || window === "all") return mentions;
  const now = Date.now();
  const ms = window === "24h" ? 86400000
    : window === "7d"  ? 7  * 86400000
    : window === "30d" ? 30 * 86400000
    : window === "90d" ? 90 * 86400000
    : null;
  if (!ms) return mentions;
  const cutoff = new Date(now - ms).toISOString();
  return mentions.filter((m) => m.created && m.created >= cutoff);
}

// =========================================================
//  OVERVIEW — monitoring-first, sentiment-aware
// =========================================================
function OverviewPage({ settings, openDrillDown, openCorrection, navigate }) {
  const [timeWindow, setTimeWindow] = useP("7d");
  const [sentimentFilter, setSentimentFilter] = useP("all"); // for trend chart

  const rawMentions = VoC.MENTIONS.map((m) => VoC.viewMention(m, settings));
  const allMentions = applyTimeWindow(rawMentions, timeWindow);

  // KPI computations
  const totalMentions  = allMentions.length;
  const negativeCnt    = allMentions.filter((m) => VoC.sentimentOf(m) === "Negative").length;
  const positiveCnt    = allMentions.filter((m) => VoC.sentimentOf(m) === "Positive").length;
  const highEngCnt     = allMentions.filter((m) => VoC.engagementLevel(VoC.engagementOf(m), settings.engagementThresholds) === "High").length;
  const totalEng       = allMentions.reduce((s, m) => s + VoC.engagementOf(m), 0);
  const unclearCnt     = allMentions.filter((m) => !["Positive", "Negative"].includes(VoC.sentimentOf(m))).length;

  const cats           = byCategory(allMentions);
  const attentionItems = getAttentionItems(allMentions, settings).slice(0, 4);
  const trend          = trendByDay(allMentions, settings.engagementThresholds);

  // Trend chart — optionally filtered by sentiment
  const trendData = sentimentFilter === "all" ? trend
    : trend.map((d) => ({ ...d, total: d[sentimentFilter] || 0 }));

  // Sentiment distribution
  const sentTotal = Math.max(totalMentions, 1);
  const sentDist = [
    { label: "Positive", count: positiveCnt, pct: Math.round(100 * positiveCnt / sentTotal), color: "#10B981" },
    { label: "Negative", count: negativeCnt, pct: Math.round(100 * negativeCnt / sentTotal), color: "#EF4444" },
    { label: "Neutral",  count: unclearCnt,  pct: Math.round(100 * unclearCnt  / sentTotal), color: "#9CA3AF" },
  ];

  // Trend SVG
  const W = 560, H = 180, pT = 14, pR = 14, pB = 26, pL = 32;
  const cw = W - pL - pR, ch = H - pT - pB;
  const maxTotal = Math.max(...trendData.map((t) => t.total), 1);
  const yMax = Math.max(5, Math.ceil(maxTotal / 5) * 5);
  const xStep = trendData.length > 1 ? cw / (trendData.length - 1) : cw;
  const xOf = (i) => pL + i * xStep;
  const yOf = (v) => pT + ch - (v / yMax) * ch;
  const trendColor = sentimentFilter === "negative" ? "#EF4444"
    : sentimentFilter === "positive" ? "#10B981" : "#141c30";

  return (
    <div>
      <DataFreshnessBanner settings={settings} />

      {/* Header with time-window toggle */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Overview · Philippines</h1>
          <p className="text-[13px] text-gray-500 mt-1">VoC monitoring — issues, sentiment, and what needs attention.</p>
        </div>
        <div className="flex p-1 bg-white border border-gray-200 rounded-[10px]">
          {["24h", "7d", "30d", "90d"].map((w) => (
            <button key={w} onClick={() => setTimeWindow(w)}
                    className={"px-3 py-1.5 text-[12.5px] rounded-md font-semibold " +
                      (timeWindow === w ? "bg-[#141c30] text-white" : "text-gray-600 hover:bg-gray-50")}>
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards — 4 across (Positive + Negative merged into one card) */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <button onClick={() => navigate("mentions")} className="text-left">
          <KPICard label="Total mentions" value={totalMentions} />
        </button>
        {/* Merged sentiment card */}
        <div className={cardCls + " p-4 flex flex-col gap-1"}>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Sentiment</div>
          <div className="flex items-center gap-3">
            <button onClick={() => openDrillDown({ kind: "sentiment", value: "Positive" })}
                    className="flex items-baseline gap-1.5 hover:opacity-75">
              <span className="text-[22px] font-bold leading-tight" style={{ color: "#10B981" }}>{positiveCnt}</span>
              <span className="text-[12px] text-gray-500">{totalMentions ? Math.round(100 * positiveCnt / totalMentions) : 0}%</span>
            </button>
            <span className="text-gray-300 text-[18px] font-light">|</span>
            <button onClick={() => openDrillDown({ kind: "sentiment", value: "Negative" })}
                    className="flex items-baseline gap-1.5 hover:opacity-75">
              <span className="text-[22px] font-bold leading-tight" style={{ color: "#DC2626" }}>{negativeCnt}</span>
              <span className="text-[12px] text-gray-500">{totalMentions ? Math.round(100 * negativeCnt / totalMentions) : 0}%</span>
            </button>
          </div>
          <div className="flex items-center gap-3 text-[10.5px] text-gray-400 mt-0.5">
            <span style={{ color: "#10B981" }}>● Positive</span>
            <span style={{ color: "#DC2626" }}>● Negative</span>
          </div>
        </div>
        <button onClick={() => openDrillDown({ kind: "level", value: "High" })} className="text-left">
          <KPICard label="High engagement" value={highEngCnt} />
        </button>
        <div>
          <KPICard label="Total engagement" value={totalEng} />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-[1.65fr_1fr] gap-4 mb-4">
        {/* Engagement trend */}
        <div className={cardCls + " p-5"}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className={sectionTitleCls}>Volume trend</h3>
              <div className={sectionSubCls}>Click a day for the drill-down · filter by sentiment below</div>
            </div>
            <div className="flex gap-1">
              {[["all", "#141c30", "All"], ["negative", "#EF4444", "Neg"], ["positive", "#10B981", "Pos"]].map(([v, col, lbl]) => (
                <button key={v} onClick={() => setSentimentFilter(v)}
                        className={"px-2 py-0.5 rounded text-[11px] font-semibold border " +
                          (sentimentFilter === v ? "text-white border-transparent" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50")}
                        style={sentimentFilter === v ? { background: col, borderColor: col } : {}}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-gray-400 text-sm">No data for this window.</div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
              {[yMax, Math.round(yMax * 0.5)].map((t) => (
                <g key={t}>
                  <line x1={pL} y1={yOf(t)} x2={W - pR} y2={yOf(t)} stroke="#E5E7EB" strokeDasharray="3 3" />
                  <text x={pL - 5} y={yOf(t) + 3.5} textAnchor="end" fontSize="9.5" fill="#9CA3AF">{t}</text>
                </g>
              ))}
              <line x1={pL} y1={yOf(0)} x2={W - pR} y2={yOf(0)} stroke="#E5E7EB" />
              {trendData.length > 1 && (
                <path d={`M${xOf(0)},${yOf(trendData[0].total)} ` + trendData.map((t, i) => `L${xOf(i)},${yOf(t.total)}`).join(" ")
                    + ` L${xOf(trendData.length - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`}
                      fill={trendColor} opacity="0.08" />
              )}
              <polyline fill="none" stroke={trendColor} strokeWidth="2" strokeLinejoin="round"
                        points={trendData.map((t, i) => `${xOf(i)},${yOf(t.total)}`).join(" ")} />
              {trendData.map((t, i) => (
                <g key={t.day} style={{ cursor: "pointer" }} onClick={() => openDrillDown({ kind: "day", value: t.day })}>
                  <rect x={xOf(i) - (xStep || cw) / 2} y={pT} width={xStep || cw} height={ch} fill="transparent" />
                  <circle cx={xOf(i)} cy={yOf(t.total)} r="3.5" fill={trendColor} />
                  <text x={xOf(i)} y={yOf(t.total) - 7} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#374151">{t.total || ""}</text>
                  <text x={xOf(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="#9CA3AF">{t.day.slice(5)}</text>
                </g>
              ))}
            </svg>
          )}
          <div className="text-[10.5px] text-gray-400 mt-1.5 text-right">Click any point to view posts for that day</div>
        </div>

        {/* Sentiment distribution */}
        <div className={cardCls + " p-5"}>
          <div className="mb-3">
            <h3 className={sectionTitleCls}>Sentiment distribution</h3>
            <div className={sectionSubCls}>Click a segment to view related posts</div>
          </div>
          <div className="flex flex-col gap-3">
            {sentDist.map(({ label, count, pct, color }) => (
              <button key={label} onClick={() => openDrillDown({ kind: "sentiment", value: label })}
                      className="text-left group">
                <div className="flex items-center justify-between mb-1">
                  <SentimentBadge sentiment={label} />
                  <span className="text-[13px] font-bold text-gray-800 group-hover:text-brand-500">{count} <span className="text-[11px] text-gray-400 font-normal">({pct}%)</span></span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }}></div>
                </div>
              </button>
            ))}
          </div>
          <div className="text-[10.5px] text-gray-400 mt-4 text-right">Click any segment to view posts</div>
        </div>
      </div>

      {/* Bottom row: Top categories + Items Needing Attention preview */}
      <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
        {/* Top categories */}
        <div className={cardCls + " p-5"}>
          <div className="mb-3">
            <h3 className={sectionTitleCls}>Top categories</h3>
            <div className={sectionSubCls}>Click a category to see related posts</div>
          </div>
          <div className="flex flex-col gap-1.5">
            {cats.slice(0, 8).map((c) => {
              const tax = VoC.taxonomyFor(c.category);
              const maxCount = cats[0].count;
              const pct = (c.count / maxCount) * 100;
              return (
                <button key={c.category} onClick={() => openDrillDown({ kind: "category", value: c.category })}
                        className="grid grid-cols-[160px_1fr_28px] items-center gap-2 py-1.5 px-1 rounded hover:bg-gray-50 text-left">
                  <div className="text-[13px] text-gray-700 truncate">{tax ? tax.label : c.category}</div>
                  <div className="bg-gray-100 rounded h-2 overflow-hidden">
                    <div className="h-full rounded" style={{ width: pct + "%", background: "#141c30" }}></div>
                  </div>
                  <div className="text-right font-semibold text-gray-800 text-[12px]">{c.count}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Items Needing Attention preview */}
        <div className={cardCls + " p-5"}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className={sectionTitleCls}>Items Needing Attention</h3>
              <div className={sectionSubCls}>High engagement, negative, or sensitive — top 4</div>
            </div>
            <button onClick={() => navigate("queue")}
                    className="text-[12px] text-coral font-semibold hover:underline whitespace-nowrap">
              View all →
            </button>
          </div>
          {attentionItems.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-gray-400 text-sm">No items needing attention right now.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {attentionItems.map((m) => (
                <MentionCard key={m.id} mention={m} settings={settings} onCorrect={openCorrection} dense />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================
//  ALL POSTS WITH FILTER
// =========================================================
function MentionsPage({ settings, openCorrection }) {
  const [filterCat, setFilterCat]           = useP("all");
  const [filterLevel, setFilterLevel]       = useP("all");
  const [filterSentiment, setFilterSentiment] = useP("all");
  const [filterPlat, setFilterPlat]         = useP("all");
  const [filterStatus, setFilterStatus]     = useP("all");
  const [filterAlert, setFilterAlert]       = useP("all");

  // Show ALL collected posts by default — no pre-filtering
  const filtered = VoC.MENTIONS.map((m) => VoC.viewMention(m, settings)).filter((m) => {
    if (filterCat !== "all" && m.category !== filterCat) return false;
    if (filterPlat !== "all" && m.platform !== filterPlat) return false;
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterSentiment !== "all" && VoC.sentimentOf(m) !== filterSentiment) return false;
    if (filterAlert !== "all" && (m.alertStatus || "Not triggered") !== filterAlert) return false;
    if (filterLevel !== "all") {
      const lv = VoC.engagementLevel(VoC.engagementOf(m), settings.engagementThresholds);
      if (lv !== filterLevel) return false;
    }
    return true;
  }).sort((a, b) => VoC.engagementOf(b) - VoC.engagementOf(a));

  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader title="All Posts with Filter"
                  subtitle={`${filtered.length} of ${VoC.MENTIONS.length} posts collected · sorted by engagement`} />

      <div className={cardCls + " p-4 mb-4 flex flex-wrap gap-2.5 items-center"}>
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mr-1">Filter</span>
        <FilterSelect label="Category" value={filterCat} onChange={setFilterCat}
          options={[{ v: "all", l: "All categories" }, ...VoC.TAXONOMY.map((t) => ({ v: t.key, l: t.label }))]} />
        <FilterSelect label="Sentiment" value={filterSentiment} onChange={setFilterSentiment}
          options={[{ v: "all", l: "All sentiment" }, { v: "Positive", l: "Positive" }, { v: "Negative", l: "Negative" }, { v: "Neutral", l: "Neutral" }]} />
        <FilterSelect label="Engagement" value={filterLevel} onChange={setFilterLevel}
          options={[{ v: "all", l: "All levels" }, { v: "High", l: "High" }, { v: "Medium", l: "Medium" }, { v: "Low", l: "Low" }]} />
        <FilterSelect label="Source" value={filterPlat} onChange={setFilterPlat}
          options={[{ v: "all", l: "All sources" }, { v: "twitter", l: "X / Twitter" }, { v: "reddit", l: "Reddit" }]} />
        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
          options={[{ v: "all", l: "All" }, { v: "New", l: "New" }, { v: "In Review", l: "In Review" }, { v: "Actioned", l: "Actioned" }, { v: "Closed", l: "Closed" }, { v: "Rejected", l: "Rejected" }, { v: "Not Relevant", l: "Not Relevant" }, { v: "Duplicate", l: "Duplicate" }]} />
        <FilterSelect label="Alert" value={filterAlert} onChange={setFilterAlert}
          options={[{ v: "all", l: "All alerts" }, { v: "Not triggered", l: "Not triggered" }, { v: "Triggered", l: "Triggered" }, { v: "Acknowledged", l: "Acknowledged" }, { v: "Resolved", l: "Resolved" }]} />
        <div className="flex-1" />
        <div className="text-[11.5px] text-gray-500">Sorted by engagement</div>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((m) => <MentionCard key={m.id} mention={m} settings={settings} onCorrect={openCorrection} />)}
        {filtered.length === 0 && <div className="text-center text-gray-400 text-sm py-8">No posts match these filters.</div>}
      </div>
    </div>
  );
}

// =========================================================
//  ITEMS NEEDING ATTENTION
// =========================================================
function ActionQueuePage({ settings, openDrillDown, openCorrection }) {
  const [view, setView] = useP("posts"); // "clusters" | "posts"
  const [filterCat, setFilterCat] = useP("all");
  const [filterOwner, setFilterOwner] = useP("all");

  const owners = [...new Set(VoC.TAXONOMY.map((t) => VoC.ownerOf(t.key, settings)))];
  const allMentions = VoC.MENTIONS.map((m) => VoC.viewMention(m, settings));

  // Core filtering: only items that need attention
  const attentionMentions = allMentions.map((m) => {
    const eng = VoC.engagementOf(m);
    const lv  = VoC.engagementLevel(eng, settings.engagementThresholds);
    const sent = VoC.sentimentOf(m);
    const sensitive = VoC.isSensitive(m, settings.sensitiveKeywords);
    const routing = VoC.routingFor(m.category, lv, sensitive, settings);
    const reason = attentionReason(m, lv, sent, sensitive);
    return { m, eng, lv, sent, sensitive, routing, reason };
  }).filter((r) => {
    const { lv, sent, sensitive, m } = r;
    if (!["High", "Medium"].includes(lv) && !sensitive && m.status !== "In Review") return false;
    if (lv === "Medium" && sent !== "Negative" && !sensitive && m.status !== "In Review") return false;
    if (["Closed", "Rejected", "Not Relevant"].includes(m.status)) return false;
    if (filterCat !== "all" && r.m.category !== filterCat) return false;
    if (filterOwner !== "all" && r.routing.owner !== filterOwner) return false;
    return true;
  }).sort((a, b) => b.eng - a.eng);

  // Cluster view — group attention mentions
  const clusterMap = {};
  for (const r of attentionMentions) {
    const cid = r.m.clusterId || ("single_" + r.m.id);
    if (!clusterMap[cid]) {
      const info = VoC.CLUSTERS[cid] || { topic: (r.m.text || "").slice(0, 80) + "…", category: r.m.category };
      clusterMap[cid] = { clusterId: cid, topic: info.topic, category: info.category, rows: [], totalEng: 0 };
    }
    clusterMap[cid].rows.push(r);
    clusterMap[cid].totalEng += r.eng;
  }
  const clusterView = Object.values(clusterMap).sort((a, b) => b.totalEng - a.totalEng);

  const empty = view === "posts" ? attentionMentions.length === 0 : clusterView.length === 0;

  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader
        title="Items Needing Attention"
        subtitle="High engagement, negative sentiment, sensitive categories, or manually flagged — filtered automatically."
        right={
          <div className="flex p-1 bg-white border border-gray-200 rounded-[10px]">
            <button onClick={() => setView("clusters")}
                    className={"px-3 py-1.5 text-[12.5px] rounded-md font-semibold " + (view === "clusters" ? "bg-[#141c30] text-white" : "text-gray-600 hover:bg-gray-50")}>
              Clusters
            </button>
            <button onClick={() => setView("posts")}
                    className={"px-3 py-1.5 text-[12.5px] rounded-md font-semibold " + (view === "posts" ? "bg-[#141c30] text-white" : "text-gray-600 hover:bg-gray-50")}>
              Posts
            </button>
          </div>
        }
      />

      {/* Explanation banner */}
      <div className={cardCls + " p-4 mb-4 flex items-start gap-3 text-[12.5px] text-gray-700 bg-gradient-to-r from-amber-50/60 to-white"}>
        <svg className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z" />
        </svg>
        <div>
          <span className="font-bold text-amber-700">Criteria: </span>
          High engagement · Negative sentiment at medium+ engagement · Sensitive categories (Fraud, Collections) · Manually flagged.
          <span className="ml-2 text-gray-500">Closed and not-relevant posts are excluded automatically.</span>
        </div>
      </div>

      <div className={cardCls + " p-4 mb-4 flex flex-wrap gap-2.5 items-center"}>
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mr-1">Filter</span>
        <FilterSelect label="Category" value={filterCat} onChange={setFilterCat}
          options={[{ v: "all", l: "All categories" }, ...VoC.TAXONOMY.map((t) => ({ v: t.key, l: t.label }))]} />
        <FilterSelect label="Owner" value={filterOwner} onChange={setFilterOwner}
          options={[{ v: "all", l: "All owners" }, ...owners.map((o) => ({ v: o, l: o }))]} />
        <div className="flex-1" />
        <div className="text-[11.5px] text-gray-500">{attentionMentions.length} item{attentionMentions.length !== 1 ? "s" : ""} · sorted by engagement</div>
      </div>

      {/* CLUSTERS view */}
      {view === "clusters" && (
        <div className={cardCls + " overflow-hidden"}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Issue / Topic", "Category", "Posts", "Engagement", "Level", "Sentiment", "Owner", "Reason", "Suggested action", ""].map((h) => (
                  <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-2.5 py-2 border-b border-gray-200 bg-gray-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clusterView.map(({ clusterId, topic, category, rows, totalEng }) => {
                const lv = VoC.engagementLevel(totalEng, settings.engagementThresholds);
                const sent = rows[0] ? VoC.sentimentOf(rows[0].m) : "Neutral";
                const routing = rows[0] ? rows[0].routing : { owner: "—", action: "—", actionType: "Monitor", escalation: false };
                const reason = rows[0] ? rows[0].reason : "—";
                return (
                  <tr key={clusterId} className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => openDrillDown({ kind: "cluster", value: clusterId })}>
                    <td className="px-2.5 py-3 border-b border-gray-100 max-w-[240px]">
                      <div className="font-semibold text-gray-900 line-clamp-2 text-[12.5px]">{topic}</div>
                    </td>
                    <td className="px-2.5 py-3 border-b border-gray-100"><CategoryTag category={category} /></td>
                    <td className="px-2.5 py-3 border-b border-gray-100 font-semibold text-gray-800">{rows.length}</td>
                    <td className="px-2.5 py-3 border-b border-gray-100 font-semibold text-gray-800">{totalEng}</td>
                    <td className="px-2.5 py-3 border-b border-gray-100"><EngagementBadge level={lv} /></td>
                    <td className="px-2.5 py-3 border-b border-gray-100"><SentimentBadge sentiment={sent} /></td>
                    <td className="px-2.5 py-3 border-b border-gray-100"><OwnerPill owner={routing.owner} /></td>
                    <td className="px-2.5 py-3 border-b border-gray-100 text-[11.5px] text-gray-600 max-w-[160px]">{reason}</td>
                    <td className="px-2.5 py-3 border-b border-gray-100">
                      <ActionPill label={routing.action} actionType={routing.actionType} />
                      {routing.escalation && <div className="mt-1"><EscalationFlag compact /></div>}
                    </td>
                    <td className="px-2.5 py-3 border-b border-gray-100 text-[11px] text-coral font-semibold whitespace-nowrap">View →</td>
                  </tr>
                );
              })}
              {clusterView.length === 0 && (
                <tr><td colSpan="10" className="text-center text-gray-400 text-sm py-8">No items needing attention right now.</td></tr>
              )}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10.5px] text-gray-400 text-right">Click any row to open the detail drawer.</div>
        </div>
      )}

      {/* POSTS view */}
      {view === "posts" && (
        <React.Fragment>
          {attentionMentions.length === 0 ? (
            <div className={cardCls + " p-8 text-center text-gray-400 text-sm"}>No items needing attention right now.</div>
          ) : (
            <div className={cardCls + " overflow-hidden"}>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Post", "Category", "Sentiment", "Engagement", "Level", "Owner", "Reason", "Suggested action"].map((h) => (
                      <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-2.5 py-2 border-b border-gray-200 bg-gray-50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attentionMentions.map(({ m, eng, lv, sent, routing, reason }) => (
                    <tr key={m.id} className="hover:bg-gray-50 align-top">
                      <td className="px-2.5 py-3 border-b border-gray-100 max-w-[280px]">
                        <div className="text-[12.5px] text-gray-800 line-clamp-2 mb-1">{m.text}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                          <PlatformPill platform={m.platform} />
                          <span>@{m.author}</span>
                          <span className="text-gray-300">·</span>
                          <span>{m.created ? new Date(m.created).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                        </div>
                      </td>
                      <td className="px-2.5 py-3 border-b border-gray-100"><CategoryTag category={m.category} /></td>
                      <td className="px-2.5 py-3 border-b border-gray-100"><SentimentBadge sentiment={sent} /></td>
                      <td className="px-2.5 py-3 border-b border-gray-100 font-semibold text-gray-800">{eng}</td>
                      <td className="px-2.5 py-3 border-b border-gray-100"><EngagementBadge level={lv} /></td>
                      <td className="px-2.5 py-3 border-b border-gray-100"><OwnerPill owner={routing.owner} /></td>
                      <td className="px-2.5 py-3 border-b border-gray-100 text-[11.5px] text-gray-600 max-w-[160px]">{reason}</td>
                      <td className="px-2.5 py-3 border-b border-gray-100">
                        <ActionPill label={routing.action} actionType={routing.actionType} />
                        {routing.escalation && <div className="mt-1"><EscalationFlag compact /></div>}
                        <div className="flex gap-1 mt-2">
                          {openCorrection && <CorrectionMenu mention={m} settings={settings} onCorrect={openCorrection} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

// =========================================================
//  TAXONOMY — read-only derived view; edit owners in Settings
// =========================================================
function TaxonomyPage({ settings }) {
  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader title="Taxonomy" subtitle="Category definitions, ownership, and escalation policy. This is a read-only view — configure owners in Settings → Routing Ownership." />

      <div className={cardCls + " p-4 mb-4 text-[12.5px] text-gray-700 bg-gradient-to-r from-brand-50/50 to-white"}>
        <span className="font-bold text-brand-500">Read-only view. </span>
        To change a category's Primary Owner or Secondary CC teams, go to{" "}
        <a href="#/settings" className="text-coral underline">Settings → Routing Ownership</a>.
        Changes flow instantly to the Routing Matrix and every Why-routed explanation.
      </div>

      <div className={cardCls + " overflow-hidden"}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Category", "Primary Owner", "Secondary Teams (CC)", "Description", "Common signals", "Default action", "Escalation flag", "Escalation note"].map((h) => (
                <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50 align-top">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VoC.TAXONOMY.map((t) => {
              const secondary = VoC.secondaryTeamsOf(t.key, settings);
              return (
                <tr key={t.key} className="align-top hover:bg-gray-50/50">
                  <td className="px-3 py-3 border-b border-gray-100 font-semibold text-gray-900 whitespace-nowrap">{t.label}</td>
                  <td className="px-3 py-3 border-b border-gray-100">
                    <OwnerPill owner={VoC.ownerOf(t.key, settings)} />
                  </td>
                  <td className="px-3 py-3 border-b border-gray-100">
                    {secondary.length > 0
                      ? <div className="flex flex-wrap gap-1">{secondary.map((s) => <span key={s} className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-semibold">{s}</span>)}</div>
                      : <span className="text-[11px] text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 border-b border-gray-100 text-gray-700 max-w-[240px]">{t.description}</td>
                  <td className="px-3 py-3 border-b border-gray-100">
                    <div className="flex flex-wrap gap-1">
                      {t.signals.map((s) => <span key={s} className="bg-gray-100 text-gray-700 text-[11px] px-1.5 py-0.5 rounded">{s}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-3 border-b border-gray-100 text-gray-700 whitespace-nowrap">{t.defaultAction}</td>
                  <td className="px-3 py-3 border-b border-gray-100">
                    {t.escalationFlag ? <span className="text-[11px] font-bold text-coral">Yes</span> : <span className="text-[11px] text-gray-400">No</span>}
                  </td>
                  <td className="px-3 py-3 border-b border-gray-100 text-gray-600 text-[12px] max-w-[220px]">{t.escalationNote}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =========================================================
//  ROUTING MATRIX — Category / Primary / Secondary only
// =========================================================
function RoutingMatrixPage({ settings }) {
  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader
        title="Routing Matrix"
        subtitle="Which team owns each category and who they loop in. Edit owners and CC teams in Settings → Routing Ownership."
      />

      <div className={cardCls + " p-4 mb-4 text-[12.5px] text-gray-700 bg-gradient-to-r from-brand-50/50 to-white flex items-start gap-3"}>
        <svg className="w-4 h-4 mt-0.5 text-brand-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="font-bold text-brand-500 mb-0.5">One Primary Owner per category. Secondary teams are CC'd on High-engagement alerts.</div>
          High-engagement posts (engagement &gt; {settings.engagementThresholds.mediumMax}) send a Lark card to the <strong>shared group channel</strong> configured via <code>LARK_ALERT_WEBHOOK_URL</code>. The card shows the Primary Owner and CC teams as metadata — it is a group notification, not a personal DM to the owner.
          <span className="ml-2 text-brand-500 font-semibold">
            ·{" "}
            <a href="#/alert-delivery"
              onClick={(e) => { e.preventDefault(); window.location.hash = "#/alert-delivery"; }}
              className="underline hover:text-brand-600">
              Configure per-category alert delivery →
            </a>
          </span>
        </div>
      </div>

      <div className={cardCls + " overflow-hidden"}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50">Category</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50">Primary Owner</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50">Secondary Teams (CC)</th>
            </tr>
          </thead>
          <tbody>
            {VoC.TAXONOMY.map((t) => {
              const owner = VoC.ownerOf(t.key, settings);
              const secondary = VoC.secondaryTeamsOf(t.key, settings);
              return (
                <tr key={t.key} className="align-middle hover:bg-gray-50/50">
                  <td className="px-3 py-3 border-b border-gray-100 font-semibold text-gray-900 whitespace-nowrap">{t.label}</td>
                  <td className="px-3 py-3 border-b border-gray-100"><OwnerPill owner={owner} /></td>
                  <td className="px-3 py-3 border-b border-gray-100">
                    {secondary.length > 0
                      ? <div className="flex flex-wrap gap-1">{secondary.map((s) => <span key={s} className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-semibold">{s}</span>)}</div>
                      : <span className="text-[11px] text-gray-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =========================================================
//  METHODOLOGY
// =========================================================
function MethodologyPage({ settings }) {
  const { lowMax, mediumMax } = settings.engagementThresholds;
  return (
    <div className="max-w-[760px]">
      <DataFreshnessBanner settings={settings} />
      <PageHeader title="Methodology" subtitle="How engagement and sentiment are measured." />

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-2">Engagement formula</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-[13.5px] text-gray-800 mb-3">
          engagement = reposts + likes + replies + comments
        </div>
        <p className="text-[12.5px] text-gray-600">Total public interaction. Views and follower counts are excluded — they are inconsistent across X and Reddit.</p>
      </div>

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-3">Engagement levels</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-lg p-3.5" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
            <EngagementBadge level="Low" />
            <div className="mt-2 text-[12.5px] text-gray-700">0 to <strong>{lowMax}</strong></div>
            <div className="text-[11.5px] text-gray-500 mt-1">Monitor only</div>
          </div>
          <div className="rounded-lg p-3.5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
            <EngagementBadge level="Medium" />
            <div className="mt-2 text-[12.5px] text-gray-700">{lowMax + 1} to <strong>{mediumMax}</strong></div>
            <div className="text-[11.5px] text-gray-500 mt-1">Review if negative</div>
          </div>
          <div className="rounded-lg p-3.5" style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}>
            <EngagementBadge level="High" />
            <div className="mt-2 text-[12.5px] text-gray-700">Above <strong>{mediumMax}</strong></div>
            <div className="text-[11.5px] text-gray-500 mt-1">Always needs attention</div>
          </div>
        </div>
        <p className="text-[12px] text-gray-500">Thresholds are configurable in <a href="#/settings" className="text-coral underline">Settings</a>. They should be calibrated to actual market data.</p>
      </div>

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-3">Sentiment labels</h3>
        <p className="text-[12.5px] text-gray-600 mb-3">Sentiment is assigned by AI (Claude) and appears on every mention, cluster, and category view. It is a reading aid, not a filing system — use corrections to fix misclassifications.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { s: "Positive", desc: "Post expresses satisfaction, compliment, or positive experience with Atome." },
            { s: "Negative", desc: "Post expresses complaint, frustration, or negative experience — often action-relevant." },
            { s: "Neutral",  desc: "Factual, informational, or mixed-signal post with no clear positive or negative emotion. Also used when sentiment could not be determined confidently." },
          ].map(({ s, desc }) => (
            <div key={s} className="flex gap-2.5 items-start">
              <SentimentBadge sentiment={s} />
              <p className="text-[12px] text-gray-600 flex-1">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-[12px] text-gray-600">
          <strong>AI confidence:</strong> The model is most confident on clearly negative complaints. Mixed-language posts (Filipino/Taglish) may be classified as Neutral more often due to lower confidence.
        </div>
      </div>

      <div className={cardCls + " p-6"}>
        <h3 className="text-base font-bold text-gray-900 mb-3">Known limitations</h3>
        <ol className="space-y-2.5 text-[13px] text-gray-700">
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">1.</span><span>Engagement measures <strong>public visibility</strong>, not business severity.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">2.</span><span>Low-engagement posts can still be critical if they involve <strong>fraud, unauthorized transactions, or collection conduct</strong> — these are escalated regardless of engagement.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">3.</span><span>Sentiment classification is <strong>AI-generated</strong> and may be inaccurate for sarcasm, Taglish, or short posts. Use the "Correct sentiment" option in the mention menu.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">4.</span><span>Category classification may need <strong>manual review</strong> for ambiguous posts — use the correction flow.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">5.</span><span>Current sources are X/Twitter and Reddit only. Facebook and TikTok are planned but not yet monitored.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">6.</span><span>Thresholds should be <strong>recalibrated periodically</strong> as campaign activity and market maturity change.</span></li>
        </ol>
      </div>
    </div>
  );
}

// =========================================================
//  LOGIC & RATIONALE — 10 principles, monitoring-first
// =========================================================
function RationalePage() {
  const points = [
    {
      t: "This is a monitoring tool, not a case management system.",
      b: "The goal is to surface important VoC signals quickly — not to create ticket queues or workflow stages. Business teams decide what to do; the dashboard tells them what to look at.",
    },
    {
      t: "Taxonomy is the single source of truth for ownership.",
      b: "Category ownership lives in one place. The Routing Matrix, Items Needing Attention, and every 'Why routed here?' explanation all read from it. Change an owner in Taxonomy and it flows everywhere instantly.",
    },
    {
      t: "Each category has one Primary Owner — never two.",
      b: "Split ownership creates unclear accountability. If two teams need to act, the Escalation flag handles that — not a second owner field.",
    },
    {
      t: "Routing Matrix is derived, not maintained separately.",
      b: "The matrix isn't an editable table. It's computed from Taxonomy × Engagement Settings. This prevents the Routing Matrix from drifting out of sync with the actual owners.",
    },
    {
      t: "Engagement = reposts + likes + replies + comments.",
      b: "Total public interaction. Views and follower counts are excluded — they are inconsistent across X and Reddit and would skew the thresholds.",
    },
    {
      t: "Engagement thresholds are configurable and must be recalibrated.",
      b: "Baseline engagement differs by market, channel, and campaign period. Thresholds that fit a quiet market will misclassify everything as 'High' during a campaign spike. Review them monthly.",
    },
    {
      t: "Escalation is a flag, not a second owner.",
      b: "Sensitive categories (Fraud, Collections) and high-engagement posts show an Escalation flag alongside the normal routing. This keeps the owner field clean while still surfacing urgency.",
    },
    {
      t: "Sentiment is a reading aid, not a classification system.",
      b: "Positive/Negative/Neutral labels help reviewers prioritize quickly. They are AI-generated and can be wrong — especially for sarcasm, short posts, or mixed-language (Taglish). Corrections are lightweight and encouraged.",
    },
    {
      t: "Items Needing Attention is a filtered signal, not a work queue.",
      b: "The page shows what the system thinks is urgent: high engagement, negative + medium engagement, sensitive categories, or manually flagged posts. It's a starting point for the business team's attention — not a task list to clear.",
    },
    {
      t: "Data freshness and source coverage must always be visible.",
      b: "Users should never wonder if the data is stale. The freshness banner shows the last and next refresh time on every page. Current sources (X, Reddit) and planned sources (Facebook, TikTok) are labelled separately so the coverage gap is explicit.",
    },
  ];

  return (
    <div className="max-w-[820px]">
      <PageHeader title="Logic & Rationale" subtitle="10 design principles this system enforces — monitoring-first, business-readable." />
      <div className="flex flex-col gap-3">
        {points.map((p, i) => (
          <div key={i} className={cardCls + " p-5 flex gap-4"}>
            <div className="w-9 h-9 rounded-full bg-[#f0ff5f] flex items-center justify-center text-[#141c30] font-extrabold shrink-0">{i + 1}</div>
            <div>
              <h3 className="font-bold text-gray-900 text-[15px] mb-1">{p.t}</h3>
              <p className="text-[13px] text-gray-600 leading-relaxed">{p.b}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Multi-select dropdown with active/coming-soon states ─────────────────
// options: [{ value, active }]  selected: string[]  onChange: (string[]) => void
// Display: selected values joined with " + ", e.g. "X + Reddit"
function ActiveMultiSelectDropdown({ options, selected, onChange }) {
  const [open, setOpen] = useP(false);
  const label = selected.length === 0 ? "None" : selected.join(" + ");

  // Close on any click outside via document-level listener (most reliable across stacking contexts)
  useE(() => {
    if (!open) return;
    function onDocClick() { setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative">
      <button type="button"
        onMouseDown={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="settings-input flex items-center justify-between w-full text-left">
        <span className={selected.length === 0 ? "text-gray-400" : "font-medium"}>{label}</span>
        <svg className="w-3.5 h-3.5 text-gray-400 ml-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-40 min-w-full"
          onMouseDown={(e) => e.stopPropagation()}>
          {options.map((opt) => (
            <label key={opt.value}
              className={"flex items-center gap-2.5 px-3 py-2 text-[12.5px] " + (opt.active ? "hover:bg-gray-50 cursor-pointer" : "opacity-40 cursor-not-allowed")}>
              <input type="checkbox"
                checked={selected.includes(opt.value)}
                disabled={!opt.active}
                onChange={() => {
                  if (!opt.active) return;
                  const next = selected.includes(opt.value)
                    ? selected.filter((v) => v !== opt.value)
                    : [...selected, opt.value];
                  onChange(next);
                }}
                className="accent-brand-500 w-3.5 h-3.5" />
              <span className={selected.includes(opt.value) ? "font-semibold text-gray-900" : "text-gray-700"}>{opt.value}</span>
              {!opt.active && <span className="text-[10px] text-gray-400 italic ml-auto">coming soon</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Secondary multi-select dropdown (compact dropdown with checkboxes) ──
function SecondaryMultiSelect({ options, selected, onChange }) {
  const [open, setOpen] = useP(false);
  const label = selected.length === 0 ? "None"
    : selected.length === 1 ? selected[0]
    : selected.length + " teams";

  useE(() => {
    if (!open) return;
    function onDocClick() { setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative">
      <button type="button"
        onMouseDown={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded text-[12px] font-semibold hover:bg-blue-100 min-w-[80px] justify-between">
        <span>{label}</span>
        <svg className="w-3 h-3 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-40 min-w-[170px]"
          onMouseDown={(e) => e.stopPropagation()}>
          {options.map((team) => (
            <label key={team} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(team)}
                onChange={() => {
                  const next = selected.includes(team) ? selected.filter((t) => t !== team) : [...selected, team];
                  onChange(next);
                }}
                className="accent-brand-500 w-3.5 h-3.5" />
              <span className={"text-[12.5px] " + (selected.includes(team) ? "text-gray-900 font-semibold" : "text-gray-700")}>{team}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
//  SETTINGS — single source of truth (draft/confirm workflow)
// =========================================================
function SettingsPage({ settings, updateSettings, resetSettings }) {
  // Build initial draft from current committed settings
  function makeDraft(s) {
    return {
      low:               s.engagementThresholds.lowMax,
      med:               s.engagementThresholds.mediumMax,
      keywords:          s.sensitiveKeywords.join(", "),
      ownership:         { ...s.ownership },
      secondaryOwnership: JSON.parse(JSON.stringify(s.secondaryOwnership || {})),
      defaultMarket:     Array.isArray(s.defaultMarket) ? [...s.defaultMarket] : (s.defaultMarket ? [s.defaultMarket] : ["PH"]),
      defaultSource:     Array.isArray(s.defaultSource) ? [...s.defaultSource] : (s.defaultSource ? [s.defaultSource] : ["X", "Reddit"]),
      defaultTimeWindow: s.defaultTimeWindow,
    };
  }

  const [draft, setDraft] = useP(() => makeDraft(settings));
  const [error, setError] = useP(null);

  // Detect unsaved changes by comparing draft to committed settings
  const hasUnsaved = useM(() => {
    if (Number(draft.low) !== settings.engagementThresholds.lowMax) return true;
    if (Number(draft.med) !== settings.engagementThresholds.mediumMax) return true;
    const parsedKW = draft.keywords.split(",").map((s) => s.trim()).filter(Boolean);
    if (JSON.stringify(parsedKW) !== JSON.stringify(settings.sensitiveKeywords)) return true;
    if (JSON.stringify(draft.ownership) !== JSON.stringify(settings.ownership)) return true;
    if (JSON.stringify(draft.secondaryOwnership) !== JSON.stringify(settings.secondaryOwnership || {})) return true;
    const mkt = Array.isArray(settings.defaultMarket) ? settings.defaultMarket : [settings.defaultMarket || "PH"];
    if (JSON.stringify([...draft.defaultMarket].sort()) !== JSON.stringify([...mkt].sort())) return true;
    const src = Array.isArray(settings.defaultSource) ? settings.defaultSource : [settings.defaultSource || "X"];
    if (JSON.stringify([...draft.defaultSource].sort()) !== JSON.stringify([...src].sort())) return true;
    if (draft.defaultTimeWindow !== settings.defaultTimeWindow) return true;
    return false;
  }, [draft, settings]);

  // Warn before page leave when there are unconfirmed changes
  useE(() => {
    if (!hasUnsaved) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  function confirm() {
    const lo = Number(draft.low), md = Number(draft.med);
    if (!Number.isFinite(lo) || lo < 0) return setError("Low max must be a number ≥ 0.");
    if (!Number.isFinite(md) || md <= lo) return setError("Medium max must be greater than Low max.");
    setError(null);
    const newSettings = {
      ...settings,
      engagementThresholds: { lowMax: lo, mediumMax: md },
      sensitiveKeywords: draft.keywords.split(",").map((s) => s.trim()).filter(Boolean),
      ownership: { ...draft.ownership },
      secondaryOwnership: JSON.parse(JSON.stringify(draft.secondaryOwnership)),
      defaultMarket: draft.defaultMarket,
      defaultSource: draft.defaultSource,
      defaultTimeWindow: draft.defaultTimeWindow,
    };
    updateSettings(newSettings);
    // Reset draft to match committed state → hasUnsaved → false
    setDraft(makeDraft(newSettings));
  }

  function discard() {
    setDraft(makeDraft(settings));
    setError(null);
  }

  function doReset() {
    resetSettings();
    const d = VoC.DEFAULT_SETTINGS;
    setDraft(makeDraft(d));
    setError(null);
  }

  // Live preview of threshold impact on mentions
  const draftThresholds = { lowMax: Number(draft.low), mediumMax: Number(draft.med) };
  const previewCounts = Number.isFinite(draftThresholds.lowMax) && Number.isFinite(draftThresholds.mediumMax) && draftThresholds.mediumMax > draftThresholds.lowMax
    ? levelCountsFor(VoC.MENTIONS, draftThresholds) : null;

  const owners = [...new Set(Object.values(VoC.DEFAULT_OWNERSHIP))];
  const allSecondaryOptions = ["Risk", "Product", "Legal", "Customer Services", "Collection"];
  const marketOptions = VoC.MARKET_OPTIONS || ["PH", "ID", "MY", "SG", "TW"];
  const sourceOptions = VoC.SOURCE_OPTIONS || ["X", "Reddit", "Facebook", "TikTok"];

  function toggleSecondary(catKey, team) {
    setDraft((d) => {
      const current = d.secondaryOwnership[catKey] || [];
      const next = current.includes(team) ? current.filter((t) => t !== team) : [...current, team];
      return { ...d, secondaryOwnership: { ...d.secondaryOwnership, [catKey]: next } };
    });
  }

  return (
    <div className="max-w-[920px] pb-24">
      <PageHeader title="Settings" subtitle="Single source of truth for routing ownership, thresholds, and display defaults. Taxonomy and Routing Matrix are derived from these settings — no separate editing needed." />

      {/* Unsaved changes warning banner */}
      {hasUnsaved && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-[13px] text-amber-800">
            You have <strong>unconfirmed changes</strong> — not applied yet.
            Click <strong>Confirm Changes</strong> to apply, or <strong>Discard</strong> to revert.
          </span>
        </div>
      )}

      {/* ── Engagement thresholds ──────────────────────────────── */}
      <div className={cardCls + " p-6 mb-4"}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-900">Engagement thresholds</h3>
          <span className="text-[11.5px] text-gray-400">Applies across Overview, Mentions, Action Queue, Routing Matrix, Methodology</span>
        </div>
        <p className="text-[12.5px] text-gray-500 mb-4">High engagement is anything above Medium max. Adjust and confirm to recalibrate all views.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <SettingField label="Low max" hint="Engagement ≤ this is Low">
            <input type="number" min="0" value={draft.low}
              onChange={(e) => setDraft((d) => ({ ...d, low: e.target.value }))}
              className="settings-input" />
          </SettingField>
          <SettingField label="Medium max" hint="Engagement ≤ this is Medium. High = above this.">
            <input type="number" min="0" value={draft.med}
              onChange={(e) => setDraft((d) => ({ ...d, med: e.target.value }))}
              className="settings-input" />
          </SettingField>
        </div>

        {previewCounts && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Live preview — with these thresholds, current mentions become:</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><EngagementBadge level="Low" /><span className="font-semibold">{previewCounts.low}</span></div>
              <div className="flex items-center gap-1.5"><EngagementBadge level="Medium" /><span className="font-semibold">{previewCounts.medium}</span></div>
              <div className="flex items-center gap-1.5"><EngagementBadge level="High" /><span className="font-semibold">{previewCounts.high}</span></div>
              <span className="ml-auto text-[11.5px] text-gray-500">of {previewCounts.total} total</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Routing Ownership (was "Taxonomy ownership") ──────── */}
      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-1">Routing Ownership</h3>
        <p className="text-[12.5px] text-gray-500 mb-4">
          <strong>Primary Owner</strong> is accountable for each category.
          <strong className="ml-1">Secondary Teams</strong> are CC'd on High-engagement alerts via Lark.
          Changes here flow to Taxonomy and the Routing Matrix automatically.
        </p>
        <div className="space-y-2">
          {VoC.TAXONOMY.map((t) => {
            const primary = draft.ownership[t.key] || VoC.ownerOf(t.key, settings);
            const secondary = draft.secondaryOwnership[t.key] || [];
            return (
              <div key={t.key} className="border border-gray-100 rounded-lg p-3 bg-gray-50/40 hover:bg-gray-50">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-[13px] font-semibold text-gray-900 w-36 shrink-0">{t.label}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 font-medium">Primary:</span>
                    <select
                      value={primary}
                      onChange={(e) => setDraft((d) => ({ ...d, ownership: { ...d.ownership, [t.key]: e.target.value } }))}
                      className="bg-[#f0ff5f]/30 text-brand-500 px-2 py-0.5 rounded text-[12px] font-semibold border-0 focus:outline-none cursor-pointer">
                      {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 font-medium">Secondary (CC):</span>
                    <SecondaryMultiSelect
                      options={allSecondaryOptions}
                      selected={secondary}
                      onChange={(next) => setDraft((d) => ({ ...d, secondaryOwnership: { ...d.secondaryOwnership, [t.key]: next } }))} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Routing rules (sensitive keywords) ────────────────── */}
      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-1">Routing rules</h3>
        <p className="text-[12.5px] text-gray-500 mb-3">
          Sensitive-keyword escalation. A mention containing any of these triggers the Escalation flag regardless of engagement level.
        </p>
        <SettingField label="Sensitive keywords" hint="Comma-separated. Works across all categories.">
          <input type="text" value={draft.keywords}
            onChange={(e) => setDraft((d) => ({ ...d, keywords: e.target.value }))}
            className="settings-input w-full" />
        </SettingField>
      </div>

      {/* ── Display defaults ───────────────────────────────────── */}
      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-3">Display defaults</h3>
        <div className="grid grid-cols-3 gap-6">
          <SettingField label="Default market" hint="To activate a new market: set active=true in MARKET_OPTIONS (data.js) + deploy.">
            <ActiveMultiSelectDropdown
              options={marketOptions}
              selected={draft.defaultMarket}
              onChange={(next) => setDraft((d) => ({ ...d, defaultMarket: next }))} />
          </SettingField>
          <SettingField label="Default source" hint="To activate a new source: set active=true in SOURCE_OPTIONS (data.js) + deploy.">
            <ActiveMultiSelectDropdown
              options={sourceOptions}
              selected={draft.defaultSource}
              onChange={(next) => setDraft((d) => ({ ...d, defaultSource: next }))} />
          </SettingField>
          <SettingField label="Default time period">
            <select value={draft.defaultTimeWindow}
              onChange={(e) => setDraft((d) => ({ ...d, defaultTimeWindow: e.target.value }))}
              className="settings-input">
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="90d">90d</option>
            </select>
          </SettingField>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] px-4 py-2.5 rounded-lg mb-3">{error}</div>}

      <div className="flex items-center gap-3 text-[12.5px] text-gray-400">
        <a href="#/methodology" className="text-coral underline">How thresholds are applied →</a>
        <div className="flex-1" />
        <button onClick={doReset} className="hover:text-coral hover:underline">Reset to defaults</button>
      </div>

      {/* Bottom action bar — only visible when there are unconfirmed changes */}
      {hasUnsaved && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-amber-200 px-8 py-3 flex items-center gap-3 z-50 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-[13px] text-gray-700 font-medium">Unsaved changes — not applied yet</span>
          <div className="flex-1" />
          <button onClick={discard}
            className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-gray-50">
            Discard
          </button>
          <button onClick={confirm}
            className="bg-brand-500 text-white px-5 py-2 rounded-lg text-[13px] font-semibold hover:bg-brand-600">
            Confirm Changes
          </button>
        </div>
      )}
    </div>
  );
}

function SettingField({ label, hint, children }) {
  return (
    <label className="block">
      <div className="text-[12px] font-semibold text-gray-700 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}
    </label>
  );
}

// =========================================================
//  ALERT DELIVERY CONFIGURATION
// =========================================================

const CHANNEL_LABELS = { lark_group: "Lark Group", owner_dm: "Owner DM" };
const THRESHOLD_OPTIONS = ["Low", "Medium", "High"];

function AlertDeliveryPage({ settings, navigate, updateSettings }) {
  const [configs, setConfigs] = useP([]);
  const [loading, setLoading] = useP(true);
  const [fetchErr, setFetchErr] = useP(null);
  const [editTarget, setEditTarget] = useP(null); // { config } | { taxonomy } for new
  const [testState, setTestState] = useP({}); // configId -> { loading, success, message }

  // Schedule config local state
  const [schedule, setSchedule] = useP({
    daily: {
      enabled:  settings.dailyAlertEnabled  ?? true,
      time:     settings.dailyAlertTime     || "09:00",
      timezone: settings.dailyAlertTimezone || "Asia/Singapore",
    },
    weekly: {
      enabled:  settings.weeklySummaryEnabled  ?? true,
      day:      settings.weeklySummaryDay      || "Monday",
      time:     settings.weeklySummaryTime     || "09:00",
      timezone: settings.weeklySummaryTimezone || "Asia/Singapore",
    },
  });
  const [scheduleSaving, setScheduleSaving] = useP(false);
  const [scheduleSaveResult, setScheduleSaveResult] = useP(null); // { success, message }

  async function saveSchedule(section) {
    setScheduleSaving(section);
    const patch = section === "daily" ? {
      dailyAlertEnabled:  schedule.daily.enabled,
      dailyAlertTime:     schedule.daily.time,
      dailyAlertTimezone: schedule.daily.timezone,
    } : {
      weeklySummaryEnabled:  schedule.weekly.enabled,
      weeklySummaryDay:      schedule.weekly.day,
      weeklySummaryTime:     schedule.weekly.time,
      weeklySummaryTimezone: schedule.weekly.timezone,
    };
    try {
      const r = await fetch("/api/v2/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) { setScheduleSaveResult({ success: false, message: "Save failed." }); return; }
      if (updateSettings) updateSettings({ ...settings, ...patch });
      setScheduleSaveResult({ success: true, message: "Saved." });
    } catch { setScheduleSaveResult({ success: false, message: "Save failed — check backend." }); }
    finally { setScheduleSaving(false); }
  }

  function loadConfigs() {
    setLoading(true);
    fetch("/api/v2/alert-delivery-configs")
      .then((r) => r.json())
      .then((d) => { setConfigs(d.items || []); setLoading(false); })
      .catch(() => { setFetchErr("Could not load from /api/v2/alert-delivery-configs. Backend may be unreachable."); setLoading(false); });
  }
  useE(() => { loadConfigs(); }, []);

  // Merge taxonomy list with existing configs
  const rows = useM(() => {
    const byTax = {};
    for (const c of configs) byTax[c.taxonomy] = c;
    return VoC.TAXONOMY.map((t) => ({ taxonomy: t, config: byTax[t.key] || null }));
  }, [configs]);

  async function handleToggle(config) {
    try {
      const r = await fetch(`/api/v2/alert-delivery-configs/${config.id}/toggle`, { method: "PATCH" });
      const updated = await r.json();
      setConfigs((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    } catch { alert("Toggle failed. Check that the backend is reachable."); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this alert delivery config?")) return;
    try {
      await fetch(`/api/v2/alert-delivery-configs/${id}`, { method: "DELETE" });
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch { alert("Delete failed."); }
  }

  async function handleTestGroup(id) {
    setTestState((p) => ({ ...p, [id]: { loading: true } }));
    try {
      const r = await fetch(`/api/v2/alert-delivery-configs/${id}/test-group`, { method: "POST" });
      const d = await r.json();
      setTestState((p) => ({ ...p, [id]: d }));
    } catch { setTestState((p) => ({ ...p, [id]: { success: false, message: "Request failed" } })); }
  }

  async function handleSaveConfig(form) {
    const isNew = !form.id;
    const url = isNew ? "/api/v2/alert-delivery-configs" : `/api/v2/alert-delivery-configs/${form.id}`;
    const method = isNew ? "POST" : "PUT";
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert("Save failed: " + (err.detail || r.statusText));
        return;
      }
      const saved = await r.json();
      setConfigs((prev) =>
        isNew ? [...prev, saved] : prev.map((c) => c.id === saved.id ? saved : c)
      );
      setEditTarget(null);
    } catch { alert("Save failed — check backend connection."); }
  }

  const TZ_OPTIONS = ["Asia/Singapore", "Asia/Manila", "UTC"];
  const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div>
      <PageHeader
        title="Alert Setting"
        subtitle="Configure when and where VoC alerts are delivered. Set digest schedules at the top, then configure per-category routing below."
      />

      {/* Schedule config card */}
      <div className={cardCls + " p-6 mb-5"}>
        <h3 className={sectionTitleCls + " mb-4"}>Digest Schedule</h3>
        {scheduleSaveResult && (
          <div className={"text-[12.5px] mb-3 " + (scheduleSaveResult.success ? "text-green-700" : "text-red-600")}>
            {scheduleSaveResult.success ? "✓ " : "✗ "}{scheduleSaveResult.message}
          </div>
        )}
        <div className="grid grid-cols-2 gap-8">
          {/* Daily Alert */}
          <div>
            <div className={sectionTitleCls + " text-[13px] mb-3"}>Daily Alert</div>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSchedule((s) => ({ ...s, daily: { ...s.daily, enabled: !s.daily.enabled } }))}
                  className={"shrink-0 inline-block w-9 h-5 rounded-full transition-colors relative " + (schedule.daily.enabled ? "bg-brand-500" : "bg-gray-300")}>
                  <span className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform " + (schedule.daily.enabled ? "translate-x-4" : "translate-x-0.5")} />
                </button>
                <span className="text-[13px] text-gray-700 font-medium">{schedule.daily.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Send Time</label>
                <input type="time" value={schedule.daily.time}
                  onChange={(e) => setSchedule((s) => ({ ...s, daily: { ...s.daily, time: e.target.value } }))}
                  className="settings-input w-full" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Timezone</label>
                <select value={schedule.daily.timezone}
                  onChange={(e) => setSchedule((s) => ({ ...s, daily: { ...s.daily, timezone: e.target.value } }))}
                  className="settings-input w-full">
                  {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <button onClick={() => saveSchedule("daily")} disabled={scheduleSaving === "daily"}
                className="bg-brand-500 text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
                {scheduleSaving === "daily" ? "Saving…" : "Save Schedule"}
              </button>
            </div>
          </div>

          {/* Weekly Summary */}
          <div>
            <div className={sectionTitleCls + " text-[13px] mb-3"}>Weekly Summary</div>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSchedule((s) => ({ ...s, weekly: { ...s.weekly, enabled: !s.weekly.enabled } }))}
                  className={"shrink-0 inline-block w-9 h-5 rounded-full transition-colors relative " + (schedule.weekly.enabled ? "bg-brand-500" : "bg-gray-300")}>
                  <span className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform " + (schedule.weekly.enabled ? "translate-x-4" : "translate-x-0.5")} />
                </button>
                <span className="text-[13px] text-gray-700 font-medium">{schedule.weekly.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Day of Week</label>
                <select value={schedule.weekly.day}
                  onChange={(e) => setSchedule((s) => ({ ...s, weekly: { ...s.weekly, day: e.target.value } }))}
                  className="settings-input w-full">
                  {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Send Time</label>
                <input type="time" value={schedule.weekly.time}
                  onChange={(e) => setSchedule((s) => ({ ...s, weekly: { ...s.weekly, time: e.target.value } }))}
                  className="settings-input w-full" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Timezone</label>
                <select value={schedule.weekly.timezone}
                  onChange={(e) => setSchedule((s) => ({ ...s, weekly: { ...s.weekly, timezone: e.target.value } }))}
                  className="settings-input w-full">
                  {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <button onClick={() => saveSchedule("weekly")} disabled={scheduleSaving === "weekly"}
                className="bg-brand-500 text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
                {scheduleSaving === "weekly" ? "Saving…" : "Save Schedule"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className={cardCls + " p-4 mb-5 text-[12.5px] text-gray-700 bg-gradient-to-r from-indigo-50/60 to-white flex items-start gap-3"}>
        <svg className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <div className="space-y-1">
          <div className="font-semibold text-indigo-700">How alert delivery works</div>
          <div>When a post crosses its category's <strong>Priority Threshold</strong>, VoC fires an alert. Each config below controls which channels receive it, subject to the cooldown period. <strong>Lark Group</strong> delivery uses a webhook URL; <strong>Owner DM</strong> requires Lark bot credentials on the server.</div>
          <div className="text-[11.5px] text-gray-500 pt-0.5">
            Owner assignment is configured in{" "}
            <a href="#/settings" onClick={(e) => { e.preventDefault(); window.location.hash = "#/settings"; }} className="text-brand-500 font-semibold hover:underline">Settings → Routing Ownership</a>.
            Alert thresholds are in{" "}
            <a href="#/settings" onClick={(e) => { e.preventDefault(); window.location.hash = "#/settings"; }} className="text-brand-500 font-semibold hover:underline">Settings → Engagement Thresholds</a>.
          </div>
        </div>
      </div>

      {loading ? (
        <div className={cardCls + " p-8 text-center text-gray-400 text-sm"}>Loading…</div>
      ) : fetchErr ? (
        <div className={cardCls + " p-8 text-center text-red-600 text-sm"}>{fetchErr}</div>
      ) : (
        <div className={cardCls + " overflow-hidden"}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["On", "Category", "Owner", "Group", "Channels", "Threshold", "Cooldown", "Last Triggered", "Status", ""].map((h) => (
                  <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ taxonomy: t, config: c }) => (
                <tr key={t.key} className="align-middle hover:bg-gray-50/40">
                  {/* Toggle */}
                  <td className="px-3 py-3 border-b border-gray-100">
                    {c ? (
                      <button
                        onClick={() => handleToggle(c)}
                        className={"w-9 h-5 rounded-full transition-colors relative " + (c.enabled ? "bg-brand-500" : "bg-gray-300")}
                        title={c.enabled ? "Click to disable" : "Click to enable"}>
                        <span className={"absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform " + (c.enabled ? "translate-x-4" : "translate-x-0.5")} />
                      </button>
                    ) : (
                      <span className="w-9 h-5 rounded-full bg-gray-100 inline-block" />
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-3 py-3 border-b border-gray-100 font-semibold text-gray-900 whitespace-nowrap">
                    <CategoryTag category={t.key} />
                  </td>

                  {/* Owner */}
                  <td className="px-3 py-3 border-b border-gray-100 text-[12px] text-gray-700 whitespace-nowrap">
                    {c && c.primary_owner_name
                      ? <span className="font-medium">{c.primary_owner_name}</span>
                      : <span className="text-gray-400 italic">—</span>}
                  </td>

                  {/* Group */}
                  <td className="px-3 py-3 border-b border-gray-100 text-[12px] text-gray-700">
                    {c && c.lark_group_name
                      ? <span className="font-medium">{c.lark_group_name}</span>
                      : <span className="text-gray-400 italic">—</span>}
                  </td>

                  {/* Channels */}
                  <td className="px-3 py-3 border-b border-gray-100">
                    {c && c.delivery_channels && c.delivery_channels.length > 0
                      ? <div className="flex flex-wrap gap-1">
                          {c.delivery_channels.map((ch) => (
                            <span key={ch} className={"inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold " + (ch === "lark_group" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700")}>
                              {CHANNEL_LABELS[ch] || ch}
                            </span>
                          ))}
                        </div>
                      : <span className="text-gray-400 text-[12px] italic">None</span>}
                  </td>

                  {/* Threshold */}
                  <td className="px-3 py-3 border-b border-gray-100 text-[12px]">
                    {c ? (
                      <span className={"font-semibold " + (c.priority_threshold === "High" ? "text-red-600" : c.priority_threshold === "Medium" ? "text-amber-600" : "text-green-700")}>
                        {c.priority_threshold}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>

                  {/* Cooldown */}
                  <td className="px-3 py-3 border-b border-gray-100 text-[12px] text-gray-700 whitespace-nowrap">
                    {c ? `${c.cooldown_hours}h` : <span className="text-gray-400">—</span>}
                  </td>

                  {/* Last Triggered */}
                  <td className="px-3 py-3 border-b border-gray-100 text-[12px] text-gray-500 whitespace-nowrap">
                    {c && c.last_triggered_at
                      ? new Date(c.last_triggered_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : <span className="text-gray-400">Never</span>}
                  </td>

                  {/* Delivery status */}
                  <td className="px-3 py-3 border-b border-gray-100">
                    {c && c.last_delivery_status ? (
                      <span className={"text-[11px] font-semibold px-2 py-0.5 rounded-full " + (c.last_delivery_status === "sent" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>
                        {c.last_delivery_status}
                      </span>
                    ) : <span className="text-gray-400 text-[12px]">—</span>}
                    {/* Test result feedback */}
                    {testState[c && c.id] && !testState[c.id].loading && (
                      <div className={"text-[10.5px] mt-1 " + (testState[c.id].success ? "text-green-700" : "text-red-600")}>
                        {testState[c.id].success ? "✓ " : "✗ "}{testState[c.id].message}
                      </div>
                    )}
                    {testState[c && c.id] && testState[c.id].loading && (
                      <div className="text-[10.5px] mt-1 text-gray-400">Sending…</div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3 border-b border-gray-100 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {c ? (
                        <>
                          <button onClick={() => setEditTarget({ config: c })}
                            className="text-[11.5px] text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 font-medium">
                            Edit
                          </button>
                          <button onClick={() => handleTestGroup(c.id)}
                            className="text-[11.5px] text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 font-medium"
                            title="Send test message to Lark group">
                            Test
                          </button>
                          <button onClick={() => handleDelete(c.id)}
                            className="text-[11.5px] text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                            ✕
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setEditTarget({ taxonomy: t.key })}
                          className="text-[11.5px] text-brand-500 hover:text-brand-700 px-2 py-1 rounded hover:bg-brand-50 font-semibold">
                          + Configure
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create modal */}
      {editTarget && (
        <AlertDeliveryModal
          taxonomy={editTarget.taxonomy || (editTarget.config && editTarget.config.taxonomy)}
          config={editTarget.config || null}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
}

function AlertDeliveryModal({ taxonomy, config, onClose, onSave }) {
  const isNew = !config;
  const [form, setForm] = useP({
    id:                      config ? config.id : undefined,
    taxonomy:                taxonomy,
    enabled:                 config ? config.enabled : true,
    primary_owner_name:      config ? (config.primary_owner_name || "") : "",
    primary_owner_lark_open_id: config ? (config.primary_owner_lark_open_id || "") : "",
    lark_group_name:         config ? (config.lark_group_name || "") : "",
    lark_group_webhook:      config ? (config.lark_group_webhook || "") : "",
    delivery_channels:       config ? (config.delivery_channels || []) : [],
    priority_threshold:      config ? config.priority_threshold : "High",
    cooldown_hours:          config ? config.cooldown_hours : 24,
  });
  const [saving, setSaving] = useP(false);
  const [dmTestResult, setDmTestResult] = useP(null);

  function set(key, val) { setForm((p) => ({ ...p, [key]: val })); }

  function toggleChannel(ch) {
    const chs = form.delivery_channels;
    set("delivery_channels", chs.includes(ch) ? chs.filter((c) => c !== ch) : [...chs, ch]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      primary_owner_name: form.primary_owner_name || null,
      primary_owner_lark_open_id: form.primary_owner_lark_open_id || null,
      lark_group_name: form.lark_group_name || null,
      lark_group_webhook: form.lark_group_webhook || null,
    };
    await onSave(payload);
    setSaving(false);
  }

  async function testOwnerDm() {
    if (!form.id) return;
    setDmTestResult({ loading: true });
    try {
      const r = await fetch(`/api/v2/alert-delivery-configs/${form.id}/test-owner-dm`, { method: "POST" });
      const d = await r.json();
      setDmTestResult(d);
    } catch { setDmTestResult({ success: false, message: "Request failed" }); }
  }

  // Lock scroll behind modal
  useE(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const taxLabel = VoC.TAXONOMY.find((t) => t.key === taxonomy);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
        <div className="px-6 pt-5 pb-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="font-bold text-gray-900 text-[15px]">{isNew ? "Configure Alert Delivery" : "Edit Alert Delivery"}</div>
            <div className="text-[12px] text-gray-500 mt-0.5">{taxLabel ? taxLabel.label : taxonomy}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Owner DM section */}
          <div>
            <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-2.5">Owner Direct Message</div>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Owner Name</label>
                <input value={form.primary_owner_name} onChange={(e) => set("primary_owner_name", e.target.value)}
                  placeholder="e.g. Risk Team Lead"
                  className="settings-input w-full" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Lark Open ID</label>
                <input value={form.primary_owner_lark_open_id} onChange={(e) => set("primary_owner_lark_open_id", e.target.value)}
                  placeholder="ou_xxxxxxxxxxxxxxxx"
                  className="settings-input w-full font-mono text-[12px]" />
                <div className="text-[11px] text-gray-400 mt-1">Find in Lark Admin → Members. Owner DM requires bot credentials on the server.</div>
              </div>
              {!isNew && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={testOwnerDm}
                    className="text-[12px] text-amber-600 hover:text-amber-800 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-50 font-semibold">
                    Test Owner DM
                  </button>
                  {dmTestResult && !dmTestResult.loading && (
                    <span className={"text-[11.5px] " + (dmTestResult.success ? "text-green-700" : "text-gray-500")}>
                      {dmTestResult.success ? "✓ " : "ℹ "}{dmTestResult.message}
                    </span>
                  )}
                  {dmTestResult && dmTestResult.loading && <span className="text-[11.5px] text-gray-400">Sending…</span>}
                </div>
              )}
            </div>
          </div>

          {/* Lark Group section */}
          <div>
            <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-2.5">Lark Group Channel</div>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Group Name</label>
                <input value={form.lark_group_name} onChange={(e) => set("lark_group_name", e.target.value)}
                  placeholder="e.g. #voc-risk-alerts"
                  className="settings-input w-full" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">Webhook URL</label>
                <input type="password" value={form.lark_group_webhook} onChange={(e) => set("lark_group_webhook", e.target.value)}
                  placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/…"
                  className="settings-input w-full font-mono text-[11.5px]" />
                <div className="text-[11px] text-gray-400 mt-1">Custom bot webhook from Lark group settings. Value is stored securely and masked here.</div>
              </div>
            </div>
          </div>

          {/* Delivery channels */}
          <div>
            <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-2.5">Active Delivery Channels</div>
            <div className="flex gap-4">
              {[["lark_group", "Lark Group", "indigo"], ["owner_dm", "Owner DM", "amber"]].map(([ch, label, color]) => (
                <label key={ch} className={"flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border " + (form.delivery_channels.includes(ch) ? `border-${color}-300 bg-${color}-50` : "border-gray-200")}>
                  <input type="checkbox" checked={form.delivery_channels.includes(ch)} onChange={() => toggleChannel(ch)}
                    className="accent-brand-500 w-3.5 h-3.5" />
                  <span className={"text-[12.5px] font-semibold " + (form.delivery_channels.includes(ch) ? `text-${color}-700` : "text-gray-600")}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Threshold + Cooldown */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">Priority Threshold</label>
              <select value={form.priority_threshold} onChange={(e) => set("priority_threshold", e.target.value)}
                className="settings-input w-full">
                {THRESHOLD_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="text-[11px] text-gray-400 mt-1">Alert fires when post reaches this engagement level.</div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">Cooldown (hours)</label>
              <input type="number" min="1" max="168" value={form.cooldown_hours} onChange={(e) => set("cooldown_hours", Number(e.target.value))}
                className="settings-input w-full" />
              <div className="text-[11px] text-gray-400 mt-1">Minimum gap between alerts for this category.</div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-between border-t border-gray-100">
            <button type="button" onClick={onClose} className="text-[13px] text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
            <button type="submit" disabled={saving}
              className="bg-brand-500 text-white px-5 py-2 rounded-lg text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
              {saving ? "Saving…" : isNew ? "Create Config" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================
//  ALERT HISTORY
// =========================================================

function AlertMessageDetailModal({ msg, onClose }) {
  useE(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const ALERT_TYPE_STYLES = {
    "daily_alert":    { bg: "#EFF6FF", text: "#1D4ED8", label: "Daily Alert" },
    "weekly_summary": { bg: "#F5F3FF", text: "#6D28D9", label: "Weekly Summary" },
    "post_alert":     { bg: "#FFF7ED", text: "#C2410C", label: "Post Alert" },
  };
  const STATUS_BADGE = {
    sent:    { bg: "#D1FAE5", text: "#065F46" },
    failed:  { bg: "#FEE2E2", text: "#991B1B" },
    pending: { bg: "#F3F4F6", text: "#6B7280" },
    skipped: { bg: "#F3F4F6", text: "#9CA3AF" },
  };
  const ts = ALERT_TYPE_STYLES[msg.alert_type] || ALERT_TYPE_STYLES["post_alert"];
  const ss = STATUS_BADGE[msg.status] || STATUS_BADGE["pending"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-y-auto max-h-[90vh]">
        <div className="px-6 pt-5 pb-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold mr-2" style={{ background: ts.bg, color: ts.text }}>{ts.label}</span>
            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: ss.bg, color: ss.text }}>{msg.status}</span>
            <div className="font-bold text-gray-900 text-[15px] mt-1.5">{msg.title || "(no title)"}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div><span className="text-gray-500">Generated</span><br /><strong>{msg.generated_at ? new Date(msg.generated_at).toLocaleString() : "—"}</strong></div>
            <div><span className="text-gray-500">Sent</span><br /><strong>{msg.sent_at ? new Date(msg.sent_at).toLocaleString() : "—"}</strong></div>
            <div><span className="text-gray-500">Channel</span><br /><strong>{msg.delivery_channel || "—"}</strong></div>
            <div><span className="text-gray-500">Target</span><br /><strong className="break-all">{msg.target_name || msg.target_id || "—"}</strong></div>
            {msg.taxonomy && <div><span className="text-gray-500">Category</span><br /><CategoryTag category={msg.taxonomy} /></div>}
            {msg.error_message && (
              <div className="col-span-2">
                <span className="text-red-600 font-semibold text-[12px]">Error</span>
                <div className="text-[12px] text-red-700 mt-0.5 font-mono bg-red-50 rounded p-2 break-all">{msg.error_message}</div>
              </div>
            )}
          </div>
          {msg.message_body && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">Message Body</div>
              <pre className="whitespace-pre-wrap text-[12.5px] text-gray-800 bg-gray-50 rounded-xl p-4 border border-gray-100 font-sans leading-relaxed max-h-[300px] overflow-y-auto">{msg.message_body}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertHistoryPage({ settings }) {
  const [messages, setMessages] = useP([]);
  const [loading, setLoading] = useP(true);
  const [fetchErr, setFetchErr] = useP(null);
  const [detailMsg, setDetailMsg] = useP(null);

  useE(() => {
    fetch("/api/v2/alert-messages?limit=100")
      .then((r) => r.json())
      .then((d) => { setMessages(d.items || []); setLoading(false); })
      .catch(() => { setFetchErr("Could not load from /api/v2/alert-messages. Backend may be unreachable."); setLoading(false); });
  }, []);

  const ALERT_TYPE_STYLES = {
    "daily_alert":    { bg: "#EFF6FF", text: "#1D4ED8", label: "Daily Alert" },
    "weekly_summary": { bg: "#F5F3FF", text: "#6D28D9", label: "Weekly Summary" },
    "post_alert":     { bg: "#FFF7ED", text: "#C2410C", label: "Post Alert" },
  };
  const STATUS_STYLES_HISTORY = {
    "sent":    { bg: "#D1FAE5", text: "#065F46" },
    "failed":  { bg: "#FEE2E2", text: "#991B1B" },
    "pending": { bg: "#F3F4F6", text: "#6B7280" },
    "skipped": { bg: "#F3F4F6", text: "#9CA3AF", italic: true },
  };

  return (
    <div>
      <PageHeader
        title="Alert History"
        subtitle="Log of all daily alerts and weekly summaries generated by the scheduler."
      />

      {loading ? (
        <div className={cardCls + " p-8 text-center text-gray-400 text-sm"}>Loading…</div>
      ) : fetchErr ? (
        <div className={cardCls + " p-8 text-center text-red-600 text-sm"}>{fetchErr}</div>
      ) : messages.length === 0 ? (
        <div className={cardCls + " p-10 text-center text-gray-400 text-sm"}>
          No alert messages yet. Daily alerts and weekly summaries will appear here once the schedule runs.
        </div>
      ) : (
        <div className={cardCls + " overflow-hidden"}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Date / Time", "Alert Type", "Category", "Summary", "Channel", "Target", "Status", "Sent At", "Actions"].map((h) => (
                  <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => {
                const ts = ALERT_TYPE_STYLES[msg.alert_type] || ALERT_TYPE_STYLES["post_alert"];
                const ss = STATUS_STYLES_HISTORY[msg.status] || STATUS_STYLES_HISTORY["pending"];
                const dateStr = msg.generated_at
                  ? new Date(msg.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : new Date(msg.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                const sentStr = msg.sent_at
                  ? new Date(msg.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "—";
                const summaryText = msg.message_body ? msg.message_body.split("\n")[0] : "—";
                return (
                  <tr key={msg.id} className="align-middle hover:bg-gray-50/40">
                    <td className="px-3 py-3 border-b border-gray-100 text-[11.5px] text-gray-500 whitespace-nowrap">{dateStr}</td>
                    <td className="px-3 py-3 border-b border-gray-100">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                        style={{ background: ts.bg, color: ts.text }}>{ts.label}</span>
                    </td>
                    <td className="px-3 py-3 border-b border-gray-100">
                      {msg.taxonomy ? <CategoryTag category={msg.taxonomy} /> : <span className="text-gray-400 text-[12px]">—</span>}
                    </td>
                    <td className="px-3 py-3 border-b border-gray-100 max-w-[260px]">
                      <span className="text-[12px] text-gray-700 line-clamp-2">{summaryText}</span>
                    </td>
                    <td className="px-3 py-3 border-b border-gray-100 text-[12px] text-gray-600 whitespace-nowrap">{msg.delivery_channel || "—"}</td>
                    <td className="px-3 py-3 border-b border-gray-100 text-[12px] text-gray-600 max-w-[160px] truncate" title={msg.target_name || msg.target_id || ""}>
                      {msg.target_name || (msg.target_id ? msg.target_id.slice(0, 40) + "…" : "—")}
                    </td>
                    <td className="px-3 py-3 border-b border-gray-100">
                      <span className={"inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap " + (ss.italic ? "italic" : "")}
                        style={{ background: ss.bg, color: ss.text }}>{msg.status}</span>
                    </td>
                    <td className="px-3 py-3 border-b border-gray-100 text-[11.5px] text-gray-500 whitespace-nowrap">{sentStr}</td>
                    <td className="px-3 py-3 border-b border-gray-100">
                      <button onClick={() => setDetailMsg(msg)}
                        className="text-[11.5px] text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 font-medium">
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailMsg && <AlertMessageDetailModal msg={detailMsg} onClose={() => setDetailMsg(null)} />}
    </div>
  );
}

// =========================================================
//  CORRECTION LOG
// =========================================================
function CorrectionLogPage({ settings, log, clearLog }) {
  const labelOf = {
    category:    "Corrected category",
    sentiment:   "Corrected sentiment",
    owner:       "Corrected owner",
    not_relevant: "Marked not relevant",
    duplicate:   "Marked duplicate",
    comment:     "Added comment",
  };

  return (
    <div>
      <PageHeader title="Correction Log" subtitle="Every classification or routing correction made by reviewers. Useful for spotting recurring misclassifications." />

      <div className={cardCls + " p-4 mb-4 flex items-center gap-3"}>
        <span className="text-[12.5px] text-gray-600">{log.length} correction{log.length === 1 ? "" : "s"} recorded</span>
        <div className="flex-1" />
        <button onClick={clearLog} className="text-[12.5px] text-gray-500 hover:text-coral hover:underline">Clear log</button>
      </div>

      {log.length === 0 ? (
        <div className={cardCls + " p-8 text-center text-gray-400 text-sm"}>
          No corrections yet. Open a mention's "Correct" menu in the Mentions or Items Needing Attention page to log one.
        </div>
      ) : (
        <div className={cardCls + " overflow-hidden"}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["When", "Mention", "Type", "Was", "→", "Now", "Comment", "By"].map((h) => (
                  <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-2.5 py-2 border-b border-gray-200 bg-gray-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => {
                const tax = VoC.taxonomyFor(e.originalCategory);
                const newTax = e.correctedCategory ? VoC.taxonomyFor(e.correctedCategory) : null;
                return (
                  <tr key={i} className="align-top">
                    <td className="px-2.5 py-3 border-b border-gray-100 text-[11.5px] text-gray-500 whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-2.5 py-3 border-b border-gray-100 max-w-[280px]">
                      <div className="text-[12.5px] text-gray-800 line-clamp-2">"{e.mentionText}"</div>
                    </td>
                    <td className="px-2.5 py-3 border-b border-gray-100 text-[12px] font-semibold text-gray-700 whitespace-nowrap">{labelOf[e.correctionType] || e.correctionType}</td>
                    <td className="px-2.5 py-3 border-b border-gray-100">
                      {e.correctionType === "owner" ? <OwnerPill owner={e.originalOwner} />
                        : e.correctionType === "sentiment" ? <SentimentBadge sentiment={e.originalSentiment || "Neutral"} />
                        : tax && <CategoryTag category={tax.key} />}
                    </td>
                    <td className="px-2.5 py-3 border-b border-gray-100 text-gray-400">→</td>
                    <td className="px-2.5 py-3 border-b border-gray-100">
                      {e.correctionType === "category" && newTax && <CategoryTag category={newTax.key} />}
                      {e.correctionType === "sentiment" && <SentimentBadge sentiment={e.correctedSentiment || "Neutral"} />}
                      {e.correctionType === "owner" && <OwnerPill owner={e.correctedOwner} />}
                      {e.correctionType === "not_relevant" && <StatusPill status="Not Relevant" />}
                      {e.correctionType === "duplicate" && <StatusPill status="Duplicate" />}
                      {e.correctionType === "comment" && <span className="text-[11.5px] text-gray-500">comment</span>}
                    </td>
                    <td className="px-2.5 py-3 border-b border-gray-100 text-[12px] text-gray-600 max-w-[220px]">{e.comment || "—"}</td>
                    <td className="px-2.5 py-3 border-b border-gray-100 text-[11.5px] text-gray-500 whitespace-nowrap">{e.updatedBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  OverviewPage, MentionsPage, ActionQueuePage, TaxonomyPage,
  RoutingMatrixPage, MethodologyPage, RationalePage, SettingsPage,
  AlertDeliveryPage, AlertHistoryPage, CorrectionLogPage,
});
