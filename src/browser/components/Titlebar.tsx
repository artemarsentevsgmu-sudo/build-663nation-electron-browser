import { useBrowser } from "../store";
import TabStrip from "./TabStrip";
import { Logo } from "./bits";

declare global {
  interface Window {
    nation?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      onNewTab: (fn: (url: string) => void) => () => void;
      onPopupBlocked?: (fn: (url: string) => void) => () => void;
      openExternal: (url: string) => void;
      setDoH?: (cfg: { id: string; resolver: string | null }) => void;
      storeSet?: (key: string, value: unknown) => void;
      storeGet?: (key: string) => Promise<unknown>;
    };
  }
}

export default function Titlebar() {
  const { api } = useBrowser();

  const onMin = () => {
    if (window.nation) window.nation.minimize();
    else api.minimize();
  };
  const onMax = () => {
    if (window.nation) { window.nation.toggleMaximize(); return; }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => api.toast("ri-error-warning-line", "Fullscreen blocked by host browser"));
  };
  const onClose = () => {
    if (window.nation) window.nation.close();
    else api.quit();
  };

  return (
    <header className="titlebar">
      <div className="brand" onDoubleClick={() => api.newTab("663://settings")}>
        <Logo size={17} />
        <span className="brand-name">663<b>Nation</b></span>
      </div>
      <TabStrip />
      <div className="titlebar-drag" />
      <div className="win-ctl">
        <button className="win-btn" title="Minimize" onClick={onMin}><i className="ri-subtract-line" /></button>
        <button className="win-btn" title="Maximize" onClick={onMax}><i className="ri-checkbox-blank-line" /></button>
        <button className="win-btn close" title="Close" onClick={onClose}><i className="ri-close-line" /></button>
      </div>
    </header>
  );
}
