import { useMemo, useState } from "react";
import { useBrowser } from "../store";
import type { PanelId } from "../types";
import { Favicon } from "./bits";
import { fmtBytes, timeAgo } from "../persist";
import EmailPanel from "./EmailPanel";

const TABS: { id: PanelId; icon: string; label: string }[] = [
  { id: "bookmarks", icon: "ri-star-line", label: "Marks" },
  { id: "history", icon: "ri-time-line", label: "History" },
  { id: "downloads", icon: "ri-download-2-line", label: "Files" },
  { id: "email", icon: "ri-mail-line", label: "Relay" },
];

export default function SidePanel() {
  const { state, api } = useBrowser();
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const q = filter.toLowerCase();
    const items = state.history.filter((h) => !q || h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q));
    const dayMs = 86400000;
    const today = Math.floor(Date.now() / dayMs);
    const out: { label: string; rows: typeof items }[] = [];
    for (const h of items) {
      const d = Math.floor(h.visitedAt / dayMs);
      const label = d === today ? "Today" : d === today - 1 ? "Yesterday" : new Date(h.visitedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      const g = out.find((x) => x.label === label);
      if (g) g.rows.push(h);
      else out.push({ label, rows: [h] });
    }
    return out;
  }, [state.history, filter]);

  const p = state.panel;
  return (
    <aside className={`sidepanel ${p ? "open" : ""}`}>
      <div className="panel-head">
        <div className="panel-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`panel-tab ${p === t.id ? "on" : ""}`} onClick={() => api.setPanel(t.id)}>
              <i className={t.icon} />{t.label}
            </button>
          ))}
        </div>
        <div className="panel-title">
          <b>{p === "bookmarks" ? "Bookmarks" : p === "history" ? "History" : p === "email" ? "Disposable Email" : "Downloads"}</b>
          <div className="mini">
            {p === "history" && state.history.length > 0 && (
              <button className="icon-mini" title="Clear all history" onClick={() =>
                api.setModal({
                  title: "Clear browsing history?",
                  body: `${state.history.length} entries will be permanently removed from this profile. Bookmarks and dials are kept.`,
                  confirmLabel: "Clear history",
                  danger: true,
                  onConfirm: () => { api.clearHistory(); api.toast("ri-delete-bin-line", "History cleared"); },
                })}>
                <i className="ri-delete-bin-line" />
              </button>
            )}
            {p === "downloads" && state.downloads.length > 0 && (
              <button className="icon-mini" title="Clear finished downloads" onClick={() => api.clearDownloads()}>
                <i className="ri-eraser-line" />
              </button>
            )}
            {p === "email" && state.mailbox && (
              <button className="icon-mini" title="Generate a new address" onClick={() => api.emailGenerate()}>
                <i className="ri-magic-line" />
              </button>
            )}
            <button className="icon-mini" title="Close panel" onClick={() => api.setPanel(null)}>
              <i className="ri-close-line" />
            </button>
          </div>
        </div>
        {p === "history" && (
          <div className="panel-search">
            <i className="ri-search-line" />
            <input placeholder="Search history…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        )}
      </div>

      {p === "email" && <EmailPanel />}

      {p !== "email" && <div className="panel-body">
        {p === "bookmarks" && (
          state.bookmarks.length === 0 ? (
            <div className="panel-empty">
              <i className="ri-star-line" />
              <b>No bookmarks yet</b>
              <p>Star any page from the address bar and it lands here (and on the bar).</p>
            </div>
          ) : (
            [...state.bookmarks].reverse().map((b) => (
              <div key={b.id} className="row-item" onClick={() => api.navigate(b.url)}>
                <span className="fav"><Favicon url={b.url} size={14} /></span>
                <span className="grow">
                  <span className="t">{b.title}</span>
                  <span className="u">{b.url}</span>
                </span>
                <button className="x" title="Remove" onClick={(e) => { e.stopPropagation(); api.removeBookmark(b.id); }}>
                  <i className="ri-close-line" />
                </button>
              </div>
            ))
          )
        )}

        {p === "history" && (
          state.history.length === 0 ? (
            <div className="panel-empty">
              <i className="ri-history-line" />
              <b>Nothing here yet</b>
              <p>Pages you visit appear here, grouped by day. Private tabs never leave a trace.</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="panel-empty"><i className="ri-search-line" /><b>No matches</b><p>Try a different query.</p></div>
          ) : (
            groups.map((g) => (
              <div key={g.label}>
                <div className="group-label">{g.label}</div>
                {g.rows.map((h) => (
                  <div key={h.id} className="row-item" onClick={() => api.navigate(h.url)}>
                    <span className="fav"><Favicon url={h.url} size={14} /></span>
                    <span className="grow">
                      <span className="t">{h.title}</span>
                      <span className="u">{timeAgo(h.visitedAt)} · {h.url}</span>
                    </span>
                    <button className="x" title="Delete entry" onClick={(e) => { e.stopPropagation(); api.removeHistory(h.id); }}>
                      <i className="ri-close-line" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )
        )}

        {p === "downloads" && (
          state.downloads.length === 0 ? (
            <div className="panel-empty">
              <i className="ri-download-cloud-2-line" />
              <b>No downloads</b>
              <p>Grab the sample pack from the new tab page footer to see the pipeline in action.</p>
            </div>
          ) : (
            state.downloads.map((d) => (
              <div key={d.id} className="row-item" style={{ cursor: "default" }}>
                <span className="fav"><i className={d.name.endsWith(".svg") ? "ri-brush-line" : d.name.endsWith(".jpg") ? "ri-image-line" : "ri-file-text-line"} /></span>
                <span className="grow">
                  <span className="t">{d.name}</span>
                  <span className="u">
                    {d.state === "active"
                      ? `${fmtBytes(d.received)} of ${fmtBytes(d.size)}`
                      : `${fmtBytes(d.size)} · ${timeAgo(d.startedAt)}`}
                  </span>
                  {d.state === "active" && (
                    <span className="dl-bar"><i style={{ width: `${Math.round((d.received / d.size) * 100)}%` }} /></span>
                  )}
                </span>
                <span className={`dl-state ${d.state}`}>{d.state === "done" ? "Saved" : `${Math.round((d.received / d.size) * 100)}%`}</span>
                <button className="x" title="Remove from list" onClick={() => api.removeDownload(d.id)}>
                  <i className="ri-close-line" />
                </button>
              </div>
            ))
          )
        )}
      </div>}
    </aside>
  );
}
