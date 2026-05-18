// =============================================================
// Atome VoC — pages (v2 · simplified)
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

function byOwner(mentions, settings) {
  const m = {};
  for (const x of mentions) {
    const o = VoC.ownerOf(x.category, settings);
    m[o] = (m[o] || 0) + 1;
  }
  return Object.entries(m).map(([o, n]) => ({ owner: o, count: n })).sort((a, b) => b.count - a.count);
}

function trendByDay(mentions, thresholds) {
  const buckets = {};
  for (const m of mentions) {
    const day = m.created.slice(0, 10);
    if (!buckets[day]) buckets[day] = { day, total: 0, low: 0, medium: 0, high: 0 };
    const lv = VoC.engagementLevel(VoC.engagementOf(m), thresholds);
    buckets[day].total++;
    if (lv === "Low") buckets[day].low++; else if (lv === "Medium") buckets[day].medium++; else buckets[day].high++;
  }
  return Object.values(buckets).sort((a, b) => a.day.localeCompare(b.day));
}

// =========================================================
//  OVERVIEW — sparse, snapshot-led
// =========================================================
function OverviewPage({ settings, openDrillDown, openCorrection, navigate }) {
  const allMentions = VoC.MENTIONS.map((m) => VoC.viewMention(m, settings));
  const counts = levelCountsFor(allMentions, settings.engagementThresholds);
  const cats = byCategory(allMentions);
  const owners = byOwner(allMentions, settings);
  const trend = trendByDay(allMentions, settings.engagementThresholds);
  const openActions = allMentions.filter((m) => !["Closed", "Rejected", "Not Relevant"].includes(m.status)).length;
  const topCat = cats[0];
  const topOwner = owners[0];

  // Highest-engagement open item
  const topEngagement = allMentions
    .filter((m) => !["Closed", "Rejected", "Not Relevant"].includes(m.status))
    .sort((a, b) => VoC.engagementOf(b) - VoC.engagementOf(a))[0];

  const topActionItems = allMentions
    .filter((m) => !["Closed", "Rejected", "Not Relevant"].includes(m.status))
    .sort((a, b) => VoC.engagementOf(b) - VoC.engagementOf(a))
    .slice(0, 4);

  // trend SVG
  const W = 620, H = 200, pT = 16, pR = 14, pB = 28, pL = 36;
  const cw = W - pL - pR, ch = H - pT - pB;
  const maxTotal = Math.max(...trend.map((t) => t.total), 1);
  const yMax = Math.max(5, Math.ceil(maxTotal / 5) * 5);
  const xStep = trend.length > 1 ? cw / (trend.length - 1) : cw;
  const xOf = (i) => pL + i * xStep;
  const yOf = (v) => pT + ch - (v / yMax) * ch;

  return (
    <div>
      <DataFreshnessBanner settings={settings} />

      <PageHeader
        title="Executive Overview · Philippines"
        subtitle="VoC routing for Atome PH — issues, owners, and what needs action today."
        right={null}
      />

      {/* TODAY'S SNAPSHOT */}
      <div className="rounded-[14px] p-5 mb-4 shadow-sm" style={{ background: "linear-gradient(135deg, #141c30 0%, #1a2440 100%)", color: "#fff" }}>
        <div className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: "#f0ff5f" }}>Today's VoC snapshot</div>
        <div className="grid grid-cols-5 gap-4">
          <SnapshotStat label="Top issue"                value={topCat ? VoC.taxonomyFor(topCat.category).label : "—"}    sub={topCat ? `${topCat.count} mentions` : ""}  onClick={topCat ? () => openDrillDown({ kind: "category", value: topCat.category }) : null} />
          <SnapshotStat label="Primary owner"            value={topCat ? VoC.ownerOf(topCat.category, settings) : "—"}    sub="Per Taxonomy"                                 onClick={topCat ? () => openDrillDown({ kind: "owner", value: VoC.ownerOf(topCat.category, settings) }) : null} />
          <SnapshotStat label="Highest-engagement topic" value={topEngagement ? VoC.taxonomyFor(topEngagement.category).label : "—"} sub={topEngagement ? `${VoC.engagementOf(topEngagement)} engagement` : ""}     onClick={topEngagement ? () => openDrillDown({ kind: "category", value: topEngagement.category }) : null} />
          <SnapshotStat label="Items needing action"     value={openActions}                                                sub={`of ${counts.total} total`}                  onClick={() => navigate("queue")} />
          <SnapshotStat label="High-engagement mentions" value={counts.high}                                                sub={`${Math.round(100 * counts.high / Math.max(counts.total, 1))}% of volume`} onClick={() => openDrillDown({ kind: "level", value: "High" })} />
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 mb-4">
        {/* Trend chart */}
        <div className={cardCls + " p-5"}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className={sectionTitleCls}>Engagement trend</h3>
              <div className={sectionSubCls}>Volume by day · click a day for the drill-down</div>
            </div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
            {[yMax, Math.round(yMax * 0.66), Math.round(yMax * 0.33)].map((t) => (
              <g key={t}>
                <line x1={pL} y1={yOf(t)} x2={W - pR} y2={yOf(t)} stroke="#E5E7EB" strokeDasharray="3 3" />
                <text x={pL - 6} y={yOf(t) + 3.5} textAnchor="end" fontSize="10" fill="#9CA3AF">{t}</text>
              </g>
            ))}
            <line x1={pL} y1={yOf(0)} x2={W - pR} y2={yOf(0)} stroke="#E5E7EB" />
            <text x={pL - 6} y={yOf(0) + 3.5} textAnchor="end" fontSize="10" fill="#9CA3AF">0</text>
            <path d={`M${xOf(0)},${yOf(trend[0].total)} ` + trend.map((t, i) => `L${xOf(i)},${yOf(t.total)}`).join(" ") + ` L${xOf(trend.length - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`} fill="#141c30" opacity="0.06" />
            <polyline fill="none" stroke="#141c30" strokeWidth="2.5" strokeLinejoin="round"
                      points={trend.map((t, i) => `${xOf(i)},${yOf(t.total)}`).join(" ")} />
            {trend.map((t, i) => (
              <g key={t.day} style={{ cursor: "pointer" }} onClick={() => openDrillDown({ kind: "day", value: t.day })}>
                <rect x={xOf(i) - xStep / 2} y={pT} width={xStep || cw} height={ch} fill="transparent" />
                <circle cx={xOf(i)} cy={yOf(t.total)} r="4" fill="#141c30" />
                <text x={xOf(i)} y={yOf(t.total) - 9} textAnchor="middle" fontSize="10" fontWeight="600" fill="#374151">{t.total}</text>
                <text x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#9CA3AF">{t.day.slice(5)}</text>
              </g>
            ))}
          </svg>
          <div className="text-[10.5px] text-gray-400 mt-2 text-right">Click any chart section to view details</div>
        </div>

        {/* Owner breakdown */}
        <div className={cardCls + " p-5"}>
          <div className="mb-2">
            <h3 className={sectionTitleCls}>Owner breakdown</h3>
            <div className={sectionSubCls}>From Taxonomy · click an owner to drill in</div>
          </div>
          <div className="flex flex-col gap-1.5 mt-1">
            {owners.map((o) => {
              const pct = (o.count / counts.total) * 100;
              return (
                <button key={o.owner} onClick={() => openDrillDown({ kind: "owner", value: o.owner })}
                        className="grid grid-cols-[1fr_auto_30px] items-center gap-2 py-1.5 px-1 rounded hover:bg-gray-50 text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <OwnerPill owner={o.owner} />
                  </div>
                  <div className="w-[100px] bg-gray-100 rounded h-2 overflow-hidden">
                    <div className="h-full rounded" style={{ width: pct + "%", background: "#141c30" }}></div>
                  </div>
                  <div className="text-right text-[13px] font-semibold text-gray-800">{o.count}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
        {/* Top categories */}
        <div className={cardCls + " p-5"}>
          <div className="mb-2">
            <h3 className={sectionTitleCls}>Top categories</h3>
            <div className={sectionSubCls}>Click a category for the drill-down</div>
          </div>
          <div className="flex flex-col gap-1.5">
            {cats.map((c) => {
              const tax = VoC.taxonomyFor(c.category);
              const owner = VoC.ownerOf(c.category, settings);
              const maxCount = cats[0].count;
              const pct = (c.count / maxCount) * 100;
              return (
                <button key={c.category} onClick={() => openDrillDown({ kind: "category", value: c.category })}
                        className="grid grid-cols-[170px_1fr_30px_110px] items-center gap-2.5 py-1.5 px-1 rounded hover:bg-gray-50 text-left">
                  <div className="text-[13px] text-gray-700 truncate">{tax.label}</div>
                  <div className="bg-gray-100 rounded h-2.5 overflow-hidden">
                    <div className="h-full rounded bg-gradient-to-r from-brand-500 to-brand-300" style={{ width: pct + "%" }}></div>
                  </div>
                  <div className="text-right font-semibold text-gray-800 text-[12.5px]">{c.count}</div>
                  <div><OwnerPill owner={owner} /></div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action queue preview */}
        <div className={cardCls + " p-5"}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className={sectionTitleCls}>Action queue summary</h3>
              <div className={sectionSubCls}>Top items needing action right now</div>
            </div>
            <a href="#/queue" onClick={(e) => { e.preventDefault(); navigate("queue"); }}
               className="text-[12px] text-coral font-semibold hover:underline">Open queue →</a>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            {topActionItems.map((m) => (
              <MentionCard key={m.id} mention={m} settings={settings} onCorrect={openCorrection} dense />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapshotStat({ label, value, sub, onClick }) {
  const Inner = (
    <div className="text-left">
      <div className="text-[10.5px] uppercase tracking-wider text-white/55 font-semibold mb-1">{label}</div>
      <div className="text-[20px] font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-white/60 mt-1">{sub}</div>}
    </div>
  );
  if (!onClick) return Inner;
  return (
    <button onClick={onClick} className="text-left rounded-lg hover:bg-white/5 -m-1 p-1 transition-colors">{Inner}</button>
  );
}

// =========================================================
//  MENTIONS
// =========================================================
function MentionsPage({ settings, openCorrection }) {
  const [filterCat, setFilterCat] = useP("all");
  const [filterLevel, setFilterLevel] = useP("all");
  const [filterPlat, setFilterPlat] = useP("all");
  const [filterStatus, setFilterStatus] = useP("all");

  const filtered = VoC.MENTIONS.map((m) => VoC.viewMention(m, settings)).filter((m) => {
    if (filterCat !== "all" && m.category !== filterCat) return false;
    if (filterPlat !== "all" && m.platform !== filterPlat) return false;
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterLevel !== "all") {
      const lv = VoC.engagementLevel(VoC.engagementOf(m), settings.engagementThresholds);
      if (lv !== filterLevel) return false;
    }
    return true;
  }).sort((a, b) => VoC.engagementOf(b) - VoC.engagementOf(a));

  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader title="Mentions" subtitle={`${filtered.length} of ${VoC.MENTIONS.length} mentions · each carries its category, owner, and recommended action.`} />

      <div className={cardCls + " p-4 mb-4 flex flex-wrap gap-2.5 items-center"}>
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mr-1">Filter</span>
        <FilterSelect label="Category" value={filterCat} onChange={setFilterCat}
          options={[{ v: "all", l: "All categories" }, ...VoC.TAXONOMY.map((t) => ({ v: t.key, l: t.label }))]} />
        <FilterSelect label="Engagement" value={filterLevel} onChange={setFilterLevel}
          options={[{ v: "all", l: "All levels" }, { v: "High", l: "High" }, { v: "Medium", l: "Medium" }, { v: "Low", l: "Low" }]} />
        <FilterSelect label="Source" value={filterPlat} onChange={setFilterPlat}
          options={[{ v: "all", l: "All sources" }, { v: "twitter", l: "X / Twitter" }, { v: "reddit", l: "Reddit" }]} />
        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
          options={[{ v: "all", l: "All" }, { v: "New", l: "New" }, { v: "In Review", l: "In Review" }, { v: "Actioned", l: "Actioned" }, { v: "Closed", l: "Closed" }, { v: "Rejected", l: "Rejected" }, { v: "Not Relevant", l: "Not Relevant" }, { v: "Duplicate", l: "Duplicate" }]} />
        <div className="flex-1" />
        <div className="text-[11.5px] text-gray-500">Sorted by engagement</div>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((m) => <MentionCard key={m.id} mention={m} settings={settings} onCorrect={openCorrection} />)}
        {filtered.length === 0 && <div className="text-center text-gray-400 text-sm py-8">No mentions match these filters.</div>}
      </div>
    </div>
  );
}

// =========================================================
//  ACTION QUEUE
// =========================================================
function ActionQueuePage({ settings, openDrillDown, openCorrection }) {
  const [view, setView] = useP("clusters"); // "clusters" | "mentions"
  const [filterCat, setFilterCat] = useP("all");
  const [filterLevel, setFilterLevel] = useP("all");
  const [filterOwner, setFilterOwner] = useP("all");
  const [filterStatus, setFilterStatus] = useP("open");
  const [filterPlat, setFilterPlat] = useP("all");

  const owners = [...new Set(Object.values(settings.ownership))];

  const allMentions = VoC.MENTIONS.map((m) => VoC.viewMention(m, settings));

  const mentionsView = allMentions.map((m) => {
    const eng = VoC.engagementOf(m);
    const lv = VoC.engagementLevel(eng, settings.engagementThresholds);
    const tax = VoC.taxonomyFor(m.category);
    const sensitive = VoC.isSensitive(m, settings.sensitiveKeywords);
    const routing = VoC.routingFor(m.category, lv, sensitive, settings);
    return { m, eng, lv, tax, routing };
  }).filter((r) => {
    if (filterCat !== "all" && r.m.category !== filterCat) return false;
    if (filterPlat !== "all" && r.m.platform !== filterPlat) return false;
    if (filterLevel !== "all" && r.lv !== filterLevel) return false;
    if (filterOwner !== "all" && r.routing.owner !== filterOwner) return false;
    if (filterStatus === "open" && ["Closed", "Rejected", "Not Relevant", "Duplicate"].includes(r.m.status)) return false;
    if (filterStatus !== "all" && filterStatus !== "open" && r.m.status !== filterStatus) return false;
    return true;
  }).sort((a, b) => b.eng - a.eng);

  const clusterView = VoC.listClusters(settings).map((c) => {
    const lv = VoC.engagementLevel(c.totalEngagement, settings.engagementThresholds);
    const sensitive = VoC.isSensitive(c.mentions[0], settings.sensitiveKeywords);
    const routing = VoC.routingFor(c.category, lv, sensitive, settings);
    const open = c.mentions.filter((m) => !["Closed", "Rejected", "Not Relevant", "Duplicate"].includes(m.status));
    return { c, lv, routing, open };
  }).filter((r) => {
    if (filterCat !== "all" && r.c.category !== filterCat) return false;
    if (filterLevel !== "all" && r.lv !== filterLevel) return false;
    if (filterOwner !== "all" && r.routing.owner !== filterOwner) return false;
    if (filterStatus === "open" && r.open.length === 0) return false;
    return true;
  });

  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader
        title="Action Queue"
        subtitle="The operational center of the dashboard. Group by issue cluster (default) or look at individual mentions."
        right={
          <div className="flex p-1 bg-white border border-gray-200 rounded-[10px]">
            <button onClick={() => setView("clusters")}
                    className={"px-3 py-1.5 text-[12.5px] rounded-md font-semibold " + (view === "clusters" ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50")}>Clusters</button>
            <button onClick={() => setView("mentions")}
                    className={"px-3 py-1.5 text-[12.5px] rounded-md font-semibold " + (view === "mentions" ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50")}>Mentions</button>
          </div>
        }
      />

      <div className={cardCls + " p-4 mb-4 flex flex-wrap gap-2.5 items-center"}>
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mr-1">Filter</span>
        <FilterSelect label="Category" value={filterCat} onChange={setFilterCat}
          options={[{ v: "all", l: "All categories" }, ...VoC.TAXONOMY.map((t) => ({ v: t.key, l: t.label }))]} />
        <FilterSelect label="Owner" value={filterOwner} onChange={setFilterOwner}
          options={[{ v: "all", l: "All owners" }, ...owners.map((o) => ({ v: o, l: o }))]} />
        <FilterSelect label="Engagement" value={filterLevel} onChange={setFilterLevel}
          options={[{ v: "all", l: "All levels" }, { v: "High", l: "High" }, { v: "Medium", l: "Medium" }, { v: "Low", l: "Low" }]} />
        {view === "mentions" && (
          <React.Fragment>
            <FilterSelect label="Source" value={filterPlat} onChange={setFilterPlat}
              options={[{ v: "all", l: "All sources" }, { v: "twitter", l: "X / Twitter" }, { v: "reddit", l: "Reddit" }]} />
            <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
              options={[{ v: "open", l: "Open" }, { v: "all", l: "All" }, { v: "New", l: "New" }, { v: "In Review", l: "In Review" }, { v: "Actioned", l: "Actioned" }, { v: "Closed", l: "Closed" }, { v: "Rejected", l: "Rejected" }, { v: "Not Relevant", l: "Not Relevant" }, { v: "Duplicate", l: "Duplicate" }]} />
          </React.Fragment>
        )}
        {view === "clusters" && (
          <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
            options={[{ v: "open", l: "Has open items" }, { v: "all", l: "All clusters" }]} />
        )}
      </div>

      {view === "clusters" && (
        <div className={cardCls + " overflow-hidden"}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Issue cluster / topic", "Category", "Mentions", "Total engagement", "Level", "Owner", "Action", "Last seen", ""].map((h) => (
                  <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-2.5 py-2 border-b border-gray-200 bg-gray-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clusterView.map(({ c, lv, routing }) => (
                <tr key={c.clusterId} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDrillDown({ kind: "cluster", value: c.clusterId })}>
                  <td className="px-2.5 py-3 border-b border-gray-100 max-w-[320px]">
                    <div className="font-semibold text-gray-900 line-clamp-2">{c.topic}</div>
                  </td>
                  <td className="px-2.5 py-3 border-b border-gray-100"><CategoryTag category={c.category} /></td>
                  <td className="px-2.5 py-3 border-b border-gray-100 font-semibold text-gray-800">{c.mentions.length}</td>
                  <td className="px-2.5 py-3 border-b border-gray-100 font-semibold text-gray-800">{c.totalEngagement}</td>
                  <td className="px-2.5 py-3 border-b border-gray-100"><EngagementBadge level={lv} /></td>
                  <td className="px-2.5 py-3 border-b border-gray-100"><OwnerPill owner={routing.owner} /></td>
                  <td className="px-2.5 py-3 border-b border-gray-100">
                    <ActionPill label={routing.action} actionType={routing.actionType} />
                    {routing.escalation && <div className="mt-1"><EscalationFlag note={routing.escalationNote} compact /></div>}
                  </td>
                  <td className="px-2.5 py-3 border-b border-gray-100 text-[11.5px] text-gray-500 whitespace-nowrap">
                    {new Date(c.lastSeen).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-2.5 py-3 border-b border-gray-100 text-[11px] text-coral font-semibold whitespace-nowrap">Open →</td>
                </tr>
              ))}
              {clusterView.length === 0 && (
                <tr><td colSpan="9" className="text-center text-gray-400 text-sm py-8">No clusters match.</td></tr>
              )}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10.5px] text-gray-400 text-right">Click any row to open the detail drawer.</div>
        </div>
      )}

      {view === "mentions" && (
        <div className="flex flex-col gap-2">
          {mentionsView.map(({ m }) => <MentionCard key={m.id} mention={m} settings={settings} onCorrect={openCorrection} />)}
          {mentionsView.length === 0 && <div className="text-center text-gray-400 text-sm py-8">No items match.</div>}
        </div>
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
//  ROUTING MATRIX — derived from Taxonomy ownership × engagement
// =========================================================
function RoutingMatrixPage({ settings }) {
  return (
    <div>
      <DataFreshnessBanner settings={settings} />
      <PageHeader
        title="Routing Matrix"
        subtitle="Generated from Taxonomy × engagement level. Edit owners in Taxonomy; edit thresholds in Settings."
      />

      <div className={cardCls + " p-4 mb-4 text-[12.5px] text-gray-700 bg-gradient-to-r from-brand-50/50 to-white flex items-start gap-3"}>
        <svg className="w-4 h-4 mt-0.5 text-brand-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="font-bold text-brand-500 mb-0.5">One owner per category. Escalation is a separate flag.</div>
          The Routing Matrix is generated from Taxonomy and Engagement Settings to avoid inconsistent ownership rules. We don't mix escalation owner into the primary owner field.
          <div className="mt-1 text-[11.5px] text-gray-500">
            Current thresholds: Low ≤ {settings.engagementThresholds.lowMax} · Medium ≤ {settings.engagementThresholds.mediumMax} · High &gt; {settings.engagementThresholds.mediumMax}
          </div>
        </div>
      </div>

      <div className={cardCls + " overflow-hidden mb-4"}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50">Category</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50">Primary Owner</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200" style={{ background: "#ECFDF5" }}>Low engagement</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200" style={{ background: "#FEF3C7" }}>Medium engagement</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200" style={{ background: "#FEE2E2" }}>High engagement</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2 border-b border-gray-200 bg-gray-50">Escalation flag</th>
            </tr>
          </thead>
          <tbody>
            {VoC.TAXONOMY.map((t) => {
              const owner = VoC.ownerOf(t.key, settings);
              const rLow = VoC.routingFor(t.key, "Low",    false, settings);
              const rMed = VoC.routingFor(t.key, "Medium", false, settings);
              const rHi  = VoC.routingFor(t.key, "High",   false, settings);
              return (
                <tr key={t.key} className="align-top">
                  <td className="px-3 py-3 border-b border-gray-100 font-semibold text-gray-900 whitespace-nowrap">{t.label}</td>
                  <td className="px-3 py-3 border-b border-gray-100"><OwnerPill owner={owner} /></td>
                  <td className="px-3 py-3 border-b border-gray-100"><ActionPill label={rLow.action} actionType={rLow.actionType} /></td>
                  <td className="px-3 py-3 border-b border-gray-100"><ActionPill label={rMed.action} actionType={rMed.actionType} /></td>
                  <td className="px-3 py-3 border-b border-gray-100"><ActionPill label={rHi.action}  actionType={rHi.actionType}  /></td>
                  <td className="px-3 py-3 border-b border-gray-100">
                    {t.escalationFlag
                      ? <span className="text-[11px] font-bold text-coral">Yes — always</span>
                      : <span className="text-[11px] text-gray-500">Only at high engagement</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        {[...new Set(Object.values(settings.ownership))].map((o) => {
          const cats = VoC.TAXONOMY.filter((t) => VoC.ownerOf(t.key, settings) === o);
          return (
            <div key={o} className={cardCls + " p-4"}>
              <div className="flex items-center gap-2 mb-2">
                <OwnerPill owner={o} />
                <span className="text-[11px] text-gray-500">owns {cats.length}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {cats.map((c) => <CategoryTag key={c.key} category={c.key} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================
//  METHODOLOGY — short
// =========================================================
function MethodologyPage({ settings }) {
  const { lowMax, mediumMax } = settings.engagementThresholds;
  return (
    <div className="max-w-[760px]">
      <DataFreshnessBanner settings={settings} />
      <PageHeader title="Methodology" subtitle="How engagement is measured." />

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-2">Engagement formula</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-[13.5px] text-gray-800">
          engagement = reposts + likes + replies + comments
        </div>
      </div>

      <div className={cardCls + " p-6 mb-4"}>
        <h3 className="text-base font-bold text-gray-900 mb-3">Engagement levels</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg p-3.5" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
            <EngagementBadge level="Low" />
            <div className="mt-2 text-[12.5px] text-gray-700">0 to <strong>{lowMax}</strong></div>
          </div>
          <div className="rounded-lg p-3.5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
            <EngagementBadge level="Medium" />
            <div className="mt-2 text-[12.5px] text-gray-700">{lowMax + 1} to <strong>{mediumMax}</strong></div>
          </div>
          <div className="rounded-lg p-3.5" style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}>
            <EngagementBadge level="High" />
            <div className="mt-2 text-[12.5px] text-gray-700">Above <strong>{mediumMax}</strong></div>
          </div>
        </div>
        <p className="text-[12px] text-gray-500 mt-3">Thresholds are configurable in <a href="#/settings" className="text-coral underline">Settings</a>.</p>
      </div>

      <div className={cardCls + " p-6"}>
        <h3 className="text-base font-bold text-gray-900 mb-3">Known limitations</h3>
        <ol className="space-y-2.5 text-[13px] text-gray-700">
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">1.</span><span>Engagement measures <strong>public visibility</strong>, not business severity.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">2.</span><span>Low-engagement posts can still be important if they involve <strong>fraud, unauthorized transactions, or collection conduct</strong>.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">3.</span><span>Category classification may need <strong>manual review</strong> for ambiguous posts — use the correction flow.</span></li>
          <li className="flex gap-2.5"><span className="font-bold text-brand-500">4.</span><span>Thresholds should be <strong>calibrated after reviewing real market data</strong>.</span></li>
        </ol>
      </div>
    </div>
  );
}

// =========================================================
//  LOGIC & RATIONALE
// =========================================================
function RationalePage() {
  const points = [
    { t: "Taxonomy is the source of truth for ownership.",                    b: "Category ownership lives in one place. Everything downstream reads from it." },
    { t: "Each category has one Primary Owner — never two.",                  b: "Avoids unclear accountability. If two teams need to act, escalation handles it — not the owner field." },
    { t: "Routing Matrix follows Taxonomy.",                                  b: "The matrix doesn't maintain a separate owner mapping. Change a category's owner in Taxonomy and the matrix updates automatically." },
    { t: "Engagement = reposts + likes + replies + comments.",                b: "Total public interaction. We don't use views or follower counts — those are inconsistent across X and Reddit." },
    { t: "Engagement thresholds are configurable.",                            b: "Baseline engagement differs by market, channel, and campaign period. Hardcoded thresholds become wrong fast." },
    { t: "Escalation is a flag, not a second owner.",                         b: "Routing shows one owner + one action. Sensitive topics and high-engagement posts add an Escalation Flag on the side — they don't muddy the owner field." },
    { t: "Action Queue converts VoC signals into follow-up actions.",         b: "Issue clusters group duplicates; each cluster has an owner, a recommended action, and a Why-routed explanation." },
  ];

  return (
    <div className="max-w-[820px]">
      <PageHeader title="Logic & Rationale" subtitle="Design principles the rest of the system enforces." />
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
    category: "Corrected category",
    owner: "Corrected owner",
    not_relevant: "Marked not relevant",
    duplicate: "Marked duplicate",
    comment: "Added comment",
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
          No corrections yet. Open a mention's "Correct" menu in the Mentions or Action Queue page to log one.
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
                      {e.correctionType === "owner" ? <OwnerPill owner={e.originalOwner} /> : tax && <CategoryTag category={tax.key} />}
                    </td>
                    <td className="px-2.5 py-3 border-b border-gray-100 text-gray-400">→</td>
                    <td className="px-2.5 py-3 border-b border-gray-100">
                      {e.correctionType === "category" && newTax && <CategoryTag category={newTax.key} />}
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
