// =============================================================
// Atome VoC — data layer (v3 · live API)
// Fetches from /api/v2/* on boot, then exposes the same window.VoC
// surface as the original mock-data version so the React pages don't
// need rewrites. Fires `voc-data-ready` when ready (app.jsx waits on it).
// =============================================================

(function () {
  const API_BASE = "";  // same origin (frontend → backend rewrite via Next.js)
  const SETTINGS_KEY = "atome.voc.settings.v2";
  const CORRECTION_LOG_KEY = "atome.voc.corrections.v1";

  // Placeholder data set during async init. Helper functions below read these.
  let TAXONOMY = [];
  let MENTIONS = [];
  let CLUSTERS = {};
  let SERVER_SETTINGS = null;     // last /api/v2/settings response (camelCase)
  let DEFAULT_OWNERSHIP = {};     // category_key → owner from server

  // ─── helpers (unchanged from v2) ──────────────────────────────────────
  function engagementOf(m) {
    return (m.likes || 0) + (m.replies || 0) + (m.reposts || 0) + (m.comments || 0);
  }
  function engagementLevel(value, thresholds) {
    const { lowMax, mediumMax } = thresholds || { lowMax: 20, mediumMax: 60 };
    if (value <= lowMax) return "Low";
    if (value <= mediumMax) return "Medium";
    return "High";
  }
  function taxonomyFor(categoryKey) {
    return TAXONOMY.find((t) => t.key === categoryKey);
  }
  function ownerOf(categoryKey, settings) {
    return (settings && settings.ownership && settings.ownership[categoryKey])
      || DEFAULT_OWNERSHIP[categoryKey]
      || "Unassigned";
  }
  function isSensitive(mention, sensitiveKeywords) {
    if (mention.category === "fraud") return true;
    if (mention.category === "collections") return true;
    const text = (mention.text || "").toLowerCase();
    return (sensitiveKeywords || []).some((kw) => text.includes(kw.toLowerCase()));
  }
  function sentimentOf(mention) {
    // Prefer explicit override first, then stored field, then derive from isNegative
    if (mention.sentiment) return mention.sentiment;
    if (mention.isNegative === true)  return "Negative";
    if (mention.isNegative === false) return "Positive";
    return "Neutral";
  }

  // ─── secondary teams mapping — default fallback; overridden by settings.secondaryOwnership ──
  const SECONDARY_TEAMS_MAP = {
    "collections":       ["Risk"],
    "customer_service":  ["Product"],
    "bayad":             ["Customer Services"],
    "transaction":       ["Risk"],
    "card_delivery":     ["Product"],
    "fees":              ["Customer Services"],
    "payment":           ["Risk"],
    "card_application":  ["Customer Services"],
    "limit_increase":    ["Product", "Customer Services"],
    "card_binding":      ["Customer Services"],
    "otp":               ["Product"],
    "user_review":       ["Customer Services"],
    "fraud":             ["Legal", "Collection"],
  };

  // Dropdown options for display defaults.
  // active=true → selectable now; false → greyed out "coming soon".
  // To activate a new market/source: flip active to true and deploy.
  const MARKET_OPTIONS = [
    { value: "PH", active: true  },
    { value: "ID", active: false },
    { value: "MY", active: false },
    { value: "SG", active: false },
    { value: "TW", active: false },
  ];
  const SOURCE_OPTIONS = [
    { value: "X",        active: true  },
    { value: "Reddit",   active: true  },
    { value: "Facebook", active: false },
    { value: "TikTok",   active: false },
  ];

  // Prefer settings.secondaryOwnership (user-configured) → fall back to static map
  function secondaryTeamsOf(categoryKey, settings) {
    if (settings && settings.secondaryOwnership && settings.secondaryOwnership[categoryKey] !== undefined) {
      return settings.secondaryOwnership[categoryKey] || [];
    }
    return SECONDARY_TEAMS_MAP[categoryKey] || [];
  }
  function routingFor(categoryKey, level, sensitive, settings) {
    const owner = ownerOf(categoryKey, settings);
    const isSensitiveCat = categoryKey === "fraud" || categoryKey === "collections";
    let actionType, actionLabel;
    if (isSensitiveCat) {
      if (level === "Low")         { actionType = "Review";              actionLabel = `${owner} Review`; }
      else if (level === "Medium") { actionType = "Priority Review";     actionLabel = `${owner} Priority Review`; }
      else                          { actionType = "Priority Escalation"; actionLabel = `${owner} Priority Escalation`; }
    } else {
      if (level === "Low")         { actionType = "Monitor";          actionLabel = "Monitor"; }
      else if (level === "Medium") { actionType = "Review";           actionLabel = `${owner} Review`; }
      else                          { actionType = "Priority Review"; actionLabel = `${owner} Priority Review`; }
    }
    const escalation = level === "High" || sensitive || isSensitiveCat;
    let escalationNote = null;
    if (escalation) {
      if (isSensitiveCat && level === "High")     escalationNote = "Sensitive category at high engagement.";
      else if (level === "High")                   escalationNote = "High engagement — public visibility may amplify quickly.";
      else if (isSensitiveCat)                     escalationNote = `${categoryKey === "fraud" ? "Fraud" : "Collections"} cases are sensitive by policy.`;
      else                                          escalationNote = "Mention contains sensitive keywords.";
    }
    return { owner, action: actionLabel, actionType, escalation, escalationNote };
  }

  function viewMention(mention, settings) {
    const o = settings && settings.mentionOverrides && settings.mentionOverrides[mention.id];
    if (!o) return mention;
    return { ...mention, ...o };
  }
  function effectiveCategory(mention, settings) { return viewMention(mention, settings).category; }

  function listClusters(settings) {
    const out = {};
    for (const m of MENTIONS) {
      const v = viewMention(m, settings);
      const cid = v.clusterId || ("single_" + v.id);
      const cinfo = CLUSTERS[cid] || { topic: (v.text || "").slice(0, 80) + "…", category: v.category };
      if (!out[cid]) {
        out[cid] = {
          clusterId: cid,
          topic: cinfo.topic,
          category: cinfo.category,
          mentions: [],
          totalEngagement: 0,
          lastSeen: v.created,
        };
      }
      out[cid].mentions.push(v);
      out[cid].totalEngagement += engagementOf(v);
      if (v.created > out[cid].lastSeen) out[cid].lastSeen = v.created;
    }
    return Object.values(out).sort((a, b) => b.totalEngagement - a.totalEngagement);
  }

  function dataFreshness() {
    const now = new Date();
    const last = new Date(now.getTime() - 8 * 60 * 1000);
    const next = new Date(now.getTime() + 17 * 60 * 1000);
    return {
      state: "Fresh",
      lastUpdated: last.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      nextRefresh: next.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  }

  // ─── settings (server-backed, localStorage cache) ─────────────────────
  function buildDefaultSettings() {
    return {
      engagementThresholds: SERVER_SETTINGS ? SERVER_SETTINGS.engagementThresholds : { lowMax: 20, mediumMax: 60 },
      sensitiveKeywords:    SERVER_SETTINGS ? SERVER_SETTINGS.sensitiveKeywords    : ["fraud", "unauthorized", "scam", "phishing", "regulator", "BSP"],
      ownership:            SERVER_SETTINGS ? { ...SERVER_SETTINGS.ownership }     : { ...DEFAULT_OWNERSHIP },
      // secondaryOwnership: settings-controlled CC teams per category; defaults to static map
      secondaryOwnership:   SERVER_SETTINGS && SERVER_SETTINGS.secondaryOwnership
                              ? { ...SERVER_SETTINGS.secondaryOwnership }
                              : JSON.parse(JSON.stringify(SECONDARY_TEAMS_MAP)),
      mentionOverrides:     {},
      defaultMarket: SERVER_SETTINGS
        ? (Array.isArray(SERVER_SETTINGS.defaultMarket) ? SERVER_SETTINGS.defaultMarket : (SERVER_SETTINGS.defaultMarket ? [SERVER_SETTINGS.defaultMarket] : ["PH"]))
        : ["PH"],
      defaultSource: SERVER_SETTINGS
        ? (Array.isArray(SERVER_SETTINGS.defaultSource) ? SERVER_SETTINGS.defaultSource : (SERVER_SETTINGS.defaultSource ? [SERVER_SETTINGS.defaultSource] : ["X", "Reddit"]))
        : ["X", "Reddit"],
      defaultTimeWindow:    SERVER_SETTINGS ? SERVER_SETTINGS.defaultTimeWindow    : "7d",
    };
  }

  function loadSettings() {
    const base = buildDefaultSettings();
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      const market = Array.isArray(parsed.defaultMarket) ? parsed.defaultMarket
        : (parsed.defaultMarket ? [parsed.defaultMarket] : base.defaultMarket);
      const source = Array.isArray(parsed.defaultSource) ? parsed.defaultSource
        : (parsed.defaultSource ? [parsed.defaultSource] : base.defaultSource);
      return {
        ...base, ...parsed,
        engagementThresholds: { ...base.engagementThresholds, ...(parsed.engagementThresholds || {}) },
        ownership: { ...base.ownership, ...(parsed.ownership || {}) },
        secondaryOwnership: { ...base.secondaryOwnership, ...(parsed.secondaryOwnership || {}) },
        mentionOverrides: parsed.mentionOverrides || {},
        defaultMarket: market,
        defaultSource: source,
      };
    } catch (e) { return base; }
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    // Mirror server-side asynchronously (best effort — UI doesn't block on it)
    fetch(API_BASE + "/api/v2/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engagementThresholds: s.engagementThresholds,
        sensitiveKeywords: s.sensitiveKeywords,
        ownership: s.ownership,
        secondaryOwnership: s.secondaryOwnership,
        defaultMarket: s.defaultMarket,
        defaultSource: s.defaultSource,
        defaultTimeWindow: s.defaultTimeWindow,
      }),
    }).catch(() => {});
  }
  function resetSettings() {
    localStorage.removeItem(SETTINGS_KEY);
    return buildDefaultSettings();
  }

  // ─── correction log (localStorage + server mirror) ────────────────────
  function loadCorrectionLog() {
    try { return JSON.parse(localStorage.getItem(CORRECTION_LOG_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveCorrectionLog(arr) { localStorage.setItem(CORRECTION_LOG_KEY, JSON.stringify(arr.slice(0, 200))); }
  function appendCorrection(entry) {
    const log = loadCorrectionLog();
    log.unshift({ ...entry, timestamp: new Date().toISOString(), updatedBy: "Demo user" });
    saveCorrectionLog(log);
    // Mirror to server (best effort)
    fetch(API_BASE + "/api/v2/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mentionId: entry.mentionId,
        correctionType: entry.correctionType,
        correctedCategory: entry.correctedCategory || null,
        correctedOwner: entry.correctedOwner || null,
        linkedClusterId: entry.linkedClusterId || null,
        comment: entry.comment || null,
      }),
    }).catch(() => {});
    return log;
  }

  // ─── async bootstrap ──────────────────────────────────────────────────
  async function init() {
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = '<div style="padding:32px;color:#6B7280;font-size:14px;">Loading Atome VoC data from /api/v2 …</div>';
    }
    try {
      const [tax, settings, mentions, clusters, corrections] = await Promise.all([
        fetch(API_BASE + "/api/v2/taxonomy").then((r) => r.json()),
        fetch(API_BASE + "/api/v2/settings").then((r) => r.json()),
        fetch(API_BASE + "/api/v2/mentions?limit=500").then((r) => r.json()),
        fetch(API_BASE + "/api/v2/clusters").then((r) => r.json()),
        fetch(API_BASE + "/api/v2/corrections").then((r) => r.json()),
      ]);

      TAXONOMY = (tax.items || []).map((t) => ({
        key:             t.key,
        label:           t.label,
        description:     t.description || "",
        signals:         t.signals || [],
        defaultAction:   t.defaultAction || "Monitor / Review",
        escalationFlag:  !!t.escalationFlag,
        escalationNote:  t.escalationNote || "",
        primaryOwner:    t.primaryOwner || null,
      }));

      SERVER_SETTINGS = settings;
      DEFAULT_OWNERSHIP = { ...(settings.ownership || {}) };

      MENTIONS = (mentions.items || []).map((m) => ({
        id:             m.id,
        clusterId:      m.clusterId,
        platform:       m.platform,
        author:         m.author,
        created:        m.created,
        category:       m.category,
        likes:          m.likes || 0,
        replies:        m.replies || 0,
        reposts:        m.reposts || 0,
        comments:       m.comments || 0,
        text:           m.text || "",
        status:         m.status || "New",
        market:         m.market || "PH",
        url:            m.url || null,
        isNegative:     m.isNegative,
        sentiment:      m.isNegative === true ? "Negative" : m.isNegative === false ? "Positive" : "Neutral",
        summary:        m.summary || null,
        alertStatus:    m.alertStatus || "Not triggered",
        secondaryTeams: m.secondaryTeams || secondaryTeamsOf(m.category),
      }));

      CLUSTERS = {};
      for (const c of (clusters.items || [])) {
        CLUSTERS[c.clusterId] = { topic: c.topic, category: c.category };
      }

      // Seed correction log from server (server is source of truth on refresh).
      try {
        const serverLog = (corrections.items || []).map((c) => ({
          mentionId: c.mentionId,
          mentionText: c.mentionText,
          correctionType: c.correctionType,
          originalCategory: c.originalCategory,
          correctedCategory: c.correctedCategory,
          originalOwner: c.originalOwner,
          correctedOwner: c.correctedOwner,
          linkedClusterId: c.linkedClusterId,
          comment: c.comment,
          timestamp: c.timestamp,
          updatedBy: c.updatedBy || "Demo user",
        }));
        if (serverLog.length) saveCorrectionLog(serverLog);
      } catch (e) { /* ignore */ }

    } catch (err) {
      console.error("VoC data fetch failed", err);
      if (root) {
        root.innerHTML = '<div style="padding:32px;color:#DC2626;font-size:14px;">'
          + 'Failed to load /api/v2 data — see console. Backend may be unreachable.'
          + '</div>';
      }
      throw err;
    }
  }

  // ─── public API (same shape as v2 mock data) ──────────────────────────
  window.VoC = {
    get TAXONOMY() { return TAXONOMY; },
    get MENTIONS() { return MENTIONS; },
    get CLUSTERS() { return CLUSTERS; },
    get DEFAULT_OWNERSHIP() { return DEFAULT_OWNERSHIP; },
    get DEFAULT_SETTINGS() { return buildDefaultSettings(); },
    loadSettings, saveSettings, resetSettings,
    loadCorrectionLog, saveCorrectionLog, appendCorrection,
    engagementOf, engagementLevel, taxonomyFor, ownerOf,
    isSensitive, sentimentOf, secondaryTeamsOf, routingFor, viewMention, effectiveCategory,
    listClusters, dataFreshness,
    SECONDARY_TEAMS_MAP, MARKET_OPTIONS, SOURCE_OPTIONS,
  };

  // Kick off fetch and signal when done. app.jsx listens for this.
  init().then(() => {
    window.VoCReady = true;
    document.dispatchEvent(new Event("voc-data-ready"));
  }).catch(() => {
    window.VoCReady = false;
  });
})();
