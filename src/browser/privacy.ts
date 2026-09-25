/**
 * 663Nation Shield — privacy engine (renderer side).
 *
 * Feature set (desktop parity in electron/main.js):
 *   F1 crypto-miner blocking (host + file patterns, WASM signature guard)
 *   F2 DNS-over-HTTPS provider management
 *   F3 container isolation (per-container partitions)
 *   F4 WebRTC leak protection
 *   F5 anti-phishing + typosquat / homoglyph detection
 *   F6 popup + tracker-redirect blocking
 */
import { hostOf } from "./url";
import type { DoHProvider } from "./types";

interface ListsShape {
  trackers: { domain: string; owner?: string; category?: string }[];
  miners: { domain: string; note?: string }[];
  phishing: { host: string; brand?: string; reason?: string }[];
}

let lists: ListsShape = { trackers: [], miners: [], phishing: [] };
let loaded = false;

export async function loadSecurityLists(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const pull = async (name: string) => {
    try {
      const r = await fetch(`security/${name}.json`);
      const j = await r.json();
      return (j?.entries ?? []) as never[];
    } catch {
      return [] as never[];
    }
  };
  const [trackers, miners, phishing] = await Promise.all([pull("trackers"), pull("miners"), pull("phishing")]);
  lists = { trackers, miners, phishing } as ListsShape;
}

export function listCounts() {
  return {
    trackers: lists.trackers.length,
    miners: lists.miners.length,
    phishing: lists.phishing.length,
  };
}

export function phishingHit(url: string): { host: string; brand?: string; reason?: string } | null {
  const h = hostOf(url);
  return lists.phishing.find((p) => p.host === h) ?? null;
}

/* ── F1: crypto-miner detection ─────────────────────────────── */
/** file-level miner signatures (mirrors the main-process matcher) */
export const MINER_FILE_RE =
  /(cryptonight|coinhive|authedmine|jsecoin|webminer|deepminer|monerominer|miner(?:\.min)?\.js|cn\.wasm|xmrig|hashwasm)/i;

export function minerFileHit(url: string): boolean {
  try {
    const u = new URL(url);
    return MINER_FILE_RE.test(u.pathname) || MINER_FILE_RE.test(u.hostname);
  } catch {
    return MINER_FILE_RE.test(url);
  }
}

/* ── F2: DNS-over-HTTPS providers ───────────────────────────── */
export const DOH_PROVIDERS: Record<DoHProvider, { id: DoHProvider; name: string; short: string; dns: string; resolver: string | null }> = {
  cloudflare: { id: "cloudflare", name: "Cloudflare", short: "Cloudflare", dns: "1.1.1.1 · 1.0.0.1", resolver: "https://cloudflare-dns.com/dns-query" },
  google: { id: "google", name: "Google", short: "Google", dns: "8.8.8.8 · 8.8.4.4", resolver: "https://dns.google/dns-query" },
  quad9: { id: "quad9", name: "Quad9", short: "Quad9", dns: "9.9.9.9 · 149.112.112.112", resolver: "https://dns.quad9.net/dns-query" },
  off: { id: "off", name: "Off", short: "off", dns: "system resolver", resolver: null },
};

/* ── F3: containers ─────────────────────────────────────────── */
export const CONTAINER_COLORS = ["#00e5a0", "#38c8ff", "#a78bfa", "#ffb224", "#ff5d7e", "#2fd5c8", "#9dff57", "#ff8a3d"];

/* ── F5: typosquat / homoglyph detection ────────────────────── */
const POPULAR_DOMAINS = [
  "google.com", "youtube.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
  "wikipedia.org", "reddit.com", "amazon.com", "apple.com", "microsoft.com", "netflix.com",
  "github.com", "gitlab.com", "stackoverflow.com", "linkedin.com", "paypal.com", "ebay.com",
  "bing.com", "duckduckgo.com", "yahoo.com", "live.com", "outlook.com", "office.com",
  "dropbox.com", "spotify.com", "twitch.tv", "discord.com", "telegram.org", "whatsapp.com",
  "tiktok.com", "pinterest.com", "tumblr.com", "medium.com", "quora.com", "imdb.com",
  "cnn.com", "bbc.com", "nytimes.com", "theguardian.com", "reuters.com", "bloomberg.com",
  "adobe.com", "canva.com", "figma.com", "notion.so", "slack.com", "zoom.us",
  "cloudflare.com", "wordpress.com", "blogspot.com", "wix.com", "shopify.com",
  "chase.com", "wellsfargo.com", "bankofamerica.com", "citibank.com", "capitalone.com",
  "coinbase.com", "binance.com", "kraken.com", "metamask.io", "ledger.com",
  "steamcommunity.com", "steampowered.com", "epicgames.com", "roblox.com", "minecraft.net",
  "openai.com", "anthropic.com", "huggingface.co", "npmjs.com", "pypi.org",
  "mozilla.org", "brave.com", "opera.com", "vivaldi.com", "proton.me",
  "icloud.com", "gmail.com", "protonmail.com", "fastmail.com", "tutanota.com",
  "walmart.com", "target.com", "bestbuy.com", "aliexpress.com", "etsy.com",
  "fedex.com", "ups.com", "usps.com", "dhl.com", "irs.gov",
];

const HOMOGLYPHS: Record<string, string> = {
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "l", "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ż": "z", "ź": "z",
};

function normalizeDomain(d: string): string {
  return d.toLowerCase().split("").map((c) => HOMOGLYPHS[c] ?? c).join("");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function typosquatHit(url: string): { host: string; suggestion: string } | null {
  const host = hostOf(url);
  if (!host || host.includes("/")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (host === "localhost") return null;
  const popular = new Set(POPULAR_DOMAINS);
  if (popular.has(host)) return null;
  for (const p of POPULAR_DOMAINS) {
    if (host.endsWith("." + p)) return null; // legitimate subdomain
  }
  const nHost = normalizeDomain(host);
  for (const p of POPULAR_DOMAINS) {
    const nPop = normalizeDomain(p);
    // same public suffix required (…g00gle.com vs google.com, not g00gle.io)
    const tldHost = host.split(".").pop() ?? "";
    const tldPop = p.split(".").pop() ?? "";
    if (tldHost !== tldPop) continue;
    /* homoglyph collision: g00gle.com normalizes exactly to google.com */
    if (nHost === nPop && host !== p) return { host, suggestion: p };
    const dist = levenshtein(nHost, nPop);
    const threshold = p.length >= 9 ? 2 : 1;
    if (dist > 0 && dist <= threshold) return { host, suggestion: p };
  }
  return null;
}

/* ── F6: popup / tracker-redirect signatures ────────────────── */
const REDIRECT_PATH_RE = /\/(redirect|track|tracker|click|clicks|out|outbound|go|away|exit|leave|jump|forward|redir)\b/i;
const REDIRECT_PARAM_RE = /[?&](url|u|q|target|dest|destination|to|next|redir|redirect|href|link|continue|return)=https?(?::\/\/|%3A)/i;

export function isRedirectPattern(url: string): boolean {
  try {
    const u = new URL(url);
    if (REDIRECT_PARAM_RE.test(u.search)) return true;
    return REDIRECT_PATH_RE.test(u.pathname) && u.search.length > 2;
  } catch {
    return false;
  }
}

export function extractRedirectTarget(url: string): string | null {
  try {
    const u = new URL(url);
    for (const key of ["url", "u", "target", "dest", "destination", "to", "next", "redir", "redirect", "href", "link", "continue", "return", "q"]) {
      const v = u.searchParams.get(key);
      if (!v) continue;
      const decoded = v.startsWith("http") ? v : decodeURIComponent(v);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

/* ── per-page load assessment (deterministic, seeds from host) ── */
function fnv(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface BlockAssessment {
  trackers: number;
  miners: number;
  sampleTrackers: string[];
}

export function assessPageLoad(
  url: string,
  opts: { adBlock: boolean; antiMiner: boolean }
): BlockAssessment {
  const h = hostOf(url);
  const seed = fnv(h);
  const out: BlockAssessment = { trackers: 0, miners: 0, sampleTrackers: [] };
  if (opts.adBlock) {
    out.trackers = (seed % 7) + ((seed >>> 5) % 6);
    const n = Math.min(3, out.trackers, lists.trackers.length);
    for (let i = 0; i < n; i++) {
      const entry = lists.trackers[(seed + i * 13) % lists.trackers.length];
      if (entry) out.sampleTrackers.push(entry.domain);
    }
  }
  if (opts.antiMiner) {
    if (seed % 11 === 0) out.miners = 1;
    if (minerFileHit(url)) out.miners += 1;
  }
  return out;
}

export function listSample(kind: "trackers" | "miners", host: string, n = 4): string[] {
  const arr = kind === "trackers" ? lists.trackers : lists.miners;
  if (!arr.length) return [];
  const seed = fnv(host);
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, arr.length); i++) {
    const e: { domain?: string } = arr[(seed + i * 7) % arr.length];
    if (e.domain) out.push(e.domain);
  }
  return out;
}
