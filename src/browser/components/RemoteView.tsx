import { useEffect, useMemo } from "react";
import { useBrowser } from "../store";
import type { Tab } from "../types";
import { blocksFraming, hostOf, prettyTitle } from "../url";
import { buildInjection, fingerprintLabel, makeFingerprint } from "../antidetect";

/**
 * The <webview> equivalent. In the Electron build this is a real
 * <webview partition="persist:663nation">; here it's a sandboxed iframe with
 * the same lifecycle (spinner → commit → did-finish-load) plus graceful
 * handling for origins that refuse framing (X-Frame-Options).
 */
export default function RemoteView({ tab }: { tab: Tab }) {
  const { state, api } = useBrowser();
  const host = hostOf(tab.url);
  const scale = tab.zoom;

  /* F1 — per-tab (or per-container) spoofed identity */
  const fpSeed = state.settings.lockFingerprintToContainer ? `container:${tab.containerId}` : tab.fpSeed;
  const fp = useMemo(() => makeFingerprint(fpSeed), [fpSeed]);

  /* desktop shell injects at document_start, before any page script runs */
  useEffect(() => {
    if (!state.settings.antiDetect) return;
    const bridge = (window as unknown as { nation?: { injectAntiDetect?: (tabId: string, code: string) => void } }).nation;
    bridge?.injectAntiDetect?.(tab.id, buildInjection(fp));
  }, [state.settings.antiDetect, fp, tab.id, tab.kick]);

  /* arm a load timeout — frames that neither load nor error within 9s */
  useEffect(() => {
    if (!tab.loading) return;
    const t = window.setTimeout(() => {
      api.patchTab(tab.id, { loading: false, progress: 1, frameError: "timeout" });
    }, 9000);
    return () => window.clearTimeout(t);
  }, [tab.loading, tab.kick, tab.url, tab.id, api]);

  /* ── typosquatting interstitial (F5) ── */
  if (tab.secure === "typo" && !tab.bypassPhish) {
    return (
      <div className="phish amber">
        <div className="phish-card">
          <div className="phish-badge"><i className="ri-user-search-line" /></div>
          <h1>Did you mean {tab.typoSuggestion}?</h1>
          <p>
            <span className="mono">{host}</span> looks almost identical to{" "}
            <span className="mono">{tab.typoSuggestion}</span> — a classic homoglyph / typosquat
            pattern used to steal logins. 663Nation stopped the connection before anything loaded.
          </p>
          <div className="phish-actions">
            <button className="btn primary" onClick={() => api.navigate("https://" + tab.typoSuggestion, tab.id)}>
              <i className="ri-arrow-right-line" />Go to {tab.typoSuggestion}
            </button>
            <button className="sneak"
              onClick={() => {
                api.patchTab(tab.id, { bypassPhish: true, kick: tab.kick + 1, loading: true, title: host });
                api.toast("ri-error-warning-line", "Typosquat protection bypassed — watch what you type");
              }}
            >
              proceed to {host} anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── tracker redirect interstitial (F6) ── */
  if (tab.secure === "redirect" && !tab.bypassPhish) {
    return (
      <div className="phish amber">
        <div className="phish-card">
          <div className="phish-badge"><i className="ri-forbid-2-line" /></div>
          <h1>Tracker redirect blocked</h1>
          <p>
            <span className="mono">{host}</span> tried to bounce you through a known cloaked
            redirect pattern (<span className="mono">/out?url=…</span> style) — used to strip
            referrers and launder tracking IDs. 663Nation cut the chain before the first hop.
          </p>
          <div className="phish-actions">
            {tab.redirectTarget ? (
              <button className="btn primary" onClick={() => api.navigate(tab.redirectTarget!, tab.id)}>
                <i className="ri-arrow-right-line" />Go directly to {hostOf(tab.redirectTarget)}
              </button>
            ) : (
              <button className="btn primary" onClick={() => api.navigate("663://newtab", tab.id)}>
                <i className="ri-shield-check-line" />Back to safety
              </button>
            )}
            <button className="sneak"
              onClick={() => {
                api.patchTab(tab.id, { bypassPhish: true, kick: tab.kick + 1, loading: true, title: host });
                api.toast("ri-error-warning-line", "Redirect shield bypassed for this hop");
              }}
            >
              follow the redirect anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── phishing interstitial (F5) ── */
  if (tab.secure === "phish" && !tab.bypassPhish) {
    return (
      <div className="phish">
        <div className="phish-card">
          <div className="phish-badge"><i className="ri-alarm-warning-fill" /></div>
          <h1>Deceptive site ahead</h1>
          <p>
            663Nation Safe Browsing blocked <span className="mono">{host}</span> because it appears
            on the phishing feed. Attackers on this site could trick you into installing software
            or revealing passwords, credit cards or seed phrases.
          </p>
          <div className="phish-actions">
            <button className="btn primary" onClick={() => api.navigate("663://newtab", tab.id)}>
              <i className="ri-shield-check-line" />Back to safety
            </button>
            <button
              className="sneak"
              onClick={() => {
                api.patchTab(tab.id, { bypassPhish: true, kick: tab.kick + 1, loading: true });
                api.toast("ri-error-warning-line", "Phishing protection bypassed — proceed at your own risk");
              }}
            >
              visit this unsafe site anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  const knownBlocked = blocksFraming(tab.url) && !tab.retryFrame;
  const showFallback = knownBlocked || tab.frameError === "timeout";

  /* ── frame-refused / timeout fallback ── */
  if (showFallback) {
    return (
      <div className="fb">
        <div className="fb-card">
          <div className="fb-fav">
            {tab.favicon ? <img src={tab.favicon} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : <i className="ri-global-line" />}
          </div>
          <h2>{prettyTitle(tab.url)}</h2>
          <div className="fb-host">{host}</div>
          <p>
            {knownBlocked
              ? <>This origin sends <code>X-Frame-Options</code> / <code>frame-ancestors</code>, so no browser is allowed to embed it — its content streams in its own process instead.</>
              : <>The page didn’t answer within 9 seconds. The host may be offline, rate-limiting, or refusing embedded connections.</>}
          </p>
          <div className="fb-actions">
            <button className="btn primary" onClick={() => api.openExternal(tab.url)}>
              <i className="ri-external-link-line" />Open in system browser
            </button>
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(tab.url).catch(() => {}); api.toast("ri-clipboard-line", "Link copied"); }}>
              <i className="ri-clipboard-line" />Copy link
            </button>
            {knownBlocked && (
              <button className="btn ghost" onClick={() => api.patchTab(tab.id, { retryFrame: true, kick: tab.kick + 1, loading: true, frameError: null })}>
                <i className="ri-refresh-line" />Try embedded anyway
              </button>
            )}
            {!knownBlocked && (
              <button className="btn ghost" onClick={() => api.reload(tab.id)}>
                <i className="ri-refresh-line" />Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── live frame ── */
  return (
    <div className="frame-wrap">
      <iframe
        key={`${tab.id}:${tab.kick}:${tab.retryFrame}`}
        src={tab.url}
        title={tab.title}
        style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})` }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-downloads"
        referrerPolicy="no-referrer"
        onLoad={() => api.patchTab(tab.id, { loading: false, progress: 1 })}
      />
      {state.settings.antiDetect && (
        <button
          className="fp-badge"
          title={`Anti-Detect active — this frame reports:\n${fp.ua}\n\nClick to reroll this tab's identity.`}
          onClick={() => api.rerollFingerprint(tab.id)}
        >
          <i className="ri-fingerprint-line" />
          {fingerprintLabel(fp)}
        </button>
      )}
    </div>
  );
}
