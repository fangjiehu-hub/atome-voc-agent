// =============================================================
// Atome VoC — Drawer, drill-down, mention card, correction flow
// =============================================================

const { useState: useDrawerState, useEffect: useDrawerEffect } = React;

// ---- Drawer scaffold -------------------------------------------------
function Drawer({ open, title, subtitle, onClose, children }) {
  useDrawerEffect(() => {
    function onKey(e) { if (e.key === "Escape" && open) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-[#141c30]/40" onClick={onClose}></div>
      <div className="ml-auto h-full bg-white shadow-xl w-[640px] max-w-[100vw] flex flex-col relative">
        <div className="px-5 pt-4 pb-3 border-b border-gray-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Detail view</div>
            <h2 className="text-[18px] font-bold text-gray-900 tracking-tight mt-0.5">{title}</h2>
            {subtitle && <p className="text-[12.5px] text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 -mr-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ---- Sparkline-ish bar chart -----------------------------------------
function MiniBars({ items, color }) {
  if (!items.length) return <div className="text-[12px] text-gray-400">No data</div>;
  const max = Math.max(...items.map((x) => x.value), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {items.map((x, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-sm" style={{ height: `${(x.value / max) * 64}px`, background: color || "#141c30" }}></div>
          <div className="text-[9px] text-gray-400">{x.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Drill-down content ----------------------------------------------
// selector: { kind: 'category'|'owner'|'level'|'platform'|'cluster'|'sentiment'|'day', value }
function DrillDownContent({ selector, settings, onCorrect, onClose, onNavigate }) {
  const all = VoC.MENTIONS.map((m) => VoC.viewMention(m, settings));
  const matches = all.filter((m) => {
    const eng = VoC.engagementOf(m);
    const lv = VoC.engagementLevel(eng, settings.engagementThresholds);
    if (selector.kind === "category")  return m.category === selector.value;
    if (selector.kind === "owner")     return VoC.ownerOf(m.category, settings) === selector.value;
    if (selector.kind === "level")     return lv === selector.value;
    if (selector.kind === "platform")  return m.platform === selector.value;
    if (selector.kind === "cluster") {
      // "single_{id}" pseudo-clusters represent unclustered mentions; match by mention ID
      if (selector.value && selector.value.startsWith("single_")) {
        return String(m.id) === selector.value.replace("single_", "");
      }
      return m.clusterId === selector.value;
    }
    if (selector.kind === "day")       return m.created.slice(0, 10) === selector.value;
    if (selector.kind === "sentiment") return VoC.sentimentOf(m) === selector.value;
    return true;
  });

  const totalEng = matches.reduce((s, m) => s + VoC.engagementOf(m), 0);
  const avgEng = matches.length ? Math.round(totalEng / matches.length) : 0;
  const levelOfTotal = VoC.engagementLevel(totalEng, settings.engagementThresholds);

  // Group matches by day for the mini bar chart
  const byDay = {};
  for (const m of matches) {
    const d = m.created.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + VoC.engagementOf(m);
  }
  const dayItems = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, v]) => ({ label: d.slice(5), value: v }));

  // Group by cluster for "related clusters"
  const clusters = {};
  for (const m of matches) {
    const cid = m.clusterId || "single_" + m.id;
    if (!clusters[cid]) clusters[cid] = { id: cid, mentions: [], totalEng: 0 };
    clusters[cid].mentions.push(m);
    clusters[cid].totalEng += VoC.engagementOf(m);
  }
  const clusterList = Object.values(clusters).sort((a, b) => b.totalEng - a.totalEng);

  // For category drill-downs: derive owner + recommended action
  let owner = null, action = null, escalation = false, escalationNote = null;
  if (selector.kind === "category") {
    const sample = matches[0];
    const sensitive = sample ? VoC.isSensitive(sample, settings.sensitiveKeywords) : false;
    const routing = VoC.routingFor(selector.value, levelOfTotal, sensitive, settings);
    owner = routing.owner; action = routing.action; escalation = routing.escalation; escalationNote = routing.escalationNote;
  }
  if (selector.kind === "cluster") {
    const sample = matches[0];
    if (sample) {
      const sensitive = VoC.isSensitive(sample, settings.sensitiveKeywords);
      const routing = VoC.routingFor(sample.category, levelOfTotal, sensitive, settings);
      owner = routing.owner; action = routing.action; escalation = routing.escalation; escalationNote = routing.escalationNote;
    }
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-[14px] font-semibold text-gray-500">No posts found</div>
        <div className="text-[12px] text-gray-400 mt-1">No posts match this filter in the current data window.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold">Mentions</div>
          <div className="text-[22px] font-bold text-gray-900 leading-tight">{matches.length}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold">Total engagement</div>
          <div className="text-[22px] font-bold text-gray-900 leading-tight">{totalEng}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold">Avg per mention</div>
          <div className="text-[22px] font-bold text-gray-900 leading-tight">{avgEng}</div>
        </div>
      </div>

      {/* Owner + action band — only on drill-downs that have one */}
      {owner && (
        <div className="rounded-lg p-3.5 mb-4" style={{ background: "linear-gradient(180deg, rgba(240,255,95,0.18), #fff)", border: "1px solid #e0e3ec" }}>
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold">Owner</span>
            <OwnerPill owner={owner} />
            <span className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold ml-2">Action</span>
            <ActionPill label={action} actionType={action.replace(owner + " ", "")} />
            {escalation && <EscalationFlag note={escalationNote} compact />}
          </div>
          <div className="text-[11.5px] text-gray-600">Aggregate engagement: <strong>{levelOfTotal}</strong> · routing follows Taxonomy.</div>
        </div>
      )}

      {/* Engagement trend */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[12.5px] font-bold text-gray-900">Engagement by day</h3>
          <span className="text-[10.5px] text-gray-400">{dayItems.length} day{dayItems.length === 1 ? "" : "s"}</span>
        </div>
        <MiniBars items={dayItems} color="#141c30" />
      </div>

      {/* Related clusters */}
      {clusterList.length > 1 && (
        <div className="mb-4">
          <h3 className="text-[12.5px] font-bold text-gray-900 mb-2">Related issue clusters</h3>
          <div className="flex flex-col gap-2">
            {clusterList.map((c) => {
              const info = VoC.CLUSTERS[c.id] || { topic: c.id, category: c.mentions[0].category };
              const lv = VoC.engagementLevel(c.totalEng, settings.engagementThresholds);
              return (
                <button key={c.id} onClick={() => onNavigate({ kind: "cluster", value: c.id })}
                        className="text-left bg-white border border-gray-200 hover:border-brand-300 hover:bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{info.topic}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{c.mentions.length} mentions · {c.totalEng} engagement</div>
                  </div>
                  <EngagementBadge level={lv} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Related mentions */}
      <div>
        <h3 className="text-[12.5px] font-bold text-gray-900 mb-2">Related mentions ({matches.length})</h3>
        <div className="flex flex-col gap-2">
          {matches.sort((a, b) => VoC.engagementOf(b) - VoC.engagementOf(a)).slice(0, 12).map((m) => (
            <MentionCard key={m.id} mention={m} settings={settings} onCorrect={onCorrect} dense />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Mention card with correction menu -------------------------------
function MentionCard({ mention, settings, onCorrect, dense, hideWhy }) {
  const [expanded, setExpanded]         = useDrawerState(false);
  const [translation, setTranslation]   = useDrawerState(null);
  const [translating, setTranslating]   = useDrawerState(false);
  const [alertStatus, setAlertStatus]   = useDrawerState(mention.alertStatus || "Not triggered");
  const [alerting, setAlerting]         = useDrawerState(false);
  const [alertMsg, setAlertMsg]         = useDrawerState(null);

  const view = VoC.viewMention(mention, settings);
  const eng = VoC.engagementOf(view);
  const level = VoC.engagementLevel(eng, settings.engagementThresholds);
  const tax = VoC.taxonomyFor(view.category);
  const sensitive = VoC.isSensitive(view, settings.sensitiveKeywords);
  const routing = VoC.routingFor(view.category, level, sensitive, settings);

  async function handleTranslate() {
    if (translating || translation) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/v2/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: view.text }),
      });
      const data = await res.json();
      setTranslation(data.translatedText || "[Translation unavailable]");
    } catch (e) {
      setTranslation("[Translation failed — backend unreachable]");
    } finally {
      setTranslating(false);
    }
  }

  async function handleSendAlert() {
    if (alerting) return;
    setAlerting(true);
    setAlertMsg(null);
    try {
      const res = await fetch(`/api/v2/alerts/trigger/${view.id}`, { method: "POST" });
      let data;
      try { data = await res.json(); } catch (_) { data = {}; }
      if (!res.ok) {
        setAlertMsg("❌ " + (data.detail || `Error ${res.status}`));
        return;
      }
      setAlertStatus(data.alertStatus || "Triggered");
      setAlertMsg(data.larkDelivered ? "✅ Alert sent to Lark." : "⚠️ Alert logged (Lark not configured).");
    } catch (e) {
      setAlertMsg("❌ Backend unreachable.");
    } finally {
      setAlerting(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-[12px] bg-white">
      <div className={"grid items-start gap-3 px-3.5 " + (dense ? "py-2.5" : "py-3") + " grid-cols-[auto_1fr_auto]"}>
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <PlatformPill platform={view.platform} />
          <EngagementBadge level={level} />
          <SentimentBadge sentiment={VoC.sentimentOf(view)} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-gray-800 leading-relaxed mb-1.5">{view.text}</p>
          {translation && (
            <p className="text-[12px] text-gray-500 italic mb-1.5 border-l-2 border-brand-300 pl-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-brand-400 not-italic">EN · </span>
              {translation}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
            <span className="text-gray-500">@{view.author}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">{new Date(view.created).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500"><span className="font-semibold text-gray-700">{eng}</span> engagement</span>
            <CategoryTag category={view.category} />
            <OwnerPill owner={routing.owner} />
            <ActionPill label={routing.action} actionType={routing.actionType} />
            {routing.escalation && <EscalationFlag note={routing.escalationNote} compact />}
          </div>
          {view.url
            ? <a href={view.url} target="_blank" rel="noopener noreferrer"
                 className="text-[11px] text-brand-500 hover:underline mt-1 inline-block">View source →</a>
            : <span className="text-[11px] text-gray-400 italic mt-1 inline-block">Original post no longer available</span>
          }
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusPill status={view.status} />
          <AlertStatusBadge status={alertStatus} />
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {/* Translate button — always shown */}
            <button onClick={handleTranslate} disabled={translating || !!translation}
                    className="text-[11px] text-gray-500 hover:text-brand-500 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-gray-50 disabled:opacity-50">
              {translating ? "…" : translation ? "Translated" : "Translate"}
            </button>
            {/* Send Alert — only for High engagement, not yet triggered */}
            {level === "High" && alertStatus === "Not triggered" && (
              <button onClick={handleSendAlert} disabled={alerting}
                      className="text-[11px] text-red-600 hover:text-red-800 font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-50">
                {alerting ? "Sending…" : "🔔 Alert"}
              </button>
            )}
            {onCorrect && <CorrectionMenu mention={mention} settings={settings} onCorrect={onCorrect} />}
            {!hideWhy && (
              <button onClick={() => setExpanded(!expanded)}
                      className="text-[11px] text-gray-500 hover:text-brand-500 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-50">
                {expanded ? "Hide" : "Why?"}
                <svg className={"w-3 h-3 transition-transform " + (expanded ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
          {alertMsg && <div className="text-[11px] text-gray-600 text-right max-w-[160px]">{alertMsg}</div>}
        </div>
      </div>
      {expanded && (
        <div className="px-3.5 pb-3">
          <WhyRoutedHere mention={view} level={level} engagement={eng} routing={routing} taxonomy={tax} />
        </div>
      )}
    </div>
  );
}

// ---- Correction menu (popover) ---------------------------------------
function CorrectionMenu({ mention, settings, onCorrect }) {
  const [open, setOpen] = useDrawerState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
              className="text-[11px] text-gray-500 hover:text-brand-500 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-50">
        Correct
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <React.Fragment>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 mt-1 w-[210px] bg-white border border-gray-200 rounded-lg shadow-md py-1 z-40 text-[12.5px]">
            {[
              { k: "category",    l: "Correct category" },
              { k: "sentiment",   l: "Correct sentiment" },
              { k: "not_relevant", l: "Mark as not relevant" },
              { k: "duplicate",   l: "Mark as duplicate" },
              { k: "comment",     l: "Add comment" },
            ].map((opt) => (
              <button key={opt.k}
                      onClick={() => { setOpen(false); onCorrect(opt.k, mention); }}
                      className="block w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">
                {opt.l}
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ---- Correction modal ------------------------------------------------
function CorrectionModal({ open, kind, mention, settings, onClose, onSubmit }) {
  const [value, setValue] = useDrawerState("");
  const [comment, setComment] = useDrawerState("");
  const [clusterTarget, setClusterTarget] = useDrawerState("");

  useDrawerEffect(() => {
    if (!open) return;
    if (kind === "category")  setValue(mention.category);
    else if (kind === "sentiment") setValue(VoC.sentimentOf(mention) || "Neutral");
    else setValue("");
    setComment(""); setClusterTarget("");
  }, [open, kind, mention && mention.id]);

  if (!open) return null;

  const owners = [...new Set(Object.values(settings.ownership))];
  const clusters = VoC.listClusters(settings).filter((c) => c.clusterId !== mention.clusterId);

  const titles = {
    category:    "Correct category",
    sentiment:   "Correct sentiment",
    not_relevant: "Mark as not relevant",
    duplicate:   "Mark as duplicate",
    comment:     "Add comment",
  };

  function submit() {
    const entry = {
      mentionId: mention.id,
      mentionText: mention.text.slice(0, 120),
      correctionType: kind,
      originalCategory: mention.category,
      originalOwner: VoC.ownerOf(mention.category, settings),
      comment: comment || null,
    };
    if (kind === "category") {
      entry.correctedCategory = value;
      entry.correctedOwner = VoC.ownerOf(value, settings);
      onSubmit({ override: { category: value }, log: entry });
    } else if (kind === "sentiment") {
      entry.correctedSentiment = value;
      onSubmit({ override: { sentiment: value, isNegative: value === "Negative" }, log: entry });
    } else if (kind === "not_relevant") {
      onSubmit({ override: { status: "Not Relevant" }, log: entry });
    } else if (kind === "duplicate") {
      entry.linkedClusterId = clusterTarget;
      onSubmit({ override: { status: "Duplicate", clusterId: clusterTarget }, log: entry });
    } else if (kind === "comment") {
      onSubmit({ override: { comment }, log: entry });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141c30]/40">
      <div className="bg-white rounded-xl shadow-xl w-[460px] max-w-[92vw]">
        <div className="px-5 pt-4 pb-3 border-b border-gray-200">
          <h3 className="text-[16px] font-bold text-gray-900">{titles[kind]}</h3>
          <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">"{mention.text}"</p>
        </div>
        <div className="p-5 space-y-3">
          {kind === "category" && (
            <label className="block">
              <div className="text-[12px] font-semibold text-gray-700 mb-1">Correct category</div>
              <select value={value} onChange={(e) => setValue(e.target.value)} className="settings-input">
                {VoC.TAXONOMY.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <div className="text-[11px] text-gray-500 mt-1">Owner will follow Taxonomy automatically: <strong>{VoC.ownerOf(value || mention.category, settings)}</strong></div>
            </label>
          )}
          {kind === "sentiment" && (
            <label className="block">
              <div className="text-[12px] font-semibold text-gray-700 mb-1">Correct sentiment</div>
              <div className="flex gap-2 mt-1">
                {["Positive", "Negative", "Neutral"].map((s) => (
                  <button key={s} onClick={() => setValue(s)}
                          className={"flex-1 py-2 rounded-lg border text-[12px] font-semibold transition-colors " +
                            (value === s
                              ? "border-brand-500 bg-brand-50 text-brand-600"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50")}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-gray-500 mt-2">AI originally classified this as: <strong>{VoC.sentimentOf(mention) || "Neutral"}</strong></div>
            </label>
          )}
          {kind === "not_relevant" && (
            <label className="block">
              <div className="text-[12px] font-semibold text-gray-700 mb-1">Reason (optional)</div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows="3" className="settings-input" placeholder="e.g. not about Atome, off-topic, spam…"></textarea>
            </label>
          )}
          {kind === "duplicate" && (
            <label className="block">
              <div className="text-[12px] font-semibold text-gray-700 mb-1">Link to an existing issue</div>
              <select value={clusterTarget} onChange={(e) => setClusterTarget(e.target.value)} className="settings-input">
                <option value="">— pick one —</option>
                {clusters.map((c) => <option key={c.clusterId} value={c.clusterId}>{c.topic} ({c.mentions.length})</option>)}
              </select>
            </label>
          )}
          {kind === "comment" && (
            <label className="block">
              <div className="text-[12px] font-semibold text-gray-700 mb-1">Comment</div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows="4" className="settings-input"></textarea>
            </label>
          )}
        </div>
        <div className="px-5 pb-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-gray-600 px-3 py-1.5 rounded text-[13px] hover:bg-gray-100">Cancel</button>
          <button onClick={submit}
                  disabled={(kind === "duplicate" && !clusterTarget) || (kind === "sentiment" && !value)}
                  className="bg-brand-500 text-white px-3.5 py-1.5 rounded text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed">
            Save correction
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Export ----------------------------------------------------------
Object.assign(window, { Drawer, DrillDownContent, MentionCard, CorrectionMenu, CorrectionModal, MiniBars });
