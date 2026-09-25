import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveTab, useBrowser } from "../store";
import { displayUrl, ENGINES, hostOf, looksLikeUrl, resolveInput } from "../url";
import type { EngineId } from "../types";
import { listCounts, listSample } from "../privacy";
import { Toggle } from "./bits";

interface Sug { icon: string; main: string; sub?: string; tag?: string; url: string }

export default function Omnibox() {
  const { state, api } = useBrowser();
  const tab = useActiveTab();
  const [val, setVal] = useState(displayUrl(tab.url));
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(0);
  const [pop, setPop] = useState<null | "sec" | "shield">(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = ENGINES[state.settings.engine];

  useEffect(() => { if (!focus) setVal(displayUrl(tab.url)); }, [tab.url, tab.id, focus]);

  const q = val.trim();
  const items: Sug[] = useMemo(() => {
    if (!q || !focus || q === displayUrl(tab.url)) return [];
    const out: Sug[] = [];
    const lc = q.toLowerCase();
    if (looksLikeUrl(q)) {
      out.push({ icon: "ri-global-line", main: `Go to ${hostOf(resolveInput(q).url)}`, tag: "URL", url: resolveInput(q).url });
    }
    for (const b of state.bookmarks) {
      if (out.length >= 6) break;
      if (b.title.toLowerCase().includes(lc) || b.url.toLowerCase().includes(lc))
        out.push({ icon: "ri-star-fill", main: b.title, sub: b.url, tag: "Bookmark", url: b.url });
    }
    const seen = new Set(out.map((o) => o.url));
    for (const h of state.history) {
      if (out.length >= 7) break;
      if (seen.has(h.url)) continue;
      if (h.title.toLowerCase().includes(lc) || h.url.toLowerCase().includes(lc)) {
        out.push({ icon: "ri-time-line", main: h.title, sub: h.url, tag: "History", url: h.url });
        seen.add(h.url);
      }
    }
    out.push({ icon: engine.icon, main: `Search ${engine.name} for “${q}”`, tag: engine.name, url: `663://search?q=${encodeURIComponent(q)}` });
    return out.slice(0, 7);
  }, [q, focus, state.bookmarks, state.history, engine, tab.url]);

  useEffect(() => setSel(0), [q]);

  const commit = (url: string) => {
    api.navigate(url, tab.id);
    setFocus(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); commit(items[sel]?.url ?? val); }
    else if (e.key === "Escape") { setVal(displayUrl(tab.url)); setFocus(false); inputRef.current?.blur(); }
  };

  const secIcon =
    tab.secure === "internal" ? { i: "ri-shield-keyhole-fill", c: "ok", label: "663Nation internal page" }
    : tab.secure === "https" ? { i: "ri-lock-fill", c: "ok", label: "Connection is secure" }
    : tab.secure === "http" ? { i: "ri-error-warning-fill", c: "warn", label: "Connection is not secure" }
    : tab.secure === "typo" ? { i: "ri-user-search-line", c: "warn", label: "Possible typosquatting — blocked" }
    : tab.secure === "redirect" ? { i: "ri-forbid-2-line", c: "warn", label: "Tracker redirect — blocked" }
    : { i: "ri-spam-2-fill", c: "bad", label: "Deceptive site blocked" };

  const counts = listCounts();
  const bookmarked = state.bookmarks.some((b) => b.url === tab.url);
  const container = state.containers.find((c) => c.id === tab.containerId);
  const host = hostOf(tab.url);
  const popupAllowed = state.popupExceptions.includes(host);

  const cycleEngine = () => {
    const order: EngineId[] = ["duckduckgo", "google", "bing", "brave"];
    const next = order[(order.indexOf(state.settings.engine) + 1) % order.length];
    api.updateSettings({ engine: next });
    api.toast(ENGINES[next].icon, `Default search → ${ENGINES[next].name}`);
  };

  return (
    <div className="omnibox-wrap">
      <div className={`omnibox ${focus ? "focused" : ""} ${tab.isPrivate ? "private" : ""}`}>
        <button className="ob-engine" title={`Search engine: ${engine.name} — click to cycle`} onClick={cycleEngine}>
          <i className={engine.icon} style={{ color: engine.color }} />
        </button>
        <button
          className={`ob-secure ${secIcon.c}`}
          title={secIcon.label}
          onClick={() => setPop(pop === "sec" ? null : "sec")}
        >
          <i className={secIcon.i} />
        </button>
        <input
          ref={inputRef}
          className="ob-input"
          value={val}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="Search or type a URL — try neverssl.com, or 663://settings"
          onChange={(e) => setVal(e.target.value)}
          onFocus={() => { setFocus(true); setTimeout(() => inputRef.current?.select(), 0); }}
          onBlur={() => setTimeout(() => setFocus(false), 140)}
          onKeyDown={onKey}
        />
        {tab.isPrivate && <span className="private-tag"><i className="ri-spy-fill" />Private</span>}
        {container && container.id !== "personal" && (
          <span
            className="private-tag"
            style={{ color: container.color, background: `${container.color}20`, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={`${container.name} container — partition persist:663nation-${container.id}`}
          >
            <i className="ri-stack-line" />{container.name}
          </span>
        )}
        <button
          className="ob-shield"
          title={`Shield blocked ${tab.blocked} trackers on this page — click for details`}
          onClick={() => setPop(pop === "shield" ? null : "shield")}
        >
          <i className="ri-shield-check-fill" />
          {tab.blocked}
        </button>
        <button
          className={`ob-star ${bookmarked ? "on" : ""}`}
          title={bookmarked ? "Remove bookmark" : "Bookmark this page"}
          onClick={() => api.toggleBookmarkActive()}
        >
          <i className={bookmarked ? "ri-star-fill" : "ri-star-line"} />
        </button>
      </div>

      {focus && items.length > 0 && (
        <div className="suggest">
          {items.map((it, i) => (
            <div
              key={it.url + i}
              className={`suggest-item ${i === sel ? "sel" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); commit(it.url); }}
              onMouseEnter={() => setSel(i)}
            >
              <i className={it.icon} />
              <span className="s-main"><b>{it.main}</b>{it.sub ? ` — ${it.sub}` : ""}</span>
              {it.tag && <span className="s-tag">{it.tag}</span>}
            </div>
          ))}
        </div>
      )}

      {pop && <div className="veil" style={{ background: "transparent", backdropFilter: "none", zIndex: 92 }} onClick={() => setPop(null)} />}

      {pop === "sec" && (
        <div className="pop left">
          <h4><i className={secIcon.i} style={{ color: tab.secure === "http" ? "var(--warn)" : tab.secure === "phish" ? "var(--danger)" : "var(--ok)" }} />{secIcon.label}</h4>
          <p className="sub">{hostOf(tab.url)}</p>
          <div className="pop-row">
            <i className="ri-file-shield-2-line" />
            <div className="grow">
              <div className="lbl">{tab.secure === "http" ? "Not secure (HTTP)" : tab.secure === "internal" ? "Signed by 663Nation" : "TLS 1.3 · valid certificate"}</div>
              <div className="desc">{tab.secure === "http" ? "Do not enter passwords or cards on this page." : tab.secure === "internal" ? "Rendered in a sandboxed, context-isolated world." : "Certificate verified against the system trust store."}</div>
            </div>
          </div>
          <div className="pop-row">
            <i className="ri-shield-check-line" />
            <div className="grow">
              <div className="lbl">{tab.blocked} trackers blocked here</div>
              <div className="desc">{state.blockedTotal} blocked across this session.</div>
            </div>
          </div>
          <div className="pop-row">
            <i className="ri-incognito-line" />
            <div className="grow">
              <div className="lbl">Partition · persist:663nation</div>
              <div className="desc">Cookies isolated from other profiles{tab.isPrivate ? " — private tab, nothing is written." : "."}</div>
            </div>
          </div>
        </div>
      )}

      {pop === "shield" && (
        <div className="pop right">
          <h4><i className="ri-shield-check-fill" style={{ color: "var(--accent)" }} />663Nation Shield</h4>
          <p className="sub">{counts.trackers} trackers · {counts.miners} miners · {counts.phishing} phishing hosts on the radar</p>
          <div className="stat-grid">
            <div className="stat-box"><b>{tab.blocked}</b><span>This page</span></div>
            <div className="stat-box"><b>{state.blockedTotal}</b><span>Trackers & miners</span></div>
            <div className="stat-box"><b>{state.blockedPopups}</b><span>Popups blocked</span></div>
            <div className="stat-box"><b>{state.blockedRedirects}</b><span>Redirects cut</span></div>
          </div>
          {tab.blocked > 0 && (
            <ul className="domain-list">
              {listSample("trackers", hostOf(tab.url)).map((d) => (
                <li key={d}><i className="ri-close-circle-fill" />{d}</li>
              ))}
            </ul>
          )}
          <div className="pop-row">
            <div className="grow"><div className="lbl">Tracker & ad blocking</div><div className="desc">Blocks listed trackers before they load.</div></div>
            <Toggle on={state.settings.adBlock} onClick={() => api.updateSettings({ adBlock: !state.settings.adBlock })} />
          </div>
          <div className="pop-row">
            <div className="grow"><div className="lbl">Anti-cryptominer</div><div className="desc">Kills in-browser mining scripts.</div></div>
            <Toggle on={state.settings.antiMiner} onClick={() => api.updateSettings({ antiMiner: !state.settings.antiMiner })} />
          </div>
          <div className="pop-row">
            <div className="grow"><div className="lbl">Anti-phishing</div><div className="desc">Safe-browsing interstitials.</div></div>
            <Toggle on={state.settings.antiPhishing} onClick={() => api.updateSettings({ antiPhishing: !state.settings.antiPhishing })} />
          </div>
          <div className="pop-row">
            <div className="grow"><div className="lbl">HTTPS-Only mode</div><div className="desc">Upgrades http:// connections automatically.</div></div>
            <Toggle on={state.settings.httpsOnly} onClick={() => api.updateSettings({ httpsOnly: !state.settings.httpsOnly })} />
          </div>
          {tab.secure !== "internal" && (
            <div className="pop-row">
              <div className="grow">
                <div className="lbl">Popups on {host}</div>
                <div className="desc">{popupAllowed ? "Allowed — this site may open windows." : "Blocked — per-site exception available."}</div>
              </div>
              <Toggle on={popupAllowed} onClick={() => api.togglePopupException(host)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
