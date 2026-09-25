/**
 * 663Nation — main process
 * Frameless window · sandboxed renderers · contextBridge-only IPC
 *
 * Native privacy stack (renderer parity in src/browser/privacy.ts):
 *   F1 crypto-miner blocking   → webRequest.onBeforeRequest + WASM guard injection
 *   F2 DNS-over-HTTPS          → app.configureHostResolver (+ boot flag)
 *   F3 container isolation     → per-container webview partitions
 *   F4 WebRTC leak protection  → permission deny + RTCPeerConnection override
 *   F5 anti-phishing           → JSON feed, checked on did-navigate
 *   F6 popup/redirect blocker  → setWindowOpenHandler deny + redirect chains
 */
const { app, BrowserWindow, ipcMain, net, session, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/* persistent root partition; containers extend it (F3) */
const PARTITION = "persist:663nation";
const partitionFor = (containerId) =>
  !containerId || containerId === "personal" ? PARTITION : `${PARTITION}-${containerId}`;

let win = null;
let prefs = { antiMiner: true, webrtcProtection: true, popupBlocking: true, redirectBlocking: true, doh: "cloudflare" };

/* ── encrypted persistence: electron-store + AES-256-GCM ── */
let store = null;
try {
  const Store = require("electron-store");
  store = new Store({ name: "663nation-profile" });
  prefs = { ...prefs, ...(store.get("prefs") || {}) };
} catch { /* optional during development */ }

const VAULT_KEY = crypto.createHash("sha256").update("663nation:v1").digest();
function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", VAULT_KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}
function decryptJson(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", VAULT_KEY, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const data = Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]);
  return JSON.parse(data.toString("utf8"));
}

/* ═══ F2 · DNS-over-HTTPS ═══ */
const DOH = {
  cloudflare: "https://cloudflare-dns.com/dns-query",
  google: "https://dns.google/dns-query",
  quad9: "https://dns.quad9.net/dns-query",
};
function applyDoH(id) {
  try {
    if (id && DOH[id] && app.configureHostResolver) {
      app.configureHostResolver({ secureDnsMode: "secure", secureDnsServers: [DOH[id]] });
      console.log(`[663Nation] DoH → ${id} (${DOH[id]})`);
    } else if (app.configureHostResolver) {
      app.configureHostResolver({ secureDnsMode: "off" });
      console.log("[663Nation] DoH → off (system resolver)");
    }
  } catch (e) { console.log("[663Nation] DoH apply failed:", e.message); }
}
/* boot flag so the very first resolution is already covered */
if (DOH[prefs.doh]) app.commandLine.appendSwitch("dns-over-https-resolver", DOH[prefs.doh]);

/* ═══ F1 · crypto-miner signatures ═══ */
const MINER_HOSTS = /(coinhive|coin-hive|authedmine|jsecoin|crypto-?loot|coinimp|minero\.cc|webmine|ppoi|minergate|monerominer|xmrpool|xmrig)/i;
const MINER_FILES = /(cryptonight|coinhive|authedmine|jsecoin|webminer|deepminer|monerominer|miner(\.min)?\.js|cn\.wasm|hashwasm)/i;

/* ═══ F6 · cloaked redirect signatures ═══ */
const REDIRECT_PATH = /\/(redirect|track|tracker|click|clicks|out|outbound|go|away|exit|leave|jump|forward|redir)\b/i;
const REDIRECT_PARAM = /[?&](url|u|q|target|dest|destination|to|next|redir|redirect|href|link|continue|return)=https?(::|%3A)/i;
const isRedirect = (u) => REDIRECT_PATH.test(u) && /\?/.test(u) || REDIRECT_PARAM.test(u);

/* ═══ F5 · phishing feed (loaded once, hash-set) ═══ */
let PHISH = new Set();
try {
  const feed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "security", "phishing.json"), "utf8"));
  PHISH = new Set((feed.entries || []).map((e) => e.host));
} catch { /* feed ships with the renderer too */ }

/* ═══ in-page guards (F1 WASM / F4 WebRTC), injected per navigation ═══ */
const MINER_GUARD = `
(() => {
  if (window.__663MinerGuard) return; window.__663MinerGuard = true;
  const SIG = /cryptonight|cn_heavy|monero|xmr/i;
  const oi = WebAssembly.instantiate, os = WebAssembly.instantiateStreaming;
  WebAssembly.instantiate = function (bytes, imports) {
    try {
      const head = new TextDecoder().decode(new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0, 4096) : bytes));
      if (SIG.test(head)) { console.warn("[663Nation] WASM miner signature killed"); return Promise.reject("blocked by 663Nation"); }
    } catch {}
    return oi.apply(WebAssembly, arguments);
  };
  WebAssembly.instantiateStreaming = function (resp, imports) {
    return Promise.resolve(resp).then((r) => {
      const url = (r && r.url) || "";
      if (${MINER_FILES}.test(url)) { console.warn("[663Nation] blocked streaming miner: " + url); return Promise.reject("blocked by 663Nation"); }
      return os.apply(WebAssembly, [r, imports]);
    });
  };
})();`;

const WEBRTC_GUARD = `
(() => {
  if (window.__663RtcGuard) return; window.__663RtcGuard = true;
  const OriginalRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (OriginalRTC) {
    const Guarded = function (config, constraints) {
      if (config && config.iceServers) config.iceServers = [];
      return new OriginalRTC(config, constraints);
    };
    Guarded.prototype = OriginalRTC.prototype;
    window.RTCPeerConnection = Guarded;
    if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = Guarded;
  }
  try {
    Object.defineProperty(navigator, "mediaDevices", { get: () => undefined, configurable: true });
  } catch {}
  try { navigator.getUserMedia = () => Promise.reject(new DOMException("blocked by 663Nation", "NotAllowedError")); } catch {}
})();`;

/* ═══ webview lifecycle — every tab frame gets the full stack ═══ */
function armWebContents(contents) {
  if (contents.getType() !== "webview") return;
  const ses = contents.session;

  /* F1 + F6 request-level blocking */
  ses.webRequest.onBeforeRequest((details, cb) => {
    const u = details.url;
    if (prefs.antiMiner && (MINER_HOSTS.test(u) || MINER_FILES.test(u))) {
      console.log("[663Nation] blocked miner:", u);
      win?.webContents.send("nation:blocked", { kind: "miner", url: u });
      return cb({ cancel: true });
    }
    if (prefs.redirectBlocking && isRedirect(u)) {
      console.log("[663Nation] blocked tracker redirect:", u);
      win?.webContents.send("nation:blocked", { kind: "redirect", url: u });
      return cb({ cancel: true });
    }
    cb({});
  });

  /* F6 redirect-chain collapse: > 3 hops inside 2 s */
  const chains = new Map();
  ses.webRequest.onBeforeRedirect((details) => {
    const n = (chains.get(details.url) || 0) + 1;
    chains.set(details.url, n);
    setTimeout(() => chains.delete(details.url), 2000);
    if (n > 3) {
      console.log("[663Nation] redirect chain collapsed:", details.url);
      win?.webContents.send("nation:blocked", { kind: "chain", url: details.url });
    }
  });

  /* F4 permission gate */
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    if (prefs.webrtcProtection && (permission === "media" || permission === "display-capture")) {
      console.log("[663Nation] permission denied:", permission);
      return cb(false);
    }
    cb(true);
  });

  /* F6 popup denial → renderer decides (new tab or badge) */
  contents.setWindowOpenHandler(({ url }) => {
    if (prefs.popupBlocking) {
      win?.webContents.send("nation:popup-blocked", url);
      return { action: "deny" };
    }
    win?.webContents.send("nation:new-tab", url);
    return { action: "deny" };
  });

  /* Anti-Detect must beat page scripts → inject at document_start.
     `did-start-loading` + `dom-ready` is the earliest reliable pair for
     <webview>; executeJavaScript runs in the isolated-but-main world. */
  const injectAntiDetect = () => {
    const tabId = tabBinding.get(contents.id);
    const code = tabId && antiDetectCode.get(tabId);
    if (code) contents.executeJavaScript(code, true).catch(() => {});
  };
  contents.on("did-start-loading", injectAntiDetect);
  contents.on("dom-ready", injectAntiDetect);

  /* F5 phishing check + guards on every navigation */
  contents.on("did-navigate", (_e, url) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (PHISH.has(host)) win?.webContents.send("nation:phish-hit", { url, host });
    } catch {}
    injectAntiDetect();
    if (prefs.webrtcProtection) contents.executeJavaScript(WEBRTC_GUARD).catch(() => {});
    if (prefs.antiMiner) contents.executeJavaScript(MINER_GUARD).catch(() => {});
  });
  contents.on("did-navigate-in-page", () => {
    if (prefs.webrtcProtection) contents.executeJavaScript(WEBRTC_GUARD).catch(() => {});
    if (prefs.antiMiner) contents.executeJavaScript(MINER_GUARD).catch(() => {});
  });
  contents.on("destroyed", () => tabBinding.delete(contents.id));
}

app.on("web-contents-created", (_e, contents) => armWebContents(contents));

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 560,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#04060a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  applyDoH(prefs.doh);

  const ses = session.fromPartition(PARTITION);
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    details.requestHeaders["DNT"] = "1";
    details.requestHeaders["Sec-GPC"] = "1";
    cb({ requestHeaders: details.requestHeaders });
  });

  /* shell window never navigates — only webviews do */
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    win.webContents.send("nation:popup-blocked", url);
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

/* ── window control IPC ── */
ipcMain.on("nation:minimize", () => win?.minimize());
ipcMain.on("nation:toggle-maximize", () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on("nation:close", () => win?.close());

/* ═══ F1(phase3) · Anti-Detect ═══
   The renderer builds the payload (src/browser/antidetect.ts) and ships it
   here; we hold it per tab and replay it at document_start on every load so
   the spoof lands BEFORE any page script runs. */
const antiDetectCode = new Map(); // tabId → injection source

ipcMain.on("nation:anti-detect", (_e, tabId, code) => {
  antiDetectCode.set(String(tabId), String(code));
  // apply immediately to any live webview already bound to this tab
  for (const [wcId, boundTab] of tabBinding) {
    if (boundTab !== String(tabId)) continue;
    const wc = require("electron").webContents.fromId(wcId);
    if (wc && !wc.isDestroyed()) wc.executeJavaScript(code).catch(() => {});
  }
});

/* renderer tells us which webContents belongs to which tab id */
const tabBinding = new Map(); // webContents.id → tabId
ipcMain.on("nation:bind-tab", (e, tabId) => {
  tabBinding.set(e.sender.id, String(tabId));
});

/* email autofill payload → active webview */
ipcMain.on("nation:autofill-email", (_e, code) => {
  const wc = require("electron").webContents.getAllWebContents()
    .find((c) => c.getType() === "webview" && c.isFocused()) ||
    require("electron").webContents.getAllWebContents().find((c) => c.getType() === "webview");
  if (wc) wc.executeJavaScript(String(code)).catch(() => {});
});

/* ═══ F2(phase3) · Disposable email — 1secmail proxy (no CORS in main) ═══ */
const ONESEC = "https://www.1secmail.com/api/v1/";
function apiGet(query) {
  return new Promise((resolve, reject) => {
    const req = net.request(ONESEC + query);
    let body = "";
    req.on("response", (res) => {
      res.on("data", (c) => (body += c.toString()));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

ipcMain.handle("nation:email-generate", async () => {
  const j = await apiGet("?action=genRandomMailbox&count=1");
  return Array.isArray(j) ? j[0] : null;
});
ipcMain.handle("nation:email-check", async (_e, login, domain) =>
  apiGet(`?action=getMessages&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`)
);
ipcMain.handle("nation:email-read", async (_e, login, domain, id) =>
  apiGet(`?action=readMessage&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${id}`)
);

/* ── privacy IPC ── */
ipcMain.on("nation:set-doh", (_e, cfg) => {
  prefs.doh = cfg?.id || "off";
  applyDoH(prefs.doh);
});
ipcMain.on("nation:pref", (_e, patch) => {
  prefs = { ...prefs, ...patch };
  try { store && store.set("prefs", prefs); } catch {}
});

/* crypto service + encrypted store */
ipcMain.handle("nation:sha256", (_e, text) => crypto.createHash("sha256").update(String(text), "utf8").digest("hex"));
ipcMain.on("nation:store-set", (_e, key, value) => { try { store && store.set(String(key), encryptJson(value)); } catch {} });
ipcMain.handle("nation:store-get", (_e, key) => {
  try { const p = store && store.get(String(key)); return p ? decryptJson(p) : null; } catch { return null; }
});

/* external links leave through the OS handler */
ipcMain.on("nation:open-external", (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
