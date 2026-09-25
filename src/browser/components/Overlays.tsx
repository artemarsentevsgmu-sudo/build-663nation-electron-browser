import { useEffect, useState } from "react";
import { useBrowser } from "../store";
import { ENGINES } from "../url";
import type { AccentId, EngineId, ThemeId } from "../types";
import { Logo } from "./bits";

/* ── toasts ── */
export function Toasts() {
  const { state } = useBrowser();
  return (
    <div className="toasts">
      {state.toasts.map((t) => (
        <div key={t.id} className="toast"><i className={t.icon} />{t.text}</div>
      ))}
    </div>
  );
}

/* ── generic modal ── */
export function ModalHost() {
  const { state, api } = useBrowser();
  const [values, setValues] = useState<Record<string, string>>({});
  const m = state.modal;
  useEffect(() => { setValues({}); }, [m]);
  if (!m) return null;
  return (
    <>
      <div className="veil" onClick={() => api.setModal(null)} />
      <div className="modal">
        <div className="modal-card">
          <h3>{m.title}</h3>
          <p>{m.body}</p>
          {m.inputs?.map((inp) => (
            <div className="modal-field" key={inp.key}>
              <label>{inp.label}</label>
              <input
                autoFocus={inp.key === m.inputs![0].key}
                placeholder={inp.placeholder}
                value={values[inp.key] ?? inp.value ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [inp.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { m.onConfirm(values); api.setModal(null); } }}
              />
            </div>
          ))}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => api.setModal(null)}>Cancel</button>
            <button
              className={`btn ${m.danger ? "danger" : "primary"}`}
              onClick={() => { m.onConfirm(values); api.setModal(null); }}
            >
              {m.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── tab context menu ── */
export function ContextMenuHost() {
  const { state, api } = useBrowser();
  const c = state.ctx;
  if (!c) return null;
  const tab = state.tabs.find((t) => t.id === c.tabId);
  if (!tab) return null;

  const item = (icon: string, label: string, fn: () => void, disabled = false) => (
    <button key={label} className="menu-item" style={disabled ? { opacity: 0.35 } : undefined} disabled={disabled}
      onClick={() => { api.setCtx(null); fn(); }}>
      <i className={icon} /><span>{label}</span>
    </button>
  );

  const x = Math.min(c.x, window.innerWidth - 240);
  const y = Math.min(c.y, window.innerHeight - 320);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 390 }} onClick={() => api.setCtx(null)} onContextMenu={(e) => { e.preventDefault(); api.setCtx(null); }} />
      <div className="ctx" style={{ left: x, top: y }}>
        {item(tab.pinned ? "ri-unpin-line" : "ri-pushpin-line", tab.pinned ? "Unpin tab" : "Pin tab", () => api.togglePin(tab.id))}
        {item("ri-file-copy-line", "Duplicate tab", () => api.duplicateTab(tab.id))}
        {item("ri-refresh-line", "Reload", () => api.reload(tab.id))}
        <div className="ctx-label"><i className="ri-stack-line" />Container isolation</div>
        {state.containers.map((c) => (
          <button key={c.id} className="menu-item" onClick={() => api.assignContainer(tab.id, c.id)}>
            <span className="ctx-dot" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}88` }} />
            <span>{c.name}</span>
            {tab.containerId === c.id && <i className="ri-check-line" style={{ marginLeft: "auto", color: "var(--accent)" }} />}
          </button>
        ))}
        {item("ri-add-circle-line", "New container…", () => {
          api.setCtx(null);
          api.navigate("663://settings#containers");
        })}
        <div className="menu-sep" />
        {item("ri-spy-line", "New private tab", () => api.newTab("663://newtab", { isPrivate: true }))}
        {item("ri-arrow-go-back-line", "Reopen closed tab", () => api.reopenClosed(), state.closedStack.length === 0)}
        <div className="menu-sep" />
        {item("ri-close-line", "Close tab", () => api.closeTab(tab.id))}
        {item("ri-close-circle-line", "Close other tabs", () => api.closeOthers(tab.id))}
        {item("ri-layout-right-line", "Close tabs to the right", () => api.closeRight(tab.id))}
      </div>
    </>
  );
}

/* ── quit / minimize ── */
export function WindowStates() {
  const { state, api } = useBrowser();
  return (
    <>
      {state.closed && (
        <div className="quit-screen">
          <span className="q-hex"><Logo size={64} /></span>
          <h1>663Nation is closed</h1>
          <p>Session saved — {state.tabs.length} tab{state.tabs.length === 1 ? "" : "s"} will restore on launch. The session partition <code style={{ fontFamily: "var(--mono)" }}>persist:663nation</code> stays warm.</p>
          <button className="btn primary" onClick={() => api.relaunch()}>
            <i className="ri-restart-line" />Relaunch 663Nation
          </button>
        </div>
      )}
      {state.minimized && !state.closed && (
        <button className="min-pill" onClick={() => api.restoreWindow()}>
          <span className="spin" style={{ animation: "none", borderTopColor: "var(--accent)", borderColor: "var(--accent-line)" }} />
          663Nation — running in background
          <i className="ri-arrow-up-line" />
        </button>
      )}
    </>
  );
}

/* ── first run ── */
export function FirstRun() {
  const { state, api } = useBrowser();
  if (!state.firstRun) return null;
  const s = state.settings;
  const themes: ThemeId[] = ["midnight", "abyss", "ember", "ash"];
  const accents: AccentId[] = ["green", "cyan", "violet", "amber", "rose"];

  return (
    <div className="firstrun window" data-theme={s.theme} data-accent={s.accent}>
      <div className="fr-glow" />
      <div className="firstrun-card">
        <Logo size={70} />
        <h1>Welcome to <b>663Nation</b></h1>
        <p className="tag">A frameless browser that treats trackers like intruders. Thirty seconds to set up.</p>

        <div className="fr-label">Search engine</div>
        <div className="fr-row">
          {(Object.keys(ENGINES) as EngineId[]).map((eid) => {
            const e = ENGINES[eid];
            return (
              <button key={eid} className={`engine-opt ${s.engine === eid ? "on" : ""}`} onClick={() => api.updateSettings({ engine: eid })}>
                <i className={e.icon} style={{ color: e.color }} />{e.name}
              </button>
            );
          })}
        </div>

        <div className="fr-label">Theme</div>
        <div className="fr-row">
          {themes.map((t) => (
            <button key={t} className={`engine-opt ${s.theme === t ? "on" : ""}`} onClick={() => api.updateSettings({ theme: t })} style={{ textTransform: "capitalize" }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: t === "midnight" ? "#141c29" : t === "abyss" ? "#0c1830" : t === "ember" ? "#2a1a0d" : "#202027", border: "2px solid var(--line-2)" }} />
              {t}
            </button>
          ))}
        </div>

        <div className="fr-label">Accent</div>
        <div className="fr-row">
          {accents.map((a) => (
            <button key={a} className={`acc-dot ${s.accent === a ? "on" : ""}`} title={a}
              style={{ background: `var(--acc-${a})`, color: `var(--acc-${a})` }}
              onClick={() => api.updateSettings({ accent: a })} />
          ))}
        </div>

        <div style={{ marginTop: 40 }}>
          <button className="btn primary" style={{ height: 44, padding: "0 30px", fontSize: 13.5 }} onClick={() => { api.completeFirstRun(); api.toast("ri-shield-check-fill", "Shield is armed — 51 blocklist entries loaded"); }}>
            <i className="ri-rocket-2-line" />Start browsing
          </button>
        </div>
      </div>
    </div>
  );
}

export function ThemeBridge() {
  const { state } = useBrowser();
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);
  return null;
}
