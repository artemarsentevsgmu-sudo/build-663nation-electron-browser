import { useActiveTab, useBrowser } from "../store";
import Omnibox from "./Omnibox";

export default function Toolbar() {
  const { state, api } = useBrowser();
  const tab = useActiveTab();
  const activeDL = state.downloads.filter((d) => d.state === "active").length;

  return (
    <div className="toolbar">
      <div className="nav-cluster">
        <button className="tb-btn" title="Back (Alt+←)" disabled={tab.stackIndex <= 0} onClick={() => api.navDelta(tab.id, -1)}>
          <i className="ri-arrow-left-line" />
        </button>
        <button className="tb-btn" title="Forward (Alt+→)" disabled={tab.stackIndex >= tab.stack.length - 1} onClick={() => api.navDelta(tab.id, 1)}>
          <i className="ri-arrow-right-line" />
        </button>
        <button className="tb-btn" title="Reload (F5)" onClick={() => api.reload(tab.id)}>
          <i className={tab.loading ? "ri-close-line" : "ri-refresh-line"} />
        </button>
        <button className="tb-btn" title="Home" onClick={() => api.navigate("663://newtab", tab.id)}>
          <i className="ri-home-4-line" />
        </button>
      </div>

      <Omnibox />

      <div className="t-actions">
        {state.settings.antiDetect && (
          <button
            className="tb-btn accent"
            title={`Anti-Detect is ON — this tab is spoofing a unique fingerprint.\nClick to reroll.`}
            onClick={() => api.rerollFingerprint(tab.id)}
          >
            <i className="ri-fingerprint-line" />
          </button>
        )}
        <button
          className={`tb-btn ${state.mailbox ? "accent" : ""}`}
          title="Disposable email relay"
          onClick={() => api.setPanel("email")}
        >
          <i className="ri-mail-line" />
          {state.mail.length > 0 && <span className="dot-badge">{state.mail.length}</span>}
        </button>
        <button className="tb-btn" title="Downloads (Ctrl+J)" onClick={() => api.setPanel("downloads")}>
          <i className="ri-download-2-line" />
          {activeDL > 0 && <span className="dot-badge">{activeDL}</span>}
        </button>
        <button className="tb-btn" title="History (Ctrl+H)" onClick={() => api.setPanel("history")}>
          <i className="ri-time-line" />
        </button>
        <button
          className={`tb-btn ${state.menuOpen ? "accent" : ""}`}
          title="663Nation menu"
          onClick={() => api.setMenuOpen(!state.menuOpen)}
        >
          <i className="ri-more-2-fill" />
        </button>
      </div>
    </div>
  );
}
