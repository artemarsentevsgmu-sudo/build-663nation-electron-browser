import { useEffect } from "react";
import type { Api, State } from "./store";

/**
 * Global chord map — the registerAccelerator() equivalent
 * from the Electron main process, scoped to the renderer.
 */
export function useShortcuts(state: State, api: Api) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const active = state.tabs.find((t) => t.id === state.activeId);

      if (c && !e.shiftKey && key === "t") { e.preventDefault(); api.newTab(); return; }
      if (c && e.shiftKey && key === "n") { e.preventDefault(); api.newTab("663://newtab", { isPrivate: true }); return; }
      if (c && key === "w") { e.preventDefault(); if (active) api.closeTab(active.id); return; }
      if (c && e.shiftKey && key === "t") { e.preventDefault(); api.reopenClosed(); return; }
      if (c && key === "l") { e.preventDefault(); const el = document.querySelector<HTMLInputElement>(".toolbar .ob-input"); el?.focus(); el?.select(); return; }
      if (c && key === "tab") {
        e.preventDefault();
        const i = state.tabs.findIndex((t) => t.id === state.activeId);
        const next = state.tabs[(i + (e.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length];
        if (next) api.activateTab(next.id);
        return;
      }
      if (c && /^[1-9]$/.test(key)) {
        e.preventDefault();
        const i = Number(key) - 1;
        const t = i === 8 ? state.tabs[state.tabs.length - 1] : state.tabs[i];
        if (t) api.activateTab(t.id);
        return;
      }
      if (e.key === "F5" || (c && key === "r")) { e.preventDefault(); if (active) api.reload(active.id); return; }
      if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); if (active) api.navDelta(active.id, -1); return; }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); if (active) api.navDelta(active.id, 1); return; }
      if (c && key === "h") { e.preventDefault(); api.setPanel("history"); return; }
      if (c && key === "j") { e.preventDefault(); api.setPanel("downloads"); return; }
      if (c && !e.shiftKey && key === "e") { e.preventDefault(); api.setPanel("email"); return; }
      if (c && e.shiftKey && key === "b") { e.preventDefault(); api.updateSettings({ showBookmarksBar: !state.settings.showBookmarksBar }); return; }
      if (c && (e.key === "=" || e.key === "+")) { e.preventDefault(); api.zoomBy(0.1); return; }
      if (c && e.key === "-") { e.preventDefault(); api.zoomBy(-0.1); return; }
      if (c && e.key === "0") { e.preventDefault(); api.zoomSet(1); return; }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
}
