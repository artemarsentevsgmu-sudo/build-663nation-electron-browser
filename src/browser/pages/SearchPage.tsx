import { useEffect, useState } from "react";
import { useBrowser } from "../store";
import { engineSearchUrl, ENGINES, faviconFor } from "../url";
import type { EngineId } from "../types";
import { Logo } from "../components/bits";

interface Result { title: string; desc: string; url: string }
interface Answer { title: string; extract: string; thumb?: string; url: string }

export default function SearchPage({ q, tabId }: { q: string; tabId: string }) {
  const { api } = useBrowser();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [results, setResults] = useState<Result[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    let dead = false;
    setPhase("loading"); setResults([]); setAnswer(null);
    (async () => {
      try {
        const r = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=7&namespace=0&format=json&origin=*`);
        const j = await r.json();
        if (dead) return;
        const titles: string[] = j[1] ?? [];
        const descs: string[] = j[2] ?? [];
        const urls: string[] = j[3] ?? [];
        setResults(titles.map((t, i) => ({ title: t, desc: descs[i] || "", url: urls[i] || "" })));
        if (titles[0]) {
          fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titles[0])}`)
            .then((s) => s.json())
            .then((sj) => {
              if (!dead && sj?.extract && sj?.type !== "disambiguation") {
                setAnswer({ title: sj.title, extract: sj.extract, thumb: sj.thumbnail?.source, url: sj.content_urls?.desktop?.page || urls[0] });
              }
            })
            .catch(() => {});
        }
        setPhase("ready");
      } catch {
        if (!dead) setPhase("error");
      }
    })();
    return () => { dead = true; };
  }, [q]);

  return (
    <div className="sp">
      <div className="sp-inner">
        <div className="sp-head">
          <span className="logo-mini"><Logo size={16} />663<b>&nbsp;Search</b></span>
        </div>
        <div className="sp-q">“{q}”</div>
        <div className="sp-meta">
          {phase === "loading" ? "querying knowledge graph…" : phase === "error" ? "knowledge graph unreachable — offline?" : `${results.length} knowledge results · private — no query leaves this profile to ad networks`}
        </div>

        {phase === "loading" && (
          <>
            <div className="skel" style={{ height: 110, marginBottom: 14 }} />
            <div className="skel" style={{ height: 54, marginBottom: 10 }} />
            <div className="skel" style={{ height: 54, marginBottom: 10 }} />
            <div className="skel" style={{ height: 54 }} />
          </>
        )}

        {phase !== "loading" && answer && (
          <div className="sp-answer">
            {answer.thumb && <img src={answer.thumb} alt="" />}
            <div>
              <div className="tag"><i className="ri-flashlight-fill" />Instant answer · Wikipedia</div>
              <h3>{answer.title}</h3>
              <p>{answer.extract.length > 320 ? answer.extract.slice(0, 320) + "…" : answer.extract} <a onClick={() => api.navigate(answer.url, tabId)}>Read more</a></p>
            </div>
          </div>
        )}

        {phase === "ready" && results.length > 0 && (
          <>
            <div className="sp-section">Web results</div>
            {results.map((r) => (
              <div key={r.url} className="sp-result" onClick={() => api.navigate(r.url, tabId)}>
                <span className="fav">{faviconFor(r.url) ? <img src={faviconFor(r.url)!} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : <i className="ri-article-line" />}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="r-title">{r.title}</div>
                  <div className="r-url">{r.url}</div>
                  {r.desc && <div className="r-desc">{r.desc}</div>}
                </div>
              </div>
            ))}
          </>
        )}

        {(phase === "error" || (phase === "ready" && results.length === 0)) && (
          <div className="sp-empty">
            <i className="ri-cloud-off-line" />
            <p style={{ marginBottom: 22 }}>No embedded results for this query. Take it straight to an engine:</p>
          </div>
        )}

        {phase !== "loading" && (
          <>
            <div className="sp-section">Continue with a full engine</div>
            <div className="sp-engines">
              {(Object.keys(ENGINES) as EngineId[]).map((eid) => {
                const e = ENGINES[eid];
                return (
                  <button key={eid} className="btn" onClick={() => api.navigate(engineSearchUrl(q, eid), tabId)}>
                    <i className={e.icon} style={{ color: e.color }} />{e.name}
                    <i className="ri-external-link-line" style={{ opacity: 0.55, fontSize: 12 }} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
