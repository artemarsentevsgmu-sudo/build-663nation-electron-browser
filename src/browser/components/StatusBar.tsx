import { useActiveTab, useBrowser } from "../store";
import { displayUrl, ENGINES, hostOf } from "../url";
import { DOH_PROVIDERS } from "../privacy";
import { fingerprintLabel, makeFingerprint } from "../antidetect";

export default function StatusBar() {
  const { state, api } = useBrowser();
  const tab = useActiveTab();
  const engine = ENGINES[state.settings.engine];
  const doh = DOH_PROVIDERS[state.settings.doh];
  const container = state.containers.find((c) => c.id === tab.containerId);
  const grandTotal = state.blockedTotal + state.blockedPopups + state.blockedRedirects;
  const fpLabel = fingerprintLabel(
    makeFingerprint(state.settings.lockFingerprintToContainer ? `container:${tab.containerId}` : tab.fpSeed)
  );

  return (
    <footer className="statusbar">
      <div className="status-url">
        {state.hoverUrl || (tab.loading ? `Loading ${hostOf(tab.url)}…` : displayUrl(tab.url))}
      </div>
      <div className="status-right">
        {tab.isPrivate && (
          <span className="status-chip priv"><i className="ri-spy-fill" />PRIVATE</span>
        )}
        {container && container.id !== "personal" && (
          <span className="status-chip" style={{ color: container.color }}>
            <i className="ri-stack-line" />{container.name.toUpperCase()}
          </span>
        )}
        {state.settings.antiDetect && (
          <button className="status-chip acc" style={{ cursor: "pointer" }}
            title={`Anti-Detect: ${fpLabel}\nClick to reroll this tab's identity.`}
            onClick={() => api.rerollFingerprint(tab.id)}>
            <i className="ri-fingerprint-line" />SPOOFED
          </button>
        )}
        {state.mailbox && (
          <button className="status-chip acc" style={{ cursor: "pointer" }}
            title={`Relay mailbox: ${state.mailbox.address}`}
            onClick={() => api.setPanel("email")}>
            <i className="ri-mail-line" />{state.mail.length}
          </button>
        )}
        <span
          className={`status-chip ${state.settings.doh !== "off" ? "acc" : ""}`}
          title={state.settings.doh !== "off" ? `DNS-over-HTTPS via ${doh.name} (${doh.dns})` : "DNS-over-HTTPS is off — using the system resolver"}
        >
          <i className={state.settings.doh !== "off" ? "ri-global-line" : "ri-wifi-off-line"} />
          DoH · {doh.short}
        </span>
        <button className="status-chip acc" style={{ cursor: "pointer" }}
          title={`${state.blockedTotal} trackers/miners · ${state.blockedPopups} popups · ${state.blockedRedirects} redirects blocked`}
          onClick={() => api.toast("ri-shield-check-line", `${grandTotal} threats blocked this session`)}>
          <i className="ri-shield-check-fill" />{grandTotal} blocked
        </button>
        {tab.zoom !== 1 && (
          <button className="status-chip" style={{ cursor: "pointer" }} title="Reset zoom (Ctrl+0)" onClick={() => api.zoomSet(1)}>
            <i className="ri-zoom-in-line" />{Math.round(tab.zoom * 100)}%
          </button>
        )}
        <span className="status-sep" />
        <span className="status-chip"><i className={engine.icon} style={{ color: engine.color }} />{engine.name}</span>
        <span className="status-chip"><i className="ri-cpu-line" />persist:663nation</span>
        <span className="status-chip" style={{ color: "var(--txt-2)", fontWeight: 700 }}>v1.0.4</span>
      </div>
    </footer>
  );
}
