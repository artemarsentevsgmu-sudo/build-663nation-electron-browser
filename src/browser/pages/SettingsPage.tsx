import { useEffect, useState } from "react";
import { useActiveTab, useBrowser } from "../store";
import type { AccentId, DoHProvider, EngineId, ThemeId } from "../types";
import { ENGINES } from "../url";
import { CONTAINER_COLORS, DOH_PROVIDERS, listCounts } from "../privacy";
import { fingerprintLabel, makeFingerprint } from "../antidetect";
import { Logo, Toggle } from "../components/bits";
import { fmtBytes, wipeAll } from "../persist";

type Section = "general" | "appearance" | "containers" | "search" | "privacy" | "antidetect" | "about";

const NAV: { id: Section; icon: string; label: string }[] = [
  { id: "general", icon: "ri-dashboard-3-line", label: "General" },
  { id: "appearance", icon: "ri-palette-line", label: "Appearance" },
  { id: "containers", icon: "ri-stack-line", label: "Containers" },
  { id: "search", icon: "ri-search-eye-line", label: "Search" },
  { id: "privacy", icon: "ri-shield-keyhole-line", label: "Privacy & Shield" },
  { id: "antidetect", icon: "ri-fingerprint-line", label: "Anti-Detect" },
  { id: "about", icon: "ri-information-line", label: "About" },
];

const ACCENTS: AccentId[] = ["green", "cyan", "violet", "amber", "rose"];
const THEMES: { id: ThemeId; name: string }[] = [
  { id: "midnight", name: "Midnight" },
  { id: "abyss", name: "Abyss" },
  { id: "ember", name: "Ember" },
  { id: "ash", name: "Ash" },
];
function FpRow({ k, v, mono, wrap, ok }: { k: string; v: string; mono?: boolean; wrap?: boolean; ok?: boolean }) {
  return (
    <div className="fp-row">
      <span className="fp-k">{k}</span>
      <span
        className={`fp-v ${mono ? "mono" : ""} ${wrap ? "wrap" : ""} ${ok ? "ok" : ""}`}
        title={v}
      >
        {v}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const { state, api } = useBrowser();
  const tab = useActiveTab();
  const [section, setSection] = useState<Section>("general");
  const [newContName, setNewContName] = useState("");
  const [newContColor, setNewContColor] = useState(CONTAINER_COLORS[0]);
  const s = state.settings;
  const counts = listCounts();
  const fp = makeFingerprint(s.lockFingerprintToContainer ? `container:${tab.containerId}` : tab.fpSeed);

  useEffect(() => {
    const hash = tab.url.split("#")[1];
    if (hash && NAV.some((n) => n.id === hash)) setSection(hash as Section);
  }, [tab.url]);

  const row = (lbl: string, desc: string, control: React.ReactNode) => (
    <div className="set-row" key={lbl}>
      <div className="grow">
        <div className="lbl">{lbl}</div>
        <div className="desc" dangerouslySetInnerHTML={{ __html: desc }} />
      </div>
      {control}
    </div>
  );

  const sw = (key: keyof typeof s, label?: string) => (
    <Toggle on={Boolean(s[key])} onClick={() => api.updateSettings({ [key]: !s[key] })} label={label} />
  );

  const titles: Record<Section, [string, string]> = {
    general: ["General", "Startup behavior, chrome and data housekeeping."],
    appearance: ["Appearance", "Make 663Nation yours — themes, accents, wallpapers."],
    containers: ["Containers", "Isolate cookies, cache and storage per identity — each container maps to its own session partition."],
    search: ["Search", "Default engine and omnibox behavior."],
    privacy: ["Privacy & Shield", "The blocklists live in /security — hot-reloaded on boot."],
    antidetect: ["Anti-Detect", "Every tab gets a unique, internally-consistent fingerprint injected at document_start."],
    about: ["About 663Nation", "A frameless, privacy-first desktop browser."],
  };

  return (
    <div className="set">
      <aside className="set-side">
        <h2><Logo size={20} />Settings</h2>
        {NAV.map((n) => (
          <div key={n.id} className={`set-nav ${section === n.id ? "on" : ""}`} onClick={() => setSection(n.id)}>
            <i className={n.icon} />{n.label}
          </div>
        ))}
      </aside>

      <main className="set-main">
        <h1>{titles[section][0]}</h1>
        <div className="hint">{titles[section][1]}</div>

        {section === "general" && (
          <>
            <div className="set-card">
              <h3>Startup</h3>
              {row("Restore previous session", "Reopen the tabs you had when 663Nation closed (private tabs are never restored).", sw("restoreSession"))}
            </div>
            <div className="set-card">
              <h3>Window chrome</h3>
              {row("Bookmarks bar", "Show the bookmarks strip under the toolbar — <code>Ctrl+Shift+B</code>.", sw("showBookmarksBar"))}
              {row("Status bar", "Hovered links, shield block count, zoom and engine at the bottom edge.", sw("showStatusBar"))}
            </div>
            <div className="set-card">
              <h3>Housekeeping</h3>
              {row("Browsing history", `${state.history.length} entries stored locally.`, (
                <button className="btn small" onClick={() => { api.clearHistory(); api.toast("ri-delete-bin-line", "History cleared"); }}>Clear history</button>
              ))}
              {row("Session telemetry", `${state.blockedTotal} trackers & miners blocked since install.`, (
                <button className="btn small primary" onClick={() => api.setPanel("downloads")}>Open downloads</button>
              ))}
              {row("Factory reset", "Wipes settings, bookmarks, history, dials and session, then relaunches the first-run setup.", (
                <button className="btn small danger" onClick={() =>
                  api.setModal({
                    title: "Reset 663Nation?",
                    body: "Everything stored in this profile will be erased. This cannot be undone.",
                    confirmLabel: "Erase everything",
                    danger: true,
                    onConfirm: () => { wipeAll(); location.reload(); },
                  })}>Reset…</button>
              ))}
            </div>
          </>
        )}

        {section === "appearance" && (
          <>
            <div className="set-card">
              <h3>Theme</h3>
              <div className="swatch-row">
                {THEMES.map((t) => (
                  <div key={t.id} className={`theme-card ${s.theme === t.id ? "on" : ""}`} onClick={() => api.updateSettings({ theme: t.id })}>
                    <div className={`prev ${t.id}`} />
                    <div className="tc-name">{t.name}<i className="ri-check-line" /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="set-card">
              <h3>Accent</h3>
              <div className="dot-row">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    className={`acc-dot ${s.accent === a ? "on" : ""}`}
                    title={a}
                    style={{ background: `var(--acc-${a})`, color: `var(--acc-${a})` }}
                    onClick={() => api.updateSettings({ accent: a })}
                  />
                ))}
              </div>
            </div>
            <div className="set-card">
              <h3>New tab wallpaper</h3>
              <div className="wp-row">
                <div className={`wp-card ${s.wallpaper === "aurora" ? "on" : ""}`} onClick={() => api.updateSettings({ wallpaper: "aurora" })}>
                  <img src="assets/wallpaper-aurora.jpg" alt="Aurora" /><span className="wp-tag">Aurora</span>
                </div>
                <div className={`wp-card ${s.wallpaper === "ember" ? "on" : ""}`} onClick={() => api.updateSettings({ wallpaper: "ember" })}>
                  <img src="assets/wallpaper-ember.jpg" alt="Ember" /><span className="wp-tag">Ember</span>
                </div>
                <div className={`wp-card mesh ${s.wallpaper === "mesh" ? "on" : ""}`} onClick={() => api.updateSettings({ wallpaper: "mesh" })}>
                  <span className="wp-tag">Mesh</span>
                </div>
              </div>
            </div>
          </>
        )}

        {section === "containers" && (
          <>
            <div className="set-card">
              <h3>Your containers</h3>
              {state.containers.map((c) => {
                const n = state.tabs.filter((t) => t.containerId === c.id).length;
                return (
                  <div className="set-row" key={c.id}>
                    <span className="acc-dot" style={{ background: c.color, color: c.color, cursor: "default", width: 20, height: 20 }} />
                    <div className="grow">
                      <div className="lbl">{c.name}{c.id === "personal" ? " · default" : ""}</div>
                      <div className="desc"><code>persist:663nation-{c.id}</code>{n > 0 ? ` — ${n} tab${n === 1 ? "" : "s"} isolated here` : ""}</div>
                    </div>
                    <button className="btn small primary" onClick={() => api.newTab("663://newtab", { containerId: c.id })}>New tab</button>
                    {c.id !== "personal" ? (
                      <button className="icon-mini" title="Delete container" onClick={() =>
                        api.setModal({
                          title: `Delete “${c.name}”?`,
                          body: `Tabs using it fall back to Personal. The partition persist:663nation-${c.id} (cookies, cache, storage) is orphaned on disk.`,
                          confirmLabel: "Delete container",
                          danger: true,
                          onConfirm: () => { api.deleteContainer(c.id); api.toast("ri-delete-bin-line", `Container “${c.name}” deleted`); },
                        })}>
                        <i className="ri-delete-bin-line" />
                      </button>
                    ) : (
                      <span style={{ width: 26 }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="set-card">
              <h3>Create container</h3>
              <div className="cont-create">
                <input
                  className="text-input"
                  placeholder="e.g. Freelance, Study, Crypto…"
                  value={newContName}
                  onChange={(e) => setNewContName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newContName.trim()) {
                      api.createContainer(newContName, newContColor);
                      setNewContName("");
                      api.toast("ri-stack-line", "Container created — assign tabs from the tab context menu");
                    }
                  }}
                />
                <div className="dot-row" style={{ padding: 0 }}>
                  {CONTAINER_COLORS.map((color) => (
                    <button key={color} className={`acc-dot ${newContColor === color ? "on" : ""}`}
                      style={{ background: color, color }} onClick={() => setNewContColor(color)} />
                  ))}
                </div>
                <button className="btn primary" onClick={() => {
                  if (!newContName.trim()) return;
                  api.createContainer(newContName, newContColor);
                  setNewContName("");
                  api.toast("ri-stack-line", "Container created — assign tabs from the tab context menu");
                }}>Create</button>
              </div>
              <div className="desc" style={{ paddingBottom: 14, color: "var(--txt-3)", fontSize: 11.5 }}>
                Right-click any tab → Container isolation to move it. Colors show as a glowing bar on the tab and a chip in the address bar.
              </div>
            </div>
          </>
        )}

        {section === "search" && (
          <>
            <div className="set-card">
              <h3>Default engine</h3>
              <div className="engine-card">
                {(Object.keys(ENGINES) as EngineId[]).map((eid) => {
                  const e = ENGINES[eid];
                  return (
                    <div key={eid} className={`engine-opt ${s.engine === eid ? "on" : ""}`} onClick={() => api.updateSettings({ engine: eid })}>
                      <i className={e.icon} style={{ color: e.color }} />{e.name}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="set-card">
              <h3>Omnibox</h3>
              {row("Suggestions", "Inline matches from bookmarks and history as you type — computed locally, never sent anywhere.", sw("suggestions"))}
              {row("Instant answers", "Queries resolve inside <code>663://search</code> with a Wikipedia knowledge card; one click continues on your full engine.", <span className="dl-state done">Always on</span>)}
            </div>
          </>
        )}

        {section === "privacy" && (
          <>
            <div className="set-card">
              <h3>Shield</h3>
              {row("Tracker & ad blocking", `Radar loaded with <code>${counts.trackers}</code> tracker networks.`, sw("adBlock"))}
              {row("Anti-cryptominer", `<code>${counts.miners}</code> miner SDKs & pools blocked — plus WASM signature interception in-page.`, sw("antiMiner"))}
              {row("Anti-phishing interstitials", `Safe-browsing feed holds <code>${counts.phishing}</code> hosts. Test it from the new tab page.`, sw("antiPhishing"))}
              {row("Typosquatting protection", "Homoglyph detection against 90+ top domains — <code>g00gle.com</code> gets intercepted with a “did you mean google.com?” card.", sw("typoProtection"))}
              {row("WebRTC leak protection", "Strips ICE/STUN/TURN servers from <code>RTCPeerConnection</code> and blocks the <code>media</code> permission, so your real IP never leaks.", sw("webrtcProtection"))}
              {row("HTTPS-Only mode", "Upgrades every http:// navigation to https:// when possible.", sw("httpsOnly"))}
              {row("Do Not Track", "Sends <code>DNT: 1</code> and <code>Sec-GPC: 1</code> headers with every request.", sw("doNotTrack"))}
            </div>
            <div className="set-card">
              <h3>Popups & redirects</h3>
              {row("Popup blocker", "Denies <code>window.open</code> popups unless the site is allow-listed from the address-bar shield.", sw("popupBlocking"))}
              {row("Redirect shield", "Cuts cloaked outbound hops (<code>/out?url=…</code>, <code>/track?</code>, <code>/click?</code>) and collapses redirect chains longer than 3 hops.", sw("redirectBlocking"))}
              {row("Popup exceptions", state.popupExceptions.length ? `Allow-listed: <code>${state.popupExceptions.join("</code>, <code>")}</code>` : "No sites are allow-listed yet.", (
                state.popupExceptions.length > 0
                  ? <button className="btn small" onClick={() => state.popupExceptions.forEach((h) => api.togglePopupException(h))}>Clear list</button>
                  : <span className="dl-state done">{state.blockedPopups} blocked</span>
              ))}
            </div>
            <div className="set-card">
              <h3>DNS over HTTPS</h3>
              <div className="engine-card" style={{ paddingBottom: 6 }}>
                {(Object.keys(DOH_PROVIDERS) as DoHProvider[]).map((id) => {
                  const p = DOH_PROVIDERS[id];
                  return (
                    <div key={id} className={`engine-opt ${s.doh === id ? "on" : ""}`} onClick={() => { api.updateSettings({ doh: id }); api.toast("ri-global-line", id === "off" ? "DoH off — system resolver in use" : `DoH via ${p.name} (${p.dns})`); }}>
                      <i className={id === "off" ? "ri-wifi-off-line" : "ri-global-line"} />
                      {p.name}
                    </div>
                  );
                })}
              </div>
              <div className="desc" style={{ paddingBottom: 14, color: "var(--txt-3)", fontSize: 11.5 }}>
                Resolver: <code style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{DOH_PROVIDERS[s.doh].resolver ?? "system"}</code> — applied via <code style={{ fontFamily: "var(--mono)" }}>app.configureHostResolver</code> in the desktop build (<code style={{ fontFamily: "var(--mono)" }}>dns-over-https-resolver</code> switch on cold start).
              </div>
            </div>
            <div className="set-card">
              <h3>Session</h3>
              {row("Private tabs", "Ctrl+Shift+N opens a memory-only tab — no history, no session restore, partitioned cookies.", (
                <button className="btn small" onClick={() => api.newTab("663://newtab", { isPrivate: true })}>Open private tab</button>
              ))}
              {row("Blocked so far", `${state.blockedTotal + state.blockedPopups + state.blockedRedirects} threats this session — ${state.blockedTotal} trackers/miners, ${state.blockedPopups} popups, ${state.blockedRedirects} redirects.`, <span className="dl-state done">{fmtBytes(state.blockedTotal * 4826)} saved</span>)}
            </div>
          </>
        )}

        {section === "antidetect" && (
          <>
            <div className="set-card">
              <h3>Fingerprint spoofing</h3>
              {row("Anti-Detect mode", "Injects navigator / screen / canvas / WebGL / audio / font / timezone overrides <b>before any page script runs</b> (<code>runAt: document_start</code>).", sw("antiDetect"))}
              {row("Lock profile to container", "Reuse one identity for every tab in the same container — keeps sessions coherent so sites don't flag you for shifting hardware mid-login.", sw("lockFingerprintToContainer"))}
              {row("Active profile", state.settings.lockFingerprintToContainer
                ? `Seeded from container <code>${tab.containerId}</code> — shared by all its tabs.`
                : `Seeded per tab — this tab's seed is <code>${tab.fpSeed.slice(0, 8)}</code>.`, (
                <button className="btn small primary" onClick={() => api.rerollFingerprint(tab.id)}>
                  <i className="ri-dice-line" />Reroll
                </button>
              ))}
            </div>

            <div className="set-card">
              <h3>Fingerprint preview</h3>
              <div className="fp-grid">
                <FpRow k="User agent" v={fp.ua} mono wrap />
                <FpRow k="Platform" v={`${fp.platform} · ${fp.os}`} />
                <FpRow k="Language" v={`${fp.language} → [${fp.languages.join(", ")}]`} />
                <FpRow k="Timezone" v={fp.timezone} />
                <FpRow k="CPU cores" v={String(fp.hardwareConcurrency)} />
                <FpRow k="Device memory" v={`${fp.deviceMemory} GB`} />
                <FpRow k="Touch points" v={String(fp.maxTouchPoints)} />
                <FpRow k="webdriver" v="false" ok />
                <FpRow k="Screen" v={`${fp.screen.width}×${fp.screen.height} · avail ${fp.screen.availWidth}×${fp.screen.availHeight} · ${fp.screen.colorDepth}-bit`} />
                <FpRow k="WebGL vendor" v={fp.webgl.vendor} mono wrap />
                <FpRow k="WebGL renderer" v={fp.webgl.renderer} mono wrap />
                <FpRow k="Plugins" v={fp.plugins.length ? fp.plugins.map((p) => p.name).join(", ") : "none (Firefox profile)"} />
                <FpRow k="Canvas noise" v={`seed ${fp.canvasNoise.toString(16)} · ±1 LSB jitter`} />
                <FpRow k="Audio noise" v={`±${fp.audioNoise.toExponential(2)} detune`} />
                <FpRow k="Font seed" v={fp.fontSeed.toString(16)} />
              </div>
            </div>

            <div className="set-card">
              <h3>Per-tab identities</h3>
              {state.tabs.map((t) => {
                const seed = state.settings.lockFingerprintToContainer ? `container:${t.containerId}` : t.fpSeed;
                const tfp = makeFingerprint(seed);
                const cont = state.containers.find((c) => c.id === t.containerId);
                return (
                  <div className="set-row" key={t.id}>
                    <span className="acc-dot" style={{ background: cont?.color ?? "#00e5a0", color: cont?.color ?? "#00e5a0", cursor: "default", width: 18, height: 18 }} />
                    <div className="grow">
                      <div className="lbl" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div className="desc"><code>{fingerprintLabel(tfp)}</code></div>
                    </div>
                    <button className="btn small" onClick={() => api.rerollFingerprint(t.id)}>Reroll</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {section === "about" && (
          <>
            <div className="about-head">
              <span className="big-hex"><Logo size={58} /></span>
              <div>
                <div className="t1">663Nation</div>
                <div className="t2">build 1.0.4 “Black Signal” · stable channel</div>
              </div>
            </div>
            <div className="set-card">
              <h3>Runtime</h3>
              <div className="kv"><span>Engine</span><b>Chromium · Blink (webview renderer)</b></div>
              <div className="kv"><span>Desktop shell</span><b>Electron 28 · frameless · thick frame none</b></div>
              <div className="kv"><span>Session partition</span><b>persist:663nation</b></div>
              <div className="kv"><span>Renderer isolation</span><b className="ok">contextIsolation ✓ · nodeIntegration ✗</b></div>
              <div className="kv"><span>IPC surface</span><b className="ok">contextBridge only</b></div>
              <div className="kv"><span>Blocklists</span><b>radar v7 · anti-miner v5 · phishing v11</b></div>
              <div className="kv"><span>Containers</span><b>{state.containers.length} isolated partitions</b></div>
              <div className="kv"><span>DNS over HTTPS</span><b>{DOH_PROVIDERS[s.doh].resolver ?? "system resolver"}</b></div>
              <div className="kv"><span>In-page guards</span><b className="ok">WebRTC ICE-strip · WASM miner scan</b></div>
              <div className="kv"><span>Popup policy</span><b className="ok">deny-by-default · per-site exceptions</b></div>
              <div className="kv"><span>Anti-Detect</span><b className={s.antiDetect ? "ok" : ""}>{s.antiDetect ? `armed · ${state.tabs.length} unique identities` : "off"}</b></div>
              <div className="kv"><span>Disposable email</span><b>{state.mailbox ? state.mailbox.address : "1secmail relay · idle"}</b></div>
            </div>
            <div className="set-card">
              <h3>Update</h3>
              {row("Automatic updates", "663Nation checks the update feed on every cold start.", (
                <button className="btn small primary" onClick={() => api.toast("ri-checkbox-circle-line", "You’re on the latest build — 1.0.4")}>Check now</button>
              ))}
            </div>
            <div className="set-card">
              <h3>Shortcuts</h3>
              <div className="kv"><span>New tab / close tab</span><b>Ctrl+T · Ctrl+W</b></div>
              <div className="kv"><span>Focus address bar</span><b>Ctrl+L</b></div>
              <div className="kv"><span>Cycle tabs</span><b>Ctrl+Tab · Ctrl+1–9</b></div>
              <div className="kv"><span>Reload / history nav</span><b>F5 · Alt+←/→</b></div>
              <div className="kv"><span>History · Downloads</span><b>Ctrl+H · Ctrl+J</b></div>
              <div className="kv"><span>Reopen closed tab</span><b>Ctrl+Shift+T</b></div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
