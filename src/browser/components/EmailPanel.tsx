import { useEffect, useState } from "react";
import { useBrowser } from "../store";
import { expiryLabel, preview } from "../email";

export default function EmailPanel() {
  const { state, api } = useBrowser();
  const [now, setNow] = useState(Date.now());
  const mb = state.mailbox;

  /* clock for the expiry countdown */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* auto-refresh the inbox every 10 s while the panel is open */
  useEffect(() => {
    if (!mb || state.panel !== "email") return;
    api.emailRefresh(true);
    const t = setInterval(() => api.emailRefresh(true), 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mb?.address, state.panel]);

  const expired = mb ? mb.createdAt + mb.ttlMs - now <= 0 : false;

  if (!mb) {
    return (
      <div className="panel-body">
        <div className="panel-empty">
          <i className="ri-mail-lock-line" />
          <b>No relay mailbox</b>
          <p>Spin up a throwaway address for sign-ups, downloads and trials — it never touches your real inbox.</p>
          <button className="btn primary" style={{ marginTop: 18 }} onClick={() => api.emailGenerate()}>
            <i className="ri-magic-line" />Generate address
          </button>
        </div>
      </div>
    );
  }

  /* ── message viewer ── */
  if (state.mailOpen) {
    const m = state.mailOpen;
    return (
      <div className="panel-body mail-read">
        <button className="mail-back" onClick={() => api.emailCloseMessage()}>
          <i className="ri-arrow-left-line" />Back to inbox
        </button>
        <div className="mail-head">
          <div className="mail-subject">{m.subject || "(no subject)"}</div>
          <div className="mail-meta"><i className="ri-user-line" />{m.from}</div>
          <div className="mail-meta"><i className="ri-time-line" />{m.date}</div>
        </div>
        <div
          className="mail-body"
          dangerouslySetInnerHTML={{ __html: sanitize(m.body || m.textBody || "") }}
        />
      </div>
    );
  }

  /* ── inbox ── */
  return (
    <div className="panel-body">
      <div className="mail-card">
        <div className="mail-card-top">
          <span className={`mail-dot ${mb.live ? "live" : ""}`} />
          <span className="mail-src">{mb.live ? "1secmail · live" : "663 relay · local"}</span>
          <span className={`mail-timer ${expired ? "dead" : ""}`}>
            <i className="ri-timer-line" />{expired ? "expired" : expiryLabel(mb, now)}
          </span>
        </div>
        <div className="mail-addr" title={mb.address}>{mb.address}</div>
        <div className="mail-actions">
          <button className="btn small primary" onClick={() => { navigator.clipboard?.writeText(mb.address).catch(() => {}); api.toast("ri-clipboard-line", "Address copied"); }}>
            <i className="ri-file-copy-line" />Copy
          </button>
          <button className="btn small" title="Fill email fields on the current page" onClick={() => api.emailAutofill()}>
            <i className="ri-input-cursor-move" />Autofill
          </button>
          <button className="btn small" onClick={() => api.emailGenerate()}>
            <i className="ri-refresh-line" />New
          </button>
          <button className="btn small danger" title="Burn this mailbox" onClick={() => api.emailDispose()}>
            <i className="ri-fire-line" />
          </button>
        </div>
      </div>

      <div className="group-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Inbox · {state.mail.length}</span>
        <button className="icon-mini" title="Check now" onClick={() => api.emailRefresh()}>
          <i className={state.mailBusy ? "ri-loader-4-line spin-ico" : "ri-refresh-line"} />
        </button>
      </div>

      {state.mail.length === 0 ? (
        <div className="panel-empty" style={{ padding: "34px 20px" }}>
          <i className="ri-inbox-line" />
          <b>Waiting for mail…</b>
          <p>Auto-checking every 10 seconds. Messages sent to the address above land here instantly.</p>
        </div>
      ) : (
        state.mail.map((m) => (
          <div key={m.id} className="row-item" onClick={() => api.emailOpen(m.id)}>
            <span className="fav"><i className="ri-mail-line" /></span>
            <span className="grow">
              <span className="t">{m.subject || "(no subject)"}</span>
              <span className="u">{m.from}</span>
              {"body" in m && typeof (m as { body?: string }).body === "string" && (
                <span className="mail-prev">{preview((m as { body: string }).body, 70)}</span>
              )}
            </span>
            <i className="ri-arrow-right-s-line" style={{ color: "var(--txt-3)" }} />
          </div>
        ))
      )}
    </div>
  );
}

/** strips scripts / event handlers before rendering remote mail HTML */
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
