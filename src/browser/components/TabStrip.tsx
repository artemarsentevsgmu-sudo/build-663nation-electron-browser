import { useEffect, useRef, useState } from "react";
import { useBrowser } from "../store";
import type { Tab } from "../types";
import { Favicon } from "./bits";

export default function TabStrip() {
  const { state, api } = useBrowser();
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; on: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; side: "l" | "r" } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.on && Math.abs(e.clientX - d.x) > 7) { d.on = true; setDragId(d.id); }
      if (!d.on) return;
      const el = strip.current;
      if (!el) return;
      const els = Array.from(el.querySelectorAll<HTMLElement>(".tab"));
      let best: { id: string; side: "l" | "r" } | null = null;
      let bestDist = Infinity;
      for (const c of els) {
        const r = c.getBoundingClientRect();
        const mid = r.left + r.width / 2;
        const dist = Math.abs(e.clientX - mid);
        if (dist < bestDist) { bestDist = dist; best = { id: c.dataset.id!, side: e.clientX < mid ? "l" : "r" }; }
      }
      setDropAt(best && best.id !== d.id ? best : null);
    };
    const up = () => {
      const d = drag.current;
      if (d?.on && dropAt) {
        const rest = state.tabs.filter((t) => t.id !== d.id);
        let to = rest.findIndex((t) => t.id === dropAt.id);
        if (to < 0) to = rest.length - 1;
        if (dropAt.side === "r") to += 1;
        api.moveTab(d.id, to);
      }
      drag.current = null;
      setDragId(null);
      setDropAt(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dropAt, state.tabs, api]);

  const onTabDown = (e: React.PointerEvent, t: Tab) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".tab-close")) return;
    drag.current = { id: t.id, x: e.clientX, on: false };
  };

  return (
    <div
      className="tabstrip"
      ref={strip}
      onWheel={(e) => { if (strip.current) strip.current.scrollLeft += e.deltaY; }}
    >
      {state.tabs.map((t) => {
        const container = state.containers.find((c) => c.id === t.containerId);
        const showCont = container && container.id !== "personal";
        const cls = [
          "tab",
          t.id === state.activeId ? "active" : "",
          t.pinned ? "pinned" : "",
          t.isPrivate ? "private" : "",
          t.id === dragId ? "dragging" : "",
          dropAt?.id === t.id ? (dropAt.side === "l" ? "drop-left" : "drop-right") : "",
        ].filter(Boolean).join(" ");
        return (
          <div
            key={t.id}
            data-id={t.id}
            className={cls}
            title={`${t.title} — ${t.url}${showCont ? `\n${container.name} container · persist:663nation-${container.id}` : ""}`}
            onPointerDown={(e) => onTabDown(e, t)}
            onClick={() => api.activateTab(t.id)}
            onAuxClick={(e) => { if (e.button === 1) api.closeTab(t.id); }}
            onContextMenu={(e) => { e.preventDefault(); api.setCtx({ x: e.clientX, y: e.clientY, tabId: t.id }); }}
          >
            <span className="tab-fav">
              {t.loading ? <span className="spin" /> : <Favicon url={t.url} />}
            </span>
            {!t.pinned && <span className="tab-title">{t.title}</span>}
            {showCont && <span className="tab-cont" style={{ background: container.color, boxShadow: `0 0 6px ${container.color}66` }} />}
            <button
              className="tab-close"
              title="Close tab (Ctrl+W)"
              onClick={(e) => { e.stopPropagation(); api.closeTab(t.id); }}
            >
              <i className="ri-close-line" />
            </button>
          </div>
        );
      })}
      <button className="tabstrip-new" title="New tab (Ctrl+T)" onClick={() => api.newTab()}>
        <i className="ri-add-line" />
      </button>
    </div>
  );
}
