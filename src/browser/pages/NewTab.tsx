import { useEffect, useMemo, useState } from "react";
import { useActiveTab, useBrowser } from "../store";
import { ENGINES } from "../url";
import { Favicon } from "../components/bits";
import { uid } from "../persist";

const QUICK = ["aurora forecast", "event loop explained", "decentralized web", "typography scale", "zero-knowledge proofs"];

export default function NewTab() {
  const { state, api } = useBrowser();
  const tab = useActiveTab();
  const [now, setNow] = useState(new Date());
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const engine = ENGINES[state.settings.engine];
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const greet = useMemo(() => {
    const h = now.getHours();
    return h < 5 ? "Night watch" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, [now]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) api.navigate(q, tab.id);
  };

  const sampleDownloads = () => {
    api.setPanel("downloads");
    api.startDownload({
      name: "663Nation-Wallpaper-4K.jpg", size: 4_812_442,
      makeBlob: async () => (await fetch("assets/wallpaper-aurora.jpg")).blob(),
    });
    setTimeout(() => api.startDownload({
      name: "663-release-notes.txt", size: 18_204,
      makeBlob: async () => new Blob([
        "663Nation 1.0.4 — \"Black Signal\"\n\n- Shield: tracker radar v7, anti-miner v4, phishing feed v11\n- Frameless window with drag-reorderable tabs\n- HTTPS-Only upgrade mode\n- Internal 663:// scheme (newtab / search / settings)\n- Session restore via electron-store compatible persistence\n",
      ], { type: "text/plain" }),
    }), 700);
    setTimeout(() => api.startDownload({
      name: "663-brand-mark.svg", size: 2_108,
      makeBlob: async () => new Blob([
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 3 58 17.5v29L32 61 6 46.5v-29L32 3Z" fill="none" stroke="#00e5a0" stroke-width="5"/><text x="32" y="40" text-anchor="middle" font-family="Arial Black,Arial" font-size="17" font-weight="900" fill="#00e5a0">663</text></svg>`,
      ], { type: "image/svg+xml" }),
    }), 1500);
  };

  const wp = state.settings.wallpaper;

  return (
    <div className="nt">
      <div className={`nt-bg ${wp === "mesh" ? "mesh-wp" : ""}`}>
        {wp === "aurora" && <img src="assets/wallpaper-aurora.jpg" alt="" />}
        {wp === "ember" && <img src="assets/wallpaper-ember.jpg" alt="" />}
      </div>
      <div className="nt-inner">
        <div className="nt-clock">
          <div className="nt-time">{time}</div>
          <div className="nt-date">{date}</div>
          <div className="nt-greet"><i className="ri-terminal-box-fill" />{greet}, netizen</div>
        </div>

        <form className="nt-search" onSubmit={submit}>
          <div className={`omnibox ${focus ? "focused" : ""}`}>
            <button type="button" className="ob-engine" title={`Searching with ${engine.name}`}>
              <i className={engine.icon} style={{ color: engine.color }} />
            </button>
            <input
              className="ob-input"
              value={q}
              spellCheck={false}
              placeholder={`Search the nation with ${engine.name}…`}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
            />
            <button type="submit" className="ob-secure" title="Search"><i className="ri-arrow-right-line" /></button>
          </div>
          <div className="nt-chips">
            {QUICK.map((s) => (
              <button key={s} type="button" className="nt-chip" onClick={() => api.navigate(s, tab.id)}>
                <i className="ri-search-line" />{s}
              </button>
            ))}
          </div>
        </form>

        <div className="dials">
          {state.dials.map((d) => (
            <div key={d.id} className="dial" onClick={() => api.navigate(d.url, tab.id)} title={d.url}>
              <span className="dial-ic"><Favicon url={d.url} size={22} /></span>
              <span>{d.title}</span>
              <button
                className="dial-x" title="Remove shortcut"
                onClick={(e) => { e.stopPropagation(); api.setDials(state.dials.filter((x) => x.id !== d.id)); }}
              >
                <i className="ri-close-line" />
              </button>
            </div>
          ))}
          <div
            className="dial add"
            onClick={() =>
              api.setModal({
                title: "Add shortcut",
                body: "Pin any site to your new tab dial grid.",
                confirmLabel: "Add shortcut",
                inputs: [
                  { key: "title", label: "Name", placeholder: "Example" },
                  { key: "url", label: "Address", placeholder: "example.com or https://…" },
                ],
                onConfirm: (v) => {
                  if (!v.url) return;
                  api.setDials([...state.dials, { id: uid(), title: v.title || v.url, url: /^\w+:\/\//.test(v.url) || v.url.startsWith("663:") ? v.url : `https://${v.url}` }]);
                  api.toast("ri-pushpin-line", "Shortcut added");
                },
              })
            }
          >
            <i className="ri-add-line" /><span>Add</span>
          </div>
        </div>

        <div className="nt-foot">
          <a onClick={() => api.navigate("663://settings", tab.id)}><i className="ri-settings-4-line" />Settings</a>
          <a className="warn" onClick={() => api.navigate("http://neverssl.com/", tab.id)}><i className="ri-error-warning-line" />HTTP demo</a>
          <a className="danger" onClick={() => api.navigate("http://free-giveaway-663.example/claim-prize", tab.id)}><i className="ri-spam-2-line" />Phishing test</a>
          <a className="warn" onClick={() => api.navigate("http://g00gle.com/", tab.id)}><i className="ri-user-search-line" />Typosquat demo</a>
          <a className="warn" onClick={() => api.navigate("https://go.sneaky-tracker.io/out?url=https%3A%2F%2Fexample.com%2F", tab.id)}><i className="ri-forbid-2-line" />Redirect trap</a>
          <a onClick={() => { const w = window.open("https://example.com/popup-ad", "_blank"); if (w) api.toast("ri-window-2-line", "Popup allowed"); }}><i className="ri-window-2-line" />Popup test</a>
          <a onClick={() => api.emailGenerate()}><i className="ri-mail-lock-line" />Relay email</a>
          <a onClick={sampleDownloads}><i className="ri-download-2-line" />Sample downloads</a>
        </div>
      </div>
    </div>
  );
}
