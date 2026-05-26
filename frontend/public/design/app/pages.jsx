// =============================================================
// Atome VoC — pages (v3 · monitoring-first)
// =============================================================

const { useState: useP, useMemo: useM } = React;

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

      {/* KPI Cards — 5 across */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <button onClick={() => navigate("mentions")} className="text-left">
          <KPICard label="Total mentions" value={totalMentions} />
        </button>
        <button onClick={() => openDrillDown({ kind: "sentiment", value: "Positive" })} className="text-left">
          <KPICard label="Positive"
                   value={positiveCnt}
                   suffix={totalMentions ? `${Math.round(100 * positiveCnt / totalMentions)}%` : ""}  />
        </button>
        <button onClick={() => openDrillDown({ kind: "sentiment", value: "Negative" })} className="text-left">
          <KPICard label="Negative"
                   value={negativeCnt}
                   suffix={totalMentions ? `${Math.round(100 * negativeCnt / totalMentions)}%` : ""}
                   critical={negativeCnt > 0} />
        </button>
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
//  TAXONOMY
// =========================================================
function TaxonomyPage({ settings, updateSettings }) {
  const owners = [...new Set(Object.values(VoC.DEFAULT_OWNERSHIP))];

  function setOwner(catKey, owner) {
    updateSettings({ ...settings, ownership: { ...settings.ownership, [catKey]: owner } });
  }

  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader title="Taxonomy" subtitle="The single source of truth for category ownership. The Routing Matrix follows this table — no separate owner mapping." />

      <div className={cardCls + " p-4 mb-4 text-[12.5px] text-gray-700 bg-gradient-to-r from-brand-50/50 to-white"}>
        <span className="font-bold text-brand-500">One category = one primary owner. </span>
        Change a category's owner here and it flows everywhere — Routing Matrix, Action Queue, Why-routed explanations.
      </div>

      <div className={cardCls + " overflow-hidden"}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Category", "Primary Owner", "Description", "Common signals", "Default action", "Escalation flag", "Escalation note"].map((h) => (
                <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50 align-top">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VoC.TAXONOMY.map((t) => (
              <tr key={t.key} className="align-top hover:bg-gray-50/50">
                <td className="px-3 py-3 border-b border-gray-100 font-semibold text-gray-900 whitespace-nowrap">{t.label}</td>
                <td className="px-3 py-3 border-b border-gray-100">
                  <select value={VoC.ownerOf(t.key, settings)} onChange={(e) => setOwner(t.key, e.target.value)}
                          className="bg-[#f0ff5f]/30 text-brand-500 px-2 py-0.5 rounded-full text-[11px] font-semibold border-0 focus:outline-none">
                    {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
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
            ))}
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
        subtitle="Which team owns each category and who they loop in. Edit owners in Taxonomy."
      />

      <div className={cardCls + " p-4 mb-4 text-[12.5px] text-gray-700 bg-gradient-to-r from-brand-50/50 to-white flex items-start gap-3"}>
        <svg className="w-4 h-4 mt-0.5 text-brand-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="font-bold text-brand-500 mb-0.5">One Primary Owner per category. Secondary teams are CC'd on High-engagement alerts.</div>
          High-engagement posts (engagement &gt; {settings.engagementThresholds.mediumMax}) send a Lark card to the <strong>shared group channel</strong> configured via <code>LARK_ALERT_WEBHOOK_URL</code>. The card shows the Primary Owner and CC teams as metadata — it is a group notification, not a personal DM to the owner.
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
              const secondary = VoC.secondaryTeamsOf(t.key);
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

// =========================================================
//  SETTINGS — engagement thresholds + taxonomy ownership + display
// =========================================================
function SettingsPage({ settings, updateSettings, resetSettings }) {
  const [draftLow, setDraftLow]   = useP(settings.engagementThresholds.lowMax);
  const [draftMed, setDraftMed]   = useP(settings.engagementThresholds.mediumMax);
  const [draftKW, setDraftKW]     = useP(settings.sensitiveKeywords.join(", "));
  const [draftMarket, setMarket]  = useP(settings.defaultMarket);
  const [draftSource, setSource]  = useP(settings.defaultSource);
  const [draftWindow, setWindow]  = useP(settings.defaultTimeWindow);
  const [error, setError] = useP(null);

  function save() {
    const lo = Number(draftLow), md = Number(draftMed);
    if (!Number.isFinite(lo) || lo < 0) return setError("Low max must be a number ≥ 0.");
    if (!Number.isFinite(md) || md <= lo) return setError("Medium max must be greater than Low max.");
    setError(null);
    updateSettings({
      ...settings,
      engagementThresholds: { lowMax: lo, mediumMax: md },
      sensitiveKeywords: draftKW.split(",").map((s) => s.trim()).filter(Boolean),
      defaultMarket: draftMarket, defaultSource: draftSource, defaultTimeWindow: draftWindow,
    });
  }

  function reset() {
    const d = VoC.DEFAULT_SETTINGS;
    setDraftLow(d.engagementThresholds.lowMax);
    setDraftMed(d.engagementThresholds.mediumMax);
    setDraftKW(d.sensitiveKeywords.join(", "));
    setMarket(d.defaultMarket); setSource(d.defaultSource); setWindow(d.defaultTimeWindow);
    resetSettings();
  }

  function setOwner(catKey, owner) {
    updateSettings({ ...settings, ownership: { ...settings.ownership, [catKey]: owner } });
  }

  const draftThresholds = { lowMax: Number(draftLow), mediumMax: Number(draftMed) };
  const previewCounts = Number.isFinite(draftThresholds.lowMax) && Number.isFinite(draftThresholds.mediumMax) && draftThresholds.mediumMax > draftThresholds.lowMax
    ? levelCountsFor(VoC.MENTIONS, draftThresholds) : null;

  const owners = [...new Set(Object.values(VoC.DEFAULT_OWNERSHIP))];

  return (
    <div className="max-w-[920px]">
      <PageHeader title="Settings" subtitle="Control engagement thresholds, ownership, and display defaults. Changes apply globally on save." />

      <div className={cardCls + " p-6 mb-4"}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-900">Engagement thresholds</h3>
          <span className="text-[11.5px] text-gray-400">Applies across Overview, Mentions, Action Queue, Routing Matrix, Methodology</span>
        </div>
        <p className="text-[12.5px] text-gray-500 mb-4">High engagement is automatically anything above Medium max.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <SettingField label="Low max" hint="Engagement ≤ this is Low">
            <input type="number" min="0" value={draftLow} onChange={(e) => setDraftLow(e.target.value)} className="settings-input" />
          </SettingField>
          <SettingField label="Medium max" hint="Engagement ≤ this is Medium. High = above this.">
            <input type="number" min="0" value={draftMed} onChange={(e) => setDraftMed(e.target.value)} className="settings-input" />
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

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-1">Taxonomy ownership</h3>
        <p className="text-[12.5px] text-gray-500 mb-3">Each category has exactly one Primary Owner. Changes here flow to the Routing Matrix and every Why-routed explanation.</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {VoC.TAXONOMY.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
              <div className="text-[13px] font-semibold text-gray-900">{t.label}</div>
              <select value={VoC.ownerOf(t.key, settings)} onChange={(e) => setOwner(t.key, e.target.value)}
                      className="bg-[#f0ff5f]/30 text-brand-500 px-2 py-1 rounded text-[12px] font-semibold border-0 focus:outline-none">
                {owners.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-1">Routing rules</h3>
        <p className="text-[12.5px] text-gray-500 mb-3">Sensitive-keyword escalation is the only routing rule you tune here. The category→owner mapping lives in the section above.</p>
        <SettingField label="Sensitive keywords" hint="Comma-separated. A mention containing any of these triggers the Escalation flag regardless of engagement.">
          <input type="text" value={draftKW} onChange={(e) => setDraftKW(e.target.value)} className="settings-input w-full" />
        </SettingField>
      </div>

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-3">Display defaults</h3>
        <div className="grid grid-cols-3 gap-4">
          <SettingField label="Default market"><input type="text" value={draftMarket} onChange={(e) => setMarket(e.target.value)} className="settings-input" /></SettingField>
          <SettingField label="Default source"><input type="text" value={draftSource} onChange={(e) => setSource(e.target.value)} className="settings-input" /></SettingField>
          <SettingField label="Default time period">
            <select value={draftWindow} onChange={(e) => setWindow(e.target.value)} className="settings-input">
              <option value="24h">24h</option><option value="7d">7d</option><option value="30d">30d</option><option value="90d">90d</option>
            </select>
          </SettingField>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] px-4 py-2.5 rounded-lg mb-3">{error}</div>}

      <div className="flex items-center gap-2">
        <button onClick={save} className="bg-brand-500 text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-brand-600">Save settings</button>
        <button onClick={reset} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-gray-50">Reset to defaults</button>
        <div className="flex-1" />
        <a href="#/methodology" className="text-[12.5px] text-coral underline">How thresholds are applied →</a>
      </div>
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
  RoutingMatrixPage, MethodologyPage, RationalePage, SettingsPage, CorrectionLogPage,
});
