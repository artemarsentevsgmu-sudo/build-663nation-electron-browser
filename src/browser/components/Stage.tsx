import { useEffect, useState } from "react";
import { useActiveTab, useBrowser } from "../store";
import { internalRoute } from "../url";
import RemoteView from "./RemoteView";
import NewTab from "../pages/NewTab";
import SearchPage from "../pages/SearchPage";
import SettingsPage from "../pages/SettingsPage";

export function ProgressBar() {
  const tab = useActiveTab();
  const [p, setP] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (tab.loading) {
      setVisible(true);
      setP(0.14);
      const t = window.setInterval(() => setP((x) => Math.min(0.92, x + (0.95 - x) * 0.07)), 130);
      return () => window.clearInterval(t);
    }
    setP(1);
    const t = window.setTimeout(() => { setVisible(false); setP(0); }, 380);
    return () => window.clearTimeout(t);
  }, [tab.loading, tab.kick, tab.url]);

  if (!visible) return null;
  return (
    <div className="progress">
      <i style={{ transform: `scaleX(${p})`, opacity: tab.loading ? 1 : 0 }} />
    </div>
  );
}

export default function Stage() {
  const { state } = useBrowser();

  return (
    <div className="stage">
      {state.tabs.map((t) => {
        const active = t.id === state.activeId;
        return (
          <div key={t.id} className={`tab-layer ${active ? "on" : ""}`}>
            <TabContent tabId={t.id} url={t.url} kick={t.kick} active={active} />
          </div>
        );
      })}
    </div>
  );
}

function TabContent({ tabId, url, kick }: { tabId: string; url: string; kick: number; active: boolean }) {
  const { state } = useBrowser();
  const route = internalRoute(url);
  const zoom = state.tabs.find((t) => t.id === tabId)?.zoom ?? 1;

  if (route === "newtab") {
    return <div style={{ position: "absolute", inset: 0, zoom } as React.CSSProperties}><NewTab key={tabId} /></div>;
  }
  if (route === "settings") return <div style={{ position: "absolute", inset: 0, zoom } as React.CSSProperties}><SettingsPage key={tabId} /></div>;
  if (route === "search") {
    const q = new URLSearchParams(url.split("?")[1] || "").get("q") ?? "";
    return <div style={{ position: "absolute", inset: 0, zoom } as React.CSSProperties}><SearchPage key={`${tabId}:${q}`} q={q} tabId={tabId} /></div>;
  }
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return null;
  return <RemoteView key={`${tabId}:${kick}`} tab={tab} />;
}
