// =============================================================
// Atome VoC — root app + hash router + global drawer + correction
// =============================================================

function App() {
  const [settings, setSettings] = React.useState(VoC.loadSettings());
  const [route, setRoute] = React.useState((window.location.hash || "#/overview").replace(/^#\//, "") || "overview");
  const [drawerSelector, setDrawerSelector] = React.useState(null);
  const [correction, setCorrection] = React.useState(null);  // { kind, mention } or null
  const [log, setLog] = React.useState(VoC.loadCorrectionLog());

  React.useEffect(() => {
    function onHash() {
      const r = (window.location.hash || "#/overview").replace(/^#\//, "") || "overview";
      setRoute(r);
      window.scrollTo(0, 0);
    }
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.location.hash = "#/overview";
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function navigate(r) { window.location.hash = "#/" + r; }
  function updateSettings(s) { setSettings(s); VoC.saveSettings(s); }
  function reset() { setSettings(VoC.resetSettings()); }

  function openDrillDown(selector) { setDrawerSelector(selector); }
  function closeDrawer() { setDrawerSelector(null); }
  function openCorrection(kind, mention) { setCorrection({ kind, mention }); }
  function closeCorrection() { setCorrection(null); }

  function submitCorrection({ override, log: entry }) {
    if (!correction) return;
    const id = correction.mention.id;
    // Capture original sentiment before override for the log
    const existingView = VoC.viewMention(correction.mention, settings);
    entry.originalSentiment = entry.originalSentiment || VoC.sentimentOf(existingView);
    const merged = { ...(settings.mentionOverrides[id] || {}), ...override };
    const newSettings = { ...settings, mentionOverrides: { ...settings.mentionOverrides, [id]: merged } };
    updateSettings(newSettings);
    setLog(VoC.appendCorrection(entry));
    setCorrection(null);
  }

  function clearLog() {
    VoC.saveCorrectionLog([]);
    setLog([]);
  }

  let page;
  switch (route) {
    case "overview":    page = <OverviewPage settings={settings} openDrillDown={openDrillDown} openCorrection={openCorrection} navigate={navigate} />; break;
    case "mentions":    page = <MentionsPage settings={settings} openCorrection={openCorrection} />; break;
    case "queue":       page = <ActionQueuePage settings={settings} openDrillDown={openDrillDown} openCorrection={openCorrection} />; break;
    case "taxonomy":    page = <TaxonomyPage settings={settings} updateSettings={updateSettings} />; break;
    case "routing":     page = <RoutingMatrixPage settings={settings} />; break;
    case "methodology": page = <MethodologyPage settings={settings} />; break;
    case "rationale":   page = <RationalePage />; break;
    case "settings":        page = <SettingsPage settings={settings} updateSettings={updateSettings} resetSettings={reset} />; break;
    case "alert-delivery":  page = <AlertDeliveryPage settings={settings} navigate={navigate} />; break;
    case "log":             page = <CorrectionLogPage settings={settings} log={log} clearLog={clearLog} />; break;
    default:            page = <OverviewPage settings={settings} openDrillDown={openDrillDown} openCorrection={openCorrection} navigate={navigate} />;
  }

  // Drawer title from selector
  let drawerTitle = "", drawerSub = "";
  if (drawerSelector) {
    if (drawerSelector.kind === "category") {
      const t = VoC.taxonomyFor(drawerSelector.value);
      drawerTitle = (t ? t.label : drawerSelector.value) + " · Detailed view";
      drawerSub = "Mentions, engagement, and routing for this category.";
    } else if (drawerSelector.kind === "owner") {
      drawerTitle = drawerSelector.value + " · Detailed view";
      drawerSub = "Categories and mentions owned by this team.";
    } else if (drawerSelector.kind === "level") {
      drawerTitle = drawerSelector.value + " engagement · Detailed view";
      drawerSub = "All mentions at this engagement level.";
    } else if (drawerSelector.kind === "sentiment") {
      drawerTitle = drawerSelector.value + " sentiment · Detailed view";
      drawerSub = "All mentions classified as " + drawerSelector.value + ".";
    } else if (drawerSelector.kind === "platform") {
      drawerTitle = (drawerSelector.value === "twitter" ? "X / Twitter" : "Reddit") + " · Detailed view";
      drawerSub = "Mentions from this source.";
    } else if (drawerSelector.kind === "cluster") {
      const c = VoC.CLUSTERS[drawerSelector.value];
      drawerTitle = (c ? c.topic : "Cluster") + " · Detailed view";
      drawerSub = "Mentions grouped under this issue.";
    } else if (drawerSelector.kind === "day") {
      drawerTitle = drawerSelector.value + " · Detailed view";
      drawerSub = "What happened on this day.";
    }
  }

  return (
    <React.Fragment>
      <div className="grid grid-cols-[240px_1fr] min-h-screen">
        <Sidebar route={route} navigate={navigate} />
        <div>
          <Topbar route={route} settings={settings} />
          <main className="p-6 pb-12" data-screen-label={PAGE_TITLES[route] || "App"}>{page}</main>
        </div>
      </div>

      <Drawer open={!!drawerSelector} title={drawerTitle} subtitle={drawerSub} onClose={closeDrawer}>
        {drawerSelector && <DrillDownContent selector={drawerSelector} settings={settings} onCorrect={openCorrection} onClose={closeDrawer} onNavigate={setDrawerSelector} />}
      </Drawer>

      <CorrectionModal open={!!correction} kind={correction && correction.kind} mention={correction && correction.mention}
        settings={settings} onClose={closeCorrection} onSubmit={submitCorrection} />
    </React.Fragment>
  );
}

// data.js fetches /api/v2/* asynchronously and fires `voc-data-ready` when
// the window.VoC surface is populated. Wait for it before mounting so the React
// tree never reads from an empty MENTIONS/TAXONOMY/CLUSTERS.
function mountApp() {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
}
if (window.VoCReady) {
  mountApp();
} else {
  document.addEventListener("voc-data-ready", mountApp, { once: true });
}
