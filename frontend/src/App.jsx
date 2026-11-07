import { useEffect, useState } from "react";
import { fetchModel, fetchSites } from "./api.js";
import ReefMap from "./components/ReefMap.jsx";
import SitePanel from "./components/SitePanel.jsx";
import Priorities from "./components/Priorities.jsx";
import ModelNote from "./components/ModelNote.jsx";

export default function App() {
  const [sites, setSites] = useState([]);
  const [model, setModel] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("site");
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchSites(), fetchModel()])
      .then(([s, m]) => { setSites(s); setModel(m); setSelectedId(s[0]?.site_id ?? null); })
      .catch((e) => setError(e.message));
  }, []);

  const selected = sites.find((s) => s.site_id === selectedId);

  return (
    <div className="app">
      <header className="masthead">
        <h1>Blue Sentinel</h1>
        <p>Which reefs are about to bleach, and where restoration effort will last.</p>
      </header>

      <main className="layout">
        <section className="map-area" aria-label="Reef map">
          <ReefMap sites={sites} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setView("site"); }} />
        </section>

        <aside className="panel">
          <div className="switch" role="tablist" aria-label="Panel view">
            <button role="tab" aria-selected={view === "site"} onClick={() => setView("site")}>Site outlook</button>
            <button role="tab" aria-selected={view === "priorities"} onClick={() => setView("priorities")}>Restoration priorities</button>
          </div>

          {error && (
            <p className="notice">
              {error} Start the API with <code>uvicorn main:app --port 8000</code> in <code>backend/</code>.
            </p>
          )}
          {!error && view === "site" && <SitePanel site={selected} />}
          {!error && view === "priorities" && model && (
            <Priorities criteria={model.criteria} onSelect={(id) => { setSelectedId(id); setView("site"); }} />
          )}
          {model && <ModelNote metrics={model.metrics} />}
        </aside>
      </main>
    </div>
  );
}
