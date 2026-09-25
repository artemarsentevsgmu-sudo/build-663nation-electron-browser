import type { EngineId } from "./types";

export interface Engine {
  id: EngineId;
  name: string;
  icon: string;
  url: (q: string) => string;
  color: string;
}

export const ENGINES: Record<EngineId, Engine> = {
  duckduckgo: {
    id: "duckduckgo",
    name: "DuckDuckGo",
    icon: "ri-search-eye-line",
    url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    color: "#de5833",
  },
  google: {
    id: "google",
    name: "Google",
    icon: "ri-google-fill",
    url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    color: "#8ab4f8",
  },
  bing: {
    id: "bing",
    name: "Bing",
    icon: "ri-microsoft-fill",
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    color: "#4fc3f7",
  },
  brave: {
    id: "brave",
    name: "Brave",
    icon: "ri-shield-star-line",
    url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
    color: "#fb542b",
  },
};

export const INTERNAL_SCHEME = "663://";

export function isInternal(u: string): boolean {
  return u.startsWith(INTERNAL_SCHEME);
}

export function internalRoute(u: string): "newtab" | "settings" | "search" | null {
  if (!isInternal(u)) return null;
  const path = u.slice(INTERNAL_SCHEME.length).split(/[?#]/)[0].replace(/\/+$/, "");
  if (path === "newtab" || path === "" || path === "home") return "newtab";
  if (path === "settings") return "settings";
  if (path === "search") return "search";
  return null;
}

const HOST_RE = /^([a-z0-9-]+\.)+[a-z]{2,24}([/:?#]|$)/i;
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/:?#]|$)/;
const LOCAL_RE = /^localhost(:\d+)?([/:?#]|$)/i;

/** Decides whether omnibox input is a URL or a search query. */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/\s/.test(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return true;
  if (isInternal(s)) return true;
  if (LOCAL_RE.test(s) || IP_RE.test(s)) return true;
  return HOST_RE.test(s);
}

export interface Resolved {
  url: string;
  isSearch: boolean;
}

export function resolveInput(input: string): Resolved {
  const s = input.trim();
  if (!s) return { url: "663://newtab", isSearch: false };
  if (isInternal(s)) return { url: s, isSearch: false };
  if (/^https?:\/\//i.test(s)) return { url: s, isSearch: false };
  if (/^(file|chrome|edge|about):/i.test(s)) return { url: "663://newtab", isSearch: false };
  if (!/\s/.test(s) && (HOST_RE.test(s) || IP_RE.test(s))) return { url: "https://" + s, isSearch: false };
  if (LOCAL_RE.test(s)) return { url: "http://" + s, isSearch: false };
  return { url: `${INTERNAL_SCHEME}search?q=${encodeURIComponent(s)}`, isSearch: true };
}

export function engineSearchUrl(q: string, engine: EngineId): string {
  return ENGINES[engine].url(q);
}

export function hostOf(url: string): string {
  if (isInternal(url)) return "663://" + url.slice(6).split(/[?#]/)[0].replace(/\/+$/, "");
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function protocolOf(url: string): string {
  try {
    return new URL(url).protocol.replace(":", "");
  } catch {
    return "";
  }
}

export function faviconFor(url: string): string | null {
  if (isInternal(url)) return null;
  try {
    const h = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${h}&sz=64`;
  } catch {
    return null;
  }
}

const BRAND_TITLES: Record<string, string> = {
  "wikipedia.org": "Wikipedia",
  "github.com": "GitHub",
  "youtube.com": "YouTube",
  "news.ycombinator.com": "Hacker News",
  "reddit.com": "Reddit",
  "openstreetmap.org": "OpenStreetMap",
  "w3.org": "W3C",
  "example.com": "Example Domain",
  "archive.org": "Internet Archive",
  "developer.mozilla.org": "MDN Web Docs",
  "x.com": "X",
  "bing.com": "Bing",
  "duckduckgo.com": "DuckDuckGo",
  "neverssl.com": "NeverSSL",
  "httpforever.com": "HTTP Forever",
  "stackoverflow.com": "Stack Overflow",
  "iana.org": "IANA",
  "openlibrary.org": "Open Library",
};

export function prettyTitle(url: string): string {
  const route = internalRoute(url);
  if (route === "newtab") return "New Tab";
  if (route === "settings") return "Settings";
  if (route === "search") {
    const q = new URLSearchParams(url.split("?")[1] || "").get("q");
    return q ? `663 Search — ${q}` : "663 Search";
  }
  const h = hostOf(url);
  if (BRAND_TITLES[h]) return BRAND_TITLES[h];
  const base = h.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Hosts known to send X-Frame-Options / CSP frame-ancestors, so we skip
 *  straight to an elegant fallback card instead of a broken frame. */
const FRAME_BLOCKERS = [
  "google.", "youtube.", "github.", "x.com", "twitter.", "reddit.", "facebook.",
  "instagram.", "bing.", "duckduckgo.", "search.brave.", "amazon.", "netflix.",
  "chatgpt.", "openai.", "medium.", "stackoverflow.", "linkedin.", "apple.",
  "microsoft.", "twitch.", "discord.", "spotify.", "paypal.", "notion.",
  "figma.", "canva.", "npmjs.", "vercel.", "cloudflare.", "whatsapp.",
  "tiktok.", "pinterest.", "telegram.", "slack.", "zoom.", "yahoo.",
];

export function blocksFraming(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return FRAME_BLOCKERS.some((b) => h.includes(b));
  } catch {
    return false;
  }
}

export function displayUrl(url: string): string {
  try {
    if (isInternal(url)) return url;
    const u = new URL(url);
    const s = u.origin + u.pathname + u.search;
    return s.length > 96 ? s.slice(0, 96) + "…" : s;
  } catch {
    return url;
  }
}

export const DEMO_PHISH_URL = "http://free-giveaway-663.example/claim-prize";
export const DEMO_HTTP_URL = "http://neverssl.com/";
export const DEMO_MINE_URL = "https://coinhive-demo.663/miner";
