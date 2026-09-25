export type EngineId = "duckduckgo" | "google" | "bing" | "brave";
export type ThemeId = "midnight" | "abyss" | "ember" | "ash";
export type AccentId = "green" | "cyan" | "violet" | "amber" | "rose";
export type WallpaperId = "aurora" | "ember" | "mesh";
export type SecureState = "internal" | "https" | "http" | "phish" | "typo" | "redirect";
export type PanelId = "bookmarks" | "history" | "downloads" | "email";
export type DLState = "active" | "done" | "error";
export type DoHProvider = "cloudflare" | "google" | "quad9" | "off";

export interface Container {
  id: string;
  name: string;
  color: string;
}

export interface Settings {
  engine: EngineId;
  theme: ThemeId;
  accent: AccentId;
  wallpaper: WallpaperId;
  showBookmarksBar: boolean;
  showStatusBar: boolean;
  restoreSession: boolean;
  httpsOnly: boolean;
  doNotTrack: boolean;
  adBlock: boolean;
  antiMiner: boolean;
  antiPhishing: boolean;
  typoProtection: boolean;
  webrtcProtection: boolean;
  popupBlocking: boolean;
  redirectBlocking: boolean;
  doh: DoHProvider;
  antiDetect: boolean;
  lockFingerprintToContainer: boolean;
  suggestions: boolean;
}

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  pinned: boolean;
  isPrivate: boolean;
  containerId: string;
  stack: string[];
  stackIndex: number;
  blocked: number;
  secure: SecureState;
  zoom: number;
  frameError: null | "blocked" | "timeout";
  bypassPhish: boolean;
  retryFrame: boolean;
  progress: number;
  kick: number;
  typoSuggestion?: string | null;
  redirectTarget?: string | null;
  /** anti-detect: per-tab fingerprint seed (or container seed when locked) */
  fpSeed: string;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  addedAt: number;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface DownloadItem {
  id: string;
  name: string;
  url: string;
  size: number;
  received: number;
  state: DLState;
  startedAt: number;
}

export interface Dial {
  id: string;
  title: string;
  url: string;
}

export interface Toast {
  id: string;
  icon: string;
  text: string;
}

export interface CtxMenu {
  x: number;
  y: number;
  tabId: string;
}

export interface ModalState {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  inputs?: { key: string; label: string; placeholder: string; value?: string }[];
  onConfirm: (values: Record<string, string>) => void;
}
