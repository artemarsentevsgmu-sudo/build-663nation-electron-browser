import { useEffect, useRef } from "react";
import { BrowserProvider, useBrowser } from "./browser/store";
import { useShortcuts } from "./browser/shortcuts";
import Titlebar from "./browser/components/Titlebar";
import Toolbar from "./browser/components/Toolbar";
import BookmarksBar from "./browser/components/BookmarksBar";
import StatusBar from "./browser/components/StatusBar";
import SidePanel from "./browser/components/SidePanel";
import Menu from "./browser/components/Menu";
import Stage, { ProgressBar } from "./browser/components/Stage";
import { Toasts, ModalHost, ContextMenuHost, WindowStates, FirstRun } from "./browser/components/Overlays";
import "./browser/styles/themes.css";
import "./browser/styles/main.css";

function Shell() {
  const { state, api } = useBrowser();
  useShortcuts(state, api);

  /* long-lived listeners read the freshest api through this ref */
  const apiRef = useRef(api);
  apiRef.current = api;

  /* status-bar hovered-URL tracking (links inside internal pages & chrome) */
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href], [data-hover]");
      const v = a ? (a.getAttribute("href") || a.getAttribute("data-hover") || "") : "";
      api.setHover(v && !v.startsWith("#") ? v : "");
    };
    document.addEventListener("mouseover", over);
    return () => document.removeEventListener("mouseover", over);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Esc closes panel/menu */
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (state.panel) api.setPanel(null);
        if (state.menuOpen) api.setMenuOpen(false);
        if (state.ctx) api.setCtx(null);
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [state.panel, state.menuOpen, state.ctx, api]);

  /* Electron bridge — window.open / target=_blank events from the shell
     are denied in main.js and re-routed here as new tabs */
  useEffect(() => {
    const off = window.nation?.onNewTab?.((url: string) => apiRef.current.newTab(url));
    return () => { if (typeof off === "function") off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* native popup events ( Electron setWindowOpenHandler deny ) */
  useEffect(() => {
    const off = window.nation?.onPopupBlocked?.((url: string) => apiRef.current.handleNativePopup(url));
    return () => { if (typeof off === "function") off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* F6 web-build popup gate — patch window.open so every popup in the
     renderer passes the shield (per-site exceptions, badge + toast) */
  useEffect(() => {
    const raw = window.open.bind(window);
    (window as unknown as { __663rawOpen: typeof window.open }).__663rawOpen = raw;
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const u = String(url ?? "about:blank");
      const n = (window as unknown as { nation?: unknown }).nation;
      if (n) return raw(u, target, features); // desktop build gates at webContents level
      return apiRef.current.gatePopup(u) ? raw(u, target, features) : null;
    }) as typeof window.open;
    return () => { window.open = raw; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* host tab / OS taskbar title mirrors the active 663Nation tab */
  useEffect(() => {
    const t = state.tabs.find((x) => x.id === state.activeId);
    document.title = t ? `${t.title} — 663Nation` : "663Nation";
  }, [state.tabs, state.activeId]);

  const cls = ["window", state.minimized ? "minimized" : "", state.closed ? "closed" : ""].filter(Boolean).join(" ");

  return (
    <>
      <div className={cls} data-theme={state.settings.theme} data-accent={state.settings.accent}>
        <Titlebar />
        <Toolbar />
        <ProgressBar />
        {state.settings.showBookmarksBar && <BookmarksBar />}
        <Stage />
        {state.settings.showStatusBar && <StatusBar />}
        <SidePanel />
        <Menu />
        <ContextMenuHost />
        <ModalHost />
      </div>
      <Toasts />
      <WindowStates />
      <FirstRun />
    </>
  );
}

export default function App() {
  return (
    <BrowserProvider>
      <Shell />
    </BrowserProvider>
  );
}
