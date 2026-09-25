import { useActiveTab, useBrowser } from "../store";

export default function Menu() {
  const { state, api } = useBrowser();
  const tab = useActiveTab();
  if (!state.menuOpen) return null;

  const item = (icon: string, label: string, keys: string, fn: () => void, disabled = false) => (
    <button key={label} className="menu-item" disabled={disabled} style={disabled ? { opacity: 0.35 } : undefined}
      onClick={() => { api.setMenuOpen(false); fn(); }}>
      <i className={icon} /><span>{label}</span><span className="keys">{keys}</span>
    </button>
  );

  return (
    <>
      <div className="veil" style={{ background: "transparent", backdropFilter: "none", zIndex: 125 }} onClick={() => api.setMenuOpen(false)} />
      <div className="menu">
        {item("ri-add-line", "New tab", "Ctrl+T", () => api.newTab())}
        {item("ri-spy-line", "New private tab", "Ctrl+Shift+N", () => api.newTab("663://newtab", { isPrivate: true }))}
        {item("ri-arrow-go-back-line", "Reopen closed tab", "Ctrl+Shift+T", () => api.reopenClosed(), state.closedStack.length === 0)}
        <div className="menu-sep" />
        {item("ri-star-line", "Bookmarks", "", () => api.setPanel("bookmarks"))}
        {item("ri-time-line", "History", "Ctrl+H", () => api.setPanel("history"))}
        {item("ri-download-2-line", "Downloads", "Ctrl+J", () => api.setPanel("downloads"))}
        {item("ri-mail-line", "Disposable email", "Ctrl+E", () => api.setPanel("email"))}
        <div className="menu-sep" />
        {item(state.settings.antiDetect ? "ri-fingerprint-line" : "ri-fingerprint-2-line",
          state.settings.antiDetect ? "Anti-Detect: ON" : "Anti-Detect: off", "",
          () => { api.updateSettings({ antiDetect: !state.settings.antiDetect }); api.toast("ri-fingerprint-line", state.settings.antiDetect ? "Anti-Detect disabled" : "Anti-Detect armed — every tab now spoofs a unique identity"); })}
        {item("ri-dice-line", "Reroll this fingerprint", "", () => api.rerollFingerprint(tab.id), !state.settings.antiDetect)}
        <div className="menu-sep" />
        <div className="menu-zoom">
          <i className="ri-zoom-in-line" />
          <button className="zoom-btn" onClick={() => api.zoomBy(-0.1)}><i className="ri-subtract-line" /></button>
          <span className="zoom-val">{Math.round(tab.zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => api.zoomBy(0.1)}><i className="ri-add-line" /></button>
          <button className="zoom-reset" onClick={() => api.zoomSet(1)}>RESET</button>
        </div>
        <div className="menu-sep" />
        {item(state.settings.showBookmarksBar ? "ri-checkbox-line" : "ri-checkbox-blank-line", "Bookmarks bar", "Ctrl+Shift+B", () => api.updateSettings({ showBookmarksBar: !state.settings.showBookmarksBar }))}
        {item(state.settings.showStatusBar ? "ri-checkbox-line" : "ri-checkbox-blank-line", "Status bar", "", () => api.updateSettings({ showStatusBar: !state.settings.showStatusBar }))}
        <div className="menu-sep" />
        {item("ri-settings-4-line", "Settings", "", () => api.navigate("663://settings"))}
        {item("ri-information-line", "About 663Nation", "", () => api.navigate("663://settings#about"))}
        <div className="menu-foot">663Nation 1.0.4 · partition persist:663nation</div>
      </div>
    </>
  );
}
