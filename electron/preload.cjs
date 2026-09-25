/**
 * 663Nation — preload
 * The ONLY bridge between the sandboxed renderer and the main process.
 * Also injects the F1 miner guard + F4 WebRTC guard into the main world
 * of every document (internal pages included; webview pages get their
 * copies via main-process executeJavaScript on did-navigate).
 */
const { contextBridge, ipcRenderer, webFrame } = require("electron");

/* main-world guards — run before page scripts */
const GUARDS = `
(() => {
  try {
    const OriginalRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (OriginalRTC) {
      const Guarded = function (config, constraints) {
        if (config && config.iceServers) config.iceServers = [];
        return new OriginalRTC(config, constraints);
      };
      Guarded.prototype = OriginalRTC.prototype;
      window.RTCPeerConnection = Guarded;
    }
    const oi = WebAssembly.instantiate;
    WebAssembly.instantiate = function (bytes, imports) {
      try {
        const head = new TextDecoder().decode(new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0, 4096) : bytes));
        if (/cryptonight|cn_heavy|monero|xmr/i.test(head)) {
          console.warn("[663Nation] WASM miner signature killed");
          return Promise.reject("blocked by 663Nation");
        }
      } catch {}
      return oi.apply(WebAssembly, arguments);
    };
  } catch {}
})();`;
webFrame.executeJavaScript(GUARDS).catch(() => {});

const on = (channel) => (fn) => {
  const handler = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("nation", {
  // window chrome
  minimize: () => ipcRenderer.send("nation:minimize"),
  toggleMaximize: () => ipcRenderer.send("nation:toggle-maximize"),
  close: () => ipcRenderer.send("nation:close"),

  // privacy bridges
  setDoH: (cfg) => ipcRenderer.send("nation:set-doh", cfg),
  setPref: (patch) => ipcRenderer.send("nation:pref", patch),
  onPopupBlocked: on("nation:popup-blocked"),
  onBlocked: on("nation:blocked"),
  onPhishHit: on("nation:phish-hit"),

  // anti-detect (F1) — payload built in the renderer, replayed at document_start
  injectAntiDetect: (tabId, code) => ipcRenderer.send("nation:anti-detect", tabId, code),
  bindTab: (tabId) => ipcRenderer.send("nation:bind-tab", tabId),

  // disposable email (F2) — 1secmail proxied through main (no CORS)
  emailGenerate: () => ipcRenderer.invoke("nation:email-generate"),
  emailCheck: (login, domain) => ipcRenderer.invoke("nation:email-check", login, domain),
  emailRead: (login, domain, id) => ipcRenderer.invoke("nation:email-read", login, domain, id),
  autofillEmail: (code) => ipcRenderer.send("nation:autofill-email", code),

  // utilities
  openExternal: (url) => ipcRenderer.send("nation:open-external", url),
  sha256: (text) => ipcRenderer.invoke("nation:sha256", text),
  storeSet: (key, value) => ipcRenderer.send("nation:store-set", key, value),
  storeGet: (key) => ipcRenderer.invoke("nation:store-get", key),

  // main → renderer tab routing
  onNewTab: on("nation:new-tab"),

  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
});
