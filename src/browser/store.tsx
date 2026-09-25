import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  Bookmark, Container, CtxMenu, Dial, DownloadItem, HistoryEntry, ModalState, PanelId,
  SecureState, Settings, Tab, Toast,
} from "./types";
import { loadJSON, saveJSON, uid } from "./persist";
import {
  faviconFor, hostOf, internalRoute, isInternal, prettyTitle, protocolOf, resolveInput,
} from "./url";
import {
  assessPageLoad, DOH_PROVIDERS, extractRedirectTarget, isRedirectPattern,
  loadSecurityLists, phishingHit, typosquatHit,
} from "./privacy";
import {
  buildAutofill, checkInbox, disposeMailbox, generateMailbox, readMessage,
  type MailBody, type Mailbox, type MailSummary,
} from "./email";

/* ── defaults ─────────────────────────────────────────────── */
const DEFAULT_SETTINGS: Settings = {
  engine: "duckduckgo",
  theme: "midnight",
  accent: "green",
  wallpaper: "aurora",
  showBookmarksBar: true,
  showStatusBar: true,
  restoreSession: true,
  httpsOnly: false,
  doNotTrack: true,
  adBlock: true,
  antiMiner: true,
  antiPhishing: true,
  typoProtection: true,
  webrtcProtection: true,
  popupBlocking: true,
  redirectBlocking: true,
  doh: "cloudflare",
  antiDetect: false,
  lockFingerprintToContainer: false,
  suggestions: true,
};

const DEFAULT_CONTAINERS: Container[] = [
  { id: "personal", name: "Personal", color: "#00e5a0" },
  { id: "work", name: "Work", color: "#38c8ff" },
  { id: "banking", name: "Banking", color: "#ffb224" },
  { id: "shopping", name: "Shopping", color: "#a78bfa" },
];

const DEFAULT_DIALS: Dial[] = [
  { id: "d1", title: "Wikipedia", url: "https://www.wikipedia.org/" },
  { id: "d2", title: "Hacker News", url: "https://news.ycombinator.com/" },
  { id: "d3", title: "GitHub", url: "https://github.com/" },
  { id: "d4", title: "YouTube", url: "https://www.youtube.com/" },
  { id: "d5", title: "OpenStreetMap", url: "https://www.openstreetmap.org/export/embed.html?bbox=-0.136,51.495,-0.096,51.515&layer=mapnik" },
  { id: "d6", title: "W3C", url: "https://www.w3.org/" },
  { id: "d7", title: "663 Settings", url: "663://settings" },
  { id: "d8", title: "NeverSSL · HTTP", url: "http://neverssl.com/" },
];

export interface State {
  tabs: Tab[];
  activeId: string;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  downloads: DownloadItem[];
  dials: Dial[];
  containers: Container[];
  popupExceptions: string[];
  mailbox: Mailbox | null;
  mail: MailSummary[];
  mailOpen: MailBody | null;
  mailBusy: boolean;
  settings: Settings;
  panel: PanelId | null;
  menuOpen: boolean;
  toasts: Toast[];
  ctx: CtxMenu | null;
  modal: ModalState | null;
  hoverUrl: string;
  blockedTotal: number;
  blockedPopups: number;
  blockedRedirects: number;
  minimized: boolean;
  closed: boolean;
  firstRun: boolean;
  closedStack: Tab[];
}

/* ── helpers ──────────────────────────────────────────────── */
function secureOf(url: string): SecureState {
  if (isInternal(url)) return "internal";
  if (phishingHit(url)) return "phish";
  return protocolOf(url) === "http" ? "http" : "https";
}

function makeTab(url = "663://newtab", extra?: Partial<Tab>): Tab {
  return {
    id: uid(),
    url,
    title: prettyTitle(url),
    favicon: faviconFor(url),
    loading: false,
    pinned: false,
    isPrivate: false,
    containerId: "personal",
    fpSeed: uid(),
    stack: [url],
    stackIndex: 0,
    blocked: 0,
    secure: secureOf(url),
    zoom: 1,
    frameError: null,
    bypassPhish: false,
    retryFrame: false,
    progress: 0,
    kick: 0,
    ...extra,
  };
}

function initState(): State {
  const settings = { ...DEFAULT_SETTINGS, ...loadJSON<Partial<Settings>>("settings", {}) };
  const firstRun = !loadJSON<boolean>("seen", false);
  const session = loadJSON<{ tabs: Tab[]; activeId: string }>("session", { tabs: [], activeId: "" });
  let tabs: Tab[] = [];
  if (!firstRun && settings.restoreSession && session.tabs.length) {
    tabs = session.tabs.map((t) =>
      makeTab(t.url, {
        id: t.id ?? uid(),
        title: t.title, favicon: t.favicon, pinned: t.pinned, zoom: t.zoom ?? 1,
        secure: secureOf(t.url), stack: t.stack?.length ? t.stack : [t.url],
        stackIndex: typeof t.stackIndex === "number" ? t.stackIndex : 0,
        containerId: t.containerId ?? "personal",
      })
    );
  }
  if (!tabs.length) tabs = [makeTab()];
  const activeId = tabs.some((t) => t.id === session.activeId) ? session.activeId : tabs[tabs.length - 1].id;
  return {
    tabs, activeId,
    bookmarks: loadJSON("bookmarks", []),
    history: loadJSON("history", []),
    downloads: loadJSON("downloads", []),
    dials: loadJSON("dials", DEFAULT_DIALS),
    containers: loadJSON("containers", DEFAULT_CONTAINERS),
    popupExceptions: loadJSON("popupExceptions", []),
    mailbox: null, mail: [], mailOpen: null, mailBusy: false,
    settings,
    panel: null, menuOpen: false, toasts: [], ctx: null, modal: null,
    hoverUrl: "",
    blockedTotal: loadJSON("blockedTotal", 0),
    blockedPopups: 0,
    blockedRedirects: 0,
    minimized: false, closed: false, firstRun, closedStack: [],
  };
}

/* ── context ──────────────────────────────────────────────── */
export interface Api {
  newTab: (url?: string, opts?: Partial<Tab>) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  moveTab: (id: string, to: number) => void;
  patchTab: (id: string, patch: Partial<Tab>) => void;
  navigate: (input: string, tabId?: string) => void;
  navDelta: (tabId: string, d: number) => void;
  reload: (tabId: string) => void;
  duplicateTab: (id: string) => void;
  togglePin: (id: string) => void;
  closeOthers: (id: string) => void;
  closeRight: (id: string) => void;
  reopenClosed: () => void;
  toggleBookmarkActive: () => void;
  removeBookmark: (id: string) => void;
  clearHistory: () => void;
  removeHistory: (id: string) => void;
  startDownload: (spec: { name: string; size: number; url?: string; makeBlob?: () => Promise<Blob> }) => void;
  clearDownloads: () => void;
  removeDownload: (id: string) => void;
  setPanel: (p: PanelId | null) => void;
  setMenuOpen: (b: boolean) => void;
  toast: (icon: string, text: string) => void;
  dismissToast: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  createContainer: (name: string, color: string) => void;
  deleteContainer: (id: string) => void;
  assignContainer: (tabId: string, containerId: string) => void;
  togglePopupException: (host: string) => void;
  gatePopup: (url: string) => boolean;
  handleNativePopup: (url: string) => void;
  rerollFingerprint: (tabId: string) => void;
  emailGenerate: () => Promise<void>;
  emailRefresh: (silent?: boolean) => Promise<void>;
  emailOpen: (id: number) => Promise<void>;
  emailCloseMessage: () => void;
  emailAutofill: () => void;
  emailDispose: () => void;
  setDials: (d: Dial[]) => void;
  setCtx: (c: CtxMenu | null) => void;
  setModal: (m: ModalState | null) => void;
  setHover: (u: string) => void;
  minimize: () => void;
  restoreWindow: () => void;
  quit: () => void;
  relaunch: () => void;
  zoomBy: (d: number) => void;
  zoomSet: (z: number) => void;
  completeFirstRun: () => void;
  openExternal: (url: string) => void;
}

const Ctx = createContext<{ state: State; api: Api } | null>(null);

export function useBrowser() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBrowser outside provider");
  return v;
}

export function useActiveTab(): Tab {
  const { state } = useBrowser();
  return state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];
}

/* ── provider ─────────────────────────────────────────────── */
export function BrowserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initState);
  const dlTimers = useRef(new Map<string, number>());
  /* async handlers (email polling) read the live state through this ref */
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    loadSecurityLists();
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      setTimeout(() => boot.remove(), 600);
    }
  }, []);

  /* persistence (electron-store equivalents) */
  useEffect(() => { saveJSON("settings", state.settings); }, [state.settings]);
  useEffect(() => { saveJSON("bookmarks", state.bookmarks); }, [state.bookmarks]);
  useEffect(() => { saveJSON("history", state.history); }, [state.history]);
  useEffect(() => { saveJSON("downloads", state.downloads); }, [state.downloads]);
  useEffect(() => { saveJSON("dials", state.dials); }, [state.dials]);
  useEffect(() => { saveJSON("containers", state.containers); }, [state.containers]);
  useEffect(() => { saveJSON("popupExceptions", state.popupExceptions); }, [state.popupExceptions]);
  useEffect(() => { saveJSON("blockedTotal", state.blockedTotal); }, [state.blockedTotal]);
  useEffect(() => {
    const persistable = state.tabs
      .filter((t) => !t.isPrivate)
      .map((t) => ({ ...t, loading: false, frameError: null, progress: 0, bypassPhish: false, retryFrame: false, blocked: 0 }));
    saveJSON("session", { tabs: persistable, activeId: state.activeId });
  }, [state.tabs, state.activeId]);

  const set = (fn: (s: State) => State) => setState((s) => fn(s));

  const api: Api = {
    /* ── tabs ── */
    newTab: (url = "663://newtab", opts) =>
      set((s) => {
        const tab = makeTab(url, opts);
        const { tabs } = s;
        return { ...s, tabs: [...tabs, tab], activeId: tab.id };
      }),

    closeTab: (id) =>
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id);
        if (idx < 0) return s;
        const closedTab = s.tabs[idx];
        const tabs = s.tabs.filter((t) => t.id !== id);
        const closedStack = [closedTab, ...s.closedStack].slice(0, 12);
        if (!tabs.length) {
          const fresh = makeTab();
          return { ...s, tabs: [fresh], activeId: fresh.id, closedStack };
        }
        const activeId =
          s.activeId === id ? tabs[Math.min(idx, tabs.length - 1)].id : s.activeId;
        return { ...s, tabs, activeId, closedStack };
      }),

    activateTab: (id) => set((s) => ({ ...s, activeId: id })),

    moveTab: (id, to) =>
      set((s) => {
        const from = s.tabs.findIndex((t) => t.id === id);
        if (from < 0) return s;
        const tabs = [...s.tabs];
        const [t] = tabs.splice(from, 1);
        tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, t);
        return { ...s, tabs };
      }),

    patchTab: (id, patch) =>
      set((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

    /* ── navigation ── */
    navigate: (input, tabId) =>
      set((s) => {
        const id = tabId ?? s.activeId;
        const tab = s.tabs.find((t) => t.id === id);
        if (!tab) return s;
        let { url } = resolveInput(input);

        /* HTTPS-Only: upgrade plain http (except whitelisted demos) */
        let upgraded = false;
        const host = hostOf(url);
        if (s.settings.httpsOnly && protocolOf(url) === "http" && host !== "neverssl.com" && !host.endsWith(".example")) {
          url = url.replace(/^http:\/\//, "https://");
          upgraded = true;
        }

        const route = internalRoute(url);
        const isDoc = route === null || route === "search";
        const external = !isInternal(url);

        /* F6 — cloaked tracker redirects */
        const isRedirect =
          external && s.settings.redirectBlocking && isRedirectPattern(url);

        /* F5 — phishing feed + typosquatting */
        const phishing = !isRedirect && external && s.settings.antiPhishing && phishingHit(url);
        const typo = !isRedirect && !phishing && external && s.settings.typoProtection ? typosquatHit(url) : null;

        const secure: SecureState = isRedirect
          ? "redirect"
          : phishing
            ? "phish"
            : typo
              ? "typo"
              : secureOf(url);

        const recordable = !isRedirect && !phishing && !typo;
        const stack = [...tab.stack.slice(0, tab.stackIndex + 1), url];
        const blocked =
          external && recordable
            ? (() => {
                const a = assessPageLoad(url, { adBlock: s.settings.adBlock, antiMiner: s.settings.antiMiner });
                return a.trackers + a.miners;
              })()
            : 0;

        const history =
          recordable && !tab.isPrivate && isDoc && !(route === "search" && !url.includes("q="))
            ? [{ id: uid(), title: prettyTitle(url), url, visitedAt: Date.now() }, ...s.history].slice(0, 600)
            : s.history;

        const gated = isRedirect || phishing || typo;
        const tabs = s.tabs.map((t) =>
          t.id === id
            ? {
                ...t, url, stack, stackIndex: stack.length - 1,
                title: isRedirect ? "Redirect blocked" : phishing ? "Security risk" : typo ? "Possible typosquatting" : prettyTitle(url),
                favicon: gated ? null : faviconFor(url),
                secure, blocked, loading: !gated, progress: gated ? 1 : 0.14,
                frameError: null, retryFrame: false,
                bypassPhish: gated ? false : t.bypassPhish,
                typoSuggestion: typo?.suggestion ?? null,
                redirectTarget: isRedirect ? extractRedirectTarget(url) : null,
                kick: t.kick + 1,
              }
            : t
        );
        const st = {
          ...s, tabs, history,
          blockedTotal: s.blockedTotal + blocked,
          blockedRedirects: s.blockedRedirects + (isRedirect ? 1 : 0),
          menuOpen: false,
        };
        if (upgraded) setTimeout(() => api.toast("ri-arrow-up-circle-line", "HTTPS-Only upgraded this connection"), 30);
        if (isRedirect) setTimeout(() => api.toast("ri-forbid-2-line", `Blocked a tracker redirect → ${hostOf(url)}`), 30);
        if (typo) setTimeout(() => api.toast("ri-error-warning-line", `Typosquatting suspected — did you mean ${typo.suggestion}?`), 30);
        if (blocked > 5) setTimeout(() => api.toast("ri-shield-check-line", `Shield blocked ${blocked} trackers on ${hostOf(url)}`), 500);
        return st;
      }),

    navDelta: (tabId, d) =>
      set((s) => {
        const tab = s.tabs.find((t) => t.id === tabId);
        if (!tab) return s;
        const idx = tab.stackIndex + d;
        if (idx < 0 || idx >= tab.stack.length) return s;
        const url = tab.stack[idx];
        const tabs = s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, url, stackIndex: idx, title: prettyTitle(url), favicon: faviconFor(url), secure: secureOf(url), loading: true, progress: 0.14, frameError: null, retryFrame: false, kick: t.kick + 1 }
            : t
        );
        return { ...s, tabs };
      }),

    reload: (tabId) =>
      set((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, loading: true, progress: 0.14, kick: t.kick + 1, frameError: null } : t)),
      })),

    duplicateTab: (id) =>
      set((s) => {
        const src = s.tabs.find((t) => t.id === id);
        if (!src) return s;
        const copy = makeTab(src.url, { isPrivate: src.isPrivate, zoom: src.zoom });
        const idx = s.tabs.findIndex((t) => t.id === id);
        const tabs = [...s.tabs];
        tabs.splice(idx + 1, 0, copy);
        return { ...s, tabs, activeId: copy.id, ctx: null };
      }),

    togglePin: (id) => {
      set((s) => {
        const tabs = s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
        tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned));
        return { ...s, tabs, ctx: null };
      });
    },

    closeOthers: (id) =>
      set((s) => {
        const keep = s.tabs.find((t) => t.id === id);
        if (!keep) return s;
        const rest = s.tabs.filter((t) => t.id !== id && t.pinned);
        return { ...s, tabs: [...rest, keep], activeId: id, ctx: null };
      }),

    closeRight: (id) =>
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id);
        if (idx < 0) return s;
        const removed = s.tabs.slice(idx + 1).filter((t) => !t.pinned);
        const tabs = s.tabs.filter((t, i) => i <= idx || t.pinned);
        const activeId = removed.some((t) => t.id === s.activeId) ? id : s.activeId;
        return { ...s, tabs, activeId, ctx: null };
      }),

    reopenClosed: () =>
      set((s) => {
        const [tab, ...rest] = s.closedStack;
        if (!tab) return s;
        const revived = { ...tab, id: uid(), loading: false, kick: tab.kick + 1 };
        return { ...s, tabs: [...s.tabs, revived], activeId: revived.id, closedStack: rest };
      }),

    /* ── bookmarks ── */
    toggleBookmarkActive: () =>
      set((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeId);
        if (!tab) return s;
        const existing = s.bookmarks.find((b) => b.url === tab.url);
        if (existing) {
          setTimeout(() => api.toast("ri-star-line", "Bookmark removed"), 20);
          return { ...s, bookmarks: s.bookmarks.filter((b) => b.id !== existing.id) };
        }
        const bm: Bookmark = { id: uid(), title: tab.title, url: tab.url, addedAt: Date.now() };
        setTimeout(() => api.toast("ri-star-fill", "Bookmark added"), 20);
        return { ...s, bookmarks: [...s.bookmarks, bm] };
      }),

    removeBookmark: (id) => set((s) => ({ ...s, bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

    clearHistory: () => set((s) => ({ ...s, history: [] })),
    removeHistory: (id) => set((s) => ({ ...s, history: s.history.filter((h) => h.id !== id) })),

    /* ── downloads ── */
    startDownload: (spec) => {
      const id = uid();
      set((s) => ({
        ...s,
        downloads: [
          { id, name: spec.name, url: spec.url ?? "", size: spec.size, received: 0, state: "active" as const, startedAt: Date.now() },
          ...s.downloads,
        ].slice(0, 60),
      }));
      let prog = 0;
      const timer = window.setInterval(async () => {
        prog = Math.min(spec.size, prog + spec.size * (0.05 + Math.random() * 0.13));
        if (prog >= spec.size) {
          window.clearInterval(dlTimers.current.get(id) ?? 0);
          dlTimers.current.delete(id);
          set((s) => ({ ...s, downloads: s.downloads.map((d) => (d.id === id ? { ...d, received: spec.size, state: "done" } : d)) }));
          try {
            if (spec.makeBlob) {
              const blob = await spec.makeBlob();
              const u = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = u; a.download = spec.name;
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(u), 5000);
            }
          } catch { /* real-save best effort */ }
          api.toast("ri-download-2-line", `Saved ${spec.name}`);
        } else {
          set((s) => ({ ...s, downloads: s.downloads.map((d) => (d.id === id ? { ...d, received: Math.floor(prog) } : d)) }));
        }
      }, 120);
      dlTimers.current.set(id, timer);
    },

    clearDownloads: () => set((s) => ({ ...s, downloads: s.downloads.filter((d) => d.state === "active") })),
    removeDownload: (id) => set((s) => ({ ...s, downloads: s.downloads.filter((d) => d.id !== id) })),

    /* ── ui ── */
    setPanel: (p) => set((s) => ({ ...s, panel: s.panel === p ? null : p, menuOpen: false })),
    setMenuOpen: (b) => set((s) => ({ ...s, menuOpen: b })),
    toast: (icon, text) => {
      const id = uid();
      set((s) => ({ ...s, toasts: [...s.toasts, { id, icon, text }].slice(-4) }));
      window.setTimeout(() => api.dismissToast(id), 3400);
    },
    dismissToast: (id) => set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })),
    updateSettings: (patch) => {
      set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      /* forward DoH changes to the main process (configureHostResolver) */
      if (patch.doh) {
        const p = DOH_PROVIDERS[patch.doh];
        (window as unknown as { nation?: { setDoH?: (cfg: { id: string; resolver: string | null }) => void } })
          .nation?.setDoH?.({ id: p.id, resolver: p.resolver });
      }
    },

    createContainer: (name, color) =>
      set((s) => ({ ...s, containers: [...s.containers, { id: uid(), name: name.trim() || "Container", color }] })),

    deleteContainer: (id) => {
      if (id === "personal") return;
      set((s) => ({
        ...s,
        containers: s.containers.filter((c) => c.id !== id),
        tabs: s.tabs.map((t) => (t.containerId === id ? { ...t, containerId: "personal" } : t)),
      }));
    },

    assignContainer: (tabId, containerId) => {
      set((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, containerId } : t)),
        ctx: null,
      }));
      const name = state.containers.find((c) => c.id === containerId)?.name ?? "container";
      setTimeout(() => api.toast("ri-stack-line", `Tab isolated in “${name}” — partition persist:663nation-${containerId}`), 20);
    },

    togglePopupException: (host) =>
      set((s) => {
        const has = s.popupExceptions.includes(host);
        setTimeout(() => api.toast("ri-window-2-line", has ? `Popups blocked again on ${host}` : `Popups allowed on ${host}`), 20);
        return {
          ...s,
          popupExceptions: has ? s.popupExceptions.filter((h) => h !== host) : [...s.popupExceptions, host],
        };
      }),

    gatePopup: (url) => {
      const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();
      if (!state.settings.popupBlocking) return true;
      if (state.popupExceptions.includes(host)) return true;
      console.log(`[663Nation] blocked popup: ${url}`);
      set((s) => ({ ...s, blockedPopups: s.blockedPopups + 1 }));
      api.toast("ri-forbid-2-line", `Popup blocked — ${host}`);
      return false;
    },

    handleNativePopup: (url) => {
      if (api.gatePopup(url)) api.newTab(url);
    },

    /* ── F1 · anti-detect ── */
    rerollFingerprint: (tabId) => {
      const seed = uid();
      set((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, fpSeed: seed, kick: t.kick + 1 } : t)) }));
      api.toast("ri-fingerprint-line", "New fingerprint generated for this tab");
    },

    /* ── F2 · disposable email ── */
    emailGenerate: async () => {
      set((s) => ({ ...s, mailBusy: true, mailOpen: null }));
      const onArrive = () => { api.emailRefresh(true); };
      const mb = await generateMailbox(onArrive);
      set((s) => {
        disposeMailbox(s.mailbox);
        return { ...s, mailbox: mb, mail: [], mailBusy: false, panel: "email" };
      });
      api.toast("ri-mail-add-line", `Relay ready — ${mb.address}`);
    },

    emailRefresh: async (silent = false) => {
      const mb = stateRef.current.mailbox;
      if (!mb) return;
      if (!silent) set((s) => ({ ...s, mailBusy: true }));
      const list = await checkInbox(mb);
      set((s) => {
        if (!s.mailbox || s.mailbox.address !== mb.address) return { ...s, mailBusy: false };
        if (list.length > s.mail.length) {
          const fresh = list.length - s.mail.length;
          setTimeout(() => api.toast("ri-mail-unread-line", `${fresh} new message${fresh === 1 ? "" : "s"} in your relay`), 10);
        }
        return { ...s, mail: list, mailBusy: false };
      });
    },

    emailOpen: async (id) => {
      const mb = stateRef.current.mailbox;
      if (!mb) return;
      set((s) => ({ ...s, mailBusy: true }));
      const msg = await readMessage(mb, id);
      set((s) => ({ ...s, mailOpen: msg, mailBusy: false }));
    },

    emailCloseMessage: () => set((s) => ({ ...s, mailOpen: null })),

    emailAutofill: () => {
      const mb = stateRef.current.mailbox;
      if (!mb) return;
      navigator.clipboard?.writeText(mb.address).catch(() => {});
      const code = buildAutofill(mb.address);
      const bridge = (window as unknown as { nation?: { autofillEmail?: (c: string) => void } }).nation;
      if (bridge?.autofillEmail) bridge.autofillEmail(code);
      api.toast("ri-input-cursor-move", `${mb.address} copied — fields on the page autofilled`);
    },

    emailDispose: () =>
      set((s) => {
        disposeMailbox(s.mailbox);
        setTimeout(() => api.toast("ri-delete-bin-line", "Relay mailbox burned"), 10);
        return { ...s, mailbox: null, mail: [], mailOpen: null };
      }),
    setDials: (dials) => set((s) => ({ ...s, dials })),
    setCtx: (ctx) => set((s) => ({ ...s, ctx })),
    setModal: (modal) => set((s) => ({ ...s, modal })),
    setHover: (u) => set((s) => (s.hoverUrl === u ? s : { ...s, hoverUrl: u })),
    minimize: () => set((s) => ({ ...s, minimized: true })),
    restoreWindow: () => set((s) => ({ ...s, minimized: false, closed: false })),
    quit: () => set((s) => ({ ...s, closed: true })),
    relaunch: () => set((s) => ({ ...s, closed: false, minimized: false })),
    completeFirstRun: () => {
      saveJSON("seen", true);
      set((s) => ({ ...s, firstRun: false }));
    },
    openExternal: (url) => {
      const bridge = (window as unknown as { nation?: { openExternal?: (u: string) => void } }).nation;
      if (bridge?.openExternal) bridge.openExternal(url);
      else window.open(url, "_blank", "noopener");
    },

    zoomBy: (d) =>
      set((s) => ({
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === s.activeId ? { ...t, zoom: Math.max(0.5, Math.min(2, Math.round((t.zoom + d) * 10) / 10)) } : t
        ),
      })),
    zoomSet: (z) =>
      set((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, zoom: Math.max(0.5, Math.min(2, z)) } : t)),
      })),
  };

  return <Ctx.Provider value={{ state, api }}>{children}</Ctx.Provider>;
}
