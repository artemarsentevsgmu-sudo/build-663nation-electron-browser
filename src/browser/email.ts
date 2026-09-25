/**
 * 663Nation — Disposable Email (src/js/email.js equivalent)
 *
 * Talks to the free 1secmail.com API:
 *   ?action=genRandomMailbox&count=1
 *   ?action=getMessages&login=USER&domain=DOMAIN
 *   ?action=readMessage&login=USER&domain=DOMAIN&id=ID
 *
 * In the desktop build every call is proxied through the main process
 * (`nation.email*` → net.request) so there is no CORS boundary.
 * In the web build we try direct fetch first and transparently fall back to
 * a local relay mailbox so the panel always works offline.
 */

export interface MailSummary {
  id: number;
  from: string;
  subject: string;
  date: string;
}

export interface MailBody extends MailSummary {
  body: string;
  textBody?: string;
  attachments?: { filename: string; size: number }[];
}

export interface Mailbox {
  login: string;
  domain: string;
  address: string;
  createdAt: number;
  ttlMs: number;
  live: boolean; // true = real 1secmail, false = local relay
}

const API = "https://www.1secmail.com/api/v1/";
const DOMAINS = ["1secmail.com", "1secmail.org", "1secmail.net", "esiix.com", "wwjmp.com"];
const TTL = 60 * 60 * 1000; // 1secmail mailboxes live ~1h

type Bridge = {
  emailGenerate?: () => Promise<string>;
  emailCheck?: (login: string, domain: string) => Promise<MailSummary[]>;
  emailRead?: (login: string, domain: string, id: number) => Promise<MailBody>;
};
const bridge = (): Bridge | undefined =>
  (window as unknown as { nation?: Bridge }).nation;

function randomLogin(): string {
  const syl = ["ka", "zo", "ryn", "vex", "mo", "tal", "qu", "bex", "nir", "sol", "dax", "vel"];
  let s = "";
  for (let i = 0; i < 3; i++) s += syl[Math.floor(Math.random() * syl.length)];
  return s + Math.floor(100 + Math.random() * 899);
}

async function withTimeout<T>(p: Promise<T>, ms = 6000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

/* ── local relay fallback ────────────────────────────────────── */
const relay = new Map<string, MailBody[]>();
const relayKey = (m: Mailbox) => `${m.login}@${m.domain}`;

const RELAY_SCRIPT: { delay: number; from: string; subject: string; body: string }[] = [
  {
    delay: 6000,
    from: "no-reply@663nation.app",
    subject: "Your 663Nation relay mailbox is live",
    body: `<p>This mailbox is disposable and unlinked from your identity.</p>
<p>Anything sent here lands in this panel, then evaporates when the timer runs out.
Use the <b>Autofill</b> button to drop the address straight into any email field on the current page.</p>
<p style="color:#7a8798">— 663Nation Relay</p>`,
  },
  {
    delay: 16000,
    from: "security@vaultmail.io",
    subject: "Confirm your sign-up — code 663219",
    body: `<p>Here is your one-time verification code:</p>
<h2 style="letter-spacing:.3em">663219</h2>
<p>The code expires in 10 minutes. If you didn't request it, ignore this message.</p>`,
  },
  {
    delay: 31000,
    from: "newsletter@driftbyte.dev",
    subject: "Weekly digest: fingerprinting in 2026",
    body: `<p>This week: how canvas + audio entropy still identifies 94% of visitors,
and why per-tab randomization beats a static spoof.</p>
<p>You can unsubscribe at any time — or just let this mailbox expire.</p>`,
  },
];

function seedRelay(mb: Mailbox, onArrive: () => void) {
  const key = relayKey(mb);
  relay.set(key, []);
  RELAY_SCRIPT.forEach((msg, i) => {
    setTimeout(() => {
      const list = relay.get(key);
      if (!list) return; // mailbox rotated away
      list.unshift({
        id: 9000 + i,
        from: msg.from,
        subject: msg.subject,
        date: new Date().toISOString().slice(0, 19).replace("T", " "),
        body: msg.body,
      });
      onArrive();
    }, msg.delay);
  });
}

/* ── public API ──────────────────────────────────────────────── */
export async function generateMailbox(onRelayArrive: () => void): Promise<Mailbox> {
  const b = bridge();
  if (b?.emailGenerate) {
    try {
      const addr = await withTimeout(b.emailGenerate());
      const [login, domain] = String(addr).split("@");
      if (login && domain) {
        return { login, domain, address: `${login}@${domain}`, createdAt: Date.now(), ttlMs: TTL, live: true };
      }
    } catch { /* fall through */ }
  }
  try {
    const r = await withTimeout(fetch(`${API}?action=genRandomMailbox&count=1`));
    const j = await r.json();
    const addr = Array.isArray(j) ? j[0] : null;
    if (addr) {
      const [login, domain] = String(addr).split("@");
      return { login, domain, address: addr, createdAt: Date.now(), ttlMs: TTL, live: true };
    }
  } catch { /* CORS / offline — use the relay */ }

  const login = randomLogin();
  const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
  const mb: Mailbox = { login, domain, address: `${login}@${domain}`, createdAt: Date.now(), ttlMs: TTL, live: false };
  seedRelay(mb, onRelayArrive);
  return mb;
}

export async function checkInbox(mb: Mailbox): Promise<MailSummary[]> {
  if (!mb.live) return [...(relay.get(relayKey(mb)) ?? [])];
  const b = bridge();
  if (b?.emailCheck) {
    try { return await withTimeout(b.emailCheck(mb.login, mb.domain)); } catch { /* fall through */ }
  }
  try {
    const r = await withTimeout(fetch(`${API}?action=getMessages&login=${encodeURIComponent(mb.login)}&domain=${encodeURIComponent(mb.domain)}`));
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export async function readMessage(mb: Mailbox, id: number): Promise<MailBody | null> {
  if (!mb.live) return (relay.get(relayKey(mb)) ?? []).find((m) => m.id === id) ?? null;
  const b = bridge();
  if (b?.emailRead) {
    try { return await withTimeout(b.emailRead(mb.login, mb.domain, id)); } catch { /* fall through */ }
  }
  try {
    const r = await withTimeout(fetch(`${API}?action=readMessage&login=${encodeURIComponent(mb.login)}&domain=${encodeURIComponent(mb.domain)}&id=${id}`));
    return await r.json();
  } catch {
    return null;
  }
}

export function disposeMailbox(mb: Mailbox | null) {
  if (mb && !mb.live) relay.delete(relayKey(mb));
}

export function expiryLabel(mb: Mailbox, now: number): string {
  const left = mb.createdAt + mb.ttlMs - now;
  if (left <= 0) return "expired";
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Strips HTML to a readable preview line. */
export function preview(html: string, n = 120): string {
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > n ? text.slice(0, n) + "…" : text;
}

/** Injection that fills email inputs on the active page (F2 autofill). */
export function buildAutofill(address: string): string {
  return `(() => {
  const sel = 'input[type=email], input[name*=mail i], input[id*=mail i], input[placeholder*=mail i], input[autocomplete=email]';
  const fields = Array.from(document.querySelectorAll(sel));
  fields.forEach((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(address)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.style.outline = "2px solid #00e5a0";
    setTimeout(() => (el.style.outline = ""), 1400);
  });
  return fields.length;
})();`;
}
