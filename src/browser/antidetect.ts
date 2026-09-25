/**
 * 663Nation — Anti-Detect engine (src/js/antidetect.js equivalent)
 *
 * Generates a UNIQUE but internally-consistent browser fingerprint per tab
 * (or per container, when profile locking is on) and builds the injection
 * payload that the desktop shell runs with
 * `webview.executeJavaScript({ code, runAt: 'document_start' })`
 * — i.e. strictly BEFORE any page script executes.
 *
 * Consistency rules enforced by makeFingerprint():
 *   UA ↔ platform ↔ maxTouchPoints ↔ plugin set ↔ GPU vendor
 *   language ↔ languages[] ↔ timezone
 */

export interface Fingerprint {
  seed: string;
  ua: string;
  browser: "Chrome" | "Firefox" | "Edge";
  platform: string;
  os: "Windows" | "macOS" | "Linux";
  language: string;
  languages: string[];
  timezone: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  plugins: { name: string; filename: string; desc: string }[];
  mimeTypes: { type: string; suffixes: string; desc: string }[];
  screen: { width: number; height: number; availWidth: number; availHeight: number; colorDepth: number };
  webgl: { vendor: string; renderer: string };
  canvasNoise: number;
  audioNoise: number;
  fontSeed: number;
}

/* ── deterministic PRNG (mulberry32 over an FNV-1a seed) ── */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length) % arr.length];

/* ── real-world UA pool ── */
const UA_POOL: { ua: string; browser: Fingerprint["browser"]; os: Fingerprint["os"]; platform: string }[] = [
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", browser: "Chrome", os: "Windows", platform: "Win32" },
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", browser: "Chrome", os: "Windows", platform: "Win32" },
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", browser: "Chrome", os: "macOS", platform: "MacIntel" },
  { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", browser: "Chrome", os: "Linux", platform: "Linux x86_64" },
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86", browser: "Edge", os: "Windows", platform: "Win32" },
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.80", browser: "Edge", os: "macOS", platform: "MacIntel" },
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0", browser: "Firefox", os: "Windows", platform: "Win32" },
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0", browser: "Firefox", os: "macOS", platform: "MacIntel" },
  { ua: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", browser: "Firefox", os: "Linux", platform: "Linux x86_64" },
];

const LANGS: { lang: string; tz: string; extra: string[] }[] = [
  { lang: "en-US", tz: "America/New_York", extra: ["en"] },
  { lang: "en-GB", tz: "Europe/London", extra: ["en"] },
  { lang: "de-DE", tz: "Europe/Berlin", extra: ["de", "en-US", "en"] },
  { lang: "fr-FR", tz: "Europe/Paris", extra: ["fr", "en-US", "en"] },
  { lang: "ru-RU", tz: "Europe/Moscow", extra: ["ru", "en-US", "en"] },
  { lang: "ja-JP", tz: "Asia/Tokyo", extra: ["ja", "en-US", "en"] },
];

const RESOLUTIONS = [
  [1920, 1080], [1366, 768], [1536, 864], [1440, 900], [2560, 1440],
];

const GPUS: Record<Fingerprint["os"], { vendor: string; renderer: string }[]> = {
  Windows: [
    { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { vendor: "Google Inc. (AMD)", renderer: "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  ],
  macOS: [
    { vendor: "Apple Inc.", renderer: "Apple M2" },
    { vendor: "Apple Inc.", renderer: "Apple M3 Pro" },
    { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)" },
  ],
  Linux: [
    { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL 4.6)" },
    { vendor: "Google Inc. (AMD)", renderer: "ANGLE (AMD, AMD Radeon RX 6700 (navi22, LLVM 17.0.6), OpenGL 4.6)" },
    { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.6)" },
  ],
};

const CHROME_PLUGINS = [
  { name: "PDF Viewer", filename: "internal-pdf-viewer", desc: "Portable Document Format" },
  { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", desc: "Portable Document Format" },
  { name: "Chromium PDF Viewer", filename: "internal-pdf-viewer", desc: "Portable Document Format" },
  { name: "Microsoft Edge PDF Viewer", filename: "internal-pdf-viewer", desc: "Portable Document Format" },
  { name: "WebKit built-in PDF", filename: "internal-pdf-viewer", desc: "Portable Document Format" },
];

const MIMES = [
  { type: "application/pdf", suffixes: "pdf", desc: "Portable Document Format" },
  { type: "text/pdf", suffixes: "pdf", desc: "Portable Document Format" },
];

/** Deterministic fingerprint for a seed — same seed ⇒ same identity. */
export function makeFingerprint(seed: string): Fingerprint {
  const r = rng(hashSeed(seed));
  const base = pick(r, UA_POOL);
  const loc = pick(r, LANGS);
  const [sw, sh] = pick(r, RESOLUTIONS);
  const touch = base.os === "Windows" && r() > 0.72 ? 5 : 0; // touch laptops only
  const pluginCount = base.browser === "Firefox" ? 0 : 1 + Math.floor(r() * 3);
  const plugins = base.browser === "Firefox"
    ? []
    : CHROME_PLUGINS.slice(0, pluginCount).map((p) =>
        base.browser === "Edge" && p.name === "Chrome PDF Viewer"
          ? { ...p, name: "Microsoft Edge PDF Viewer" }
          : p
      );

  return {
    seed,
    ua: base.ua,
    browser: base.browser,
    platform: base.platform,
    os: base.os,
    language: loc.lang,
    languages: [loc.lang, ...loc.extra],
    timezone: loc.tz,
    hardwareConcurrency: pick(r, [2, 4, 8, 12, 16]),
    deviceMemory: pick(r, [2, 4, 8, 16]),
    maxTouchPoints: touch,
    plugins,
    mimeTypes: plugins.length ? MIMES : [],
    screen: {
      width: sw,
      height: sh,
      availWidth: sw,
      availHeight: sh - (base.os === "macOS" ? 25 : 40),
      colorDepth: r() > 0.85 ? 32 : 24,
    },
    webgl: pick(r, GPUS[base.os]),
    canvasNoise: Math.floor(r() * 1e9),
    audioNoise: r() * 1e-4,
    fontSeed: Math.floor(r() * 1e9),
  };
}

/** Short human label used in the tab tooltip / settings preview. */
export function fingerprintLabel(fp: Fingerprint): string {
  return `${fp.browser} · ${fp.os} · ${fp.screen.width}×${fp.screen.height} · ${fp.language}`;
}

/**
 * Builds the document_start payload.
 * Everything is defined with non-enumerable getters on the prototype chain
 * so naive `hasOwnProperty` detection doesn't spot the spoof.
 */
export function buildInjection(fp: Fingerprint): string {
  const f = JSON.stringify(fp);
  return `(() => {
  if (window.__663AntiDetect) return; window.__663AntiDetect = true;
  const FP = ${f};
  const def = (obj, prop, value) => {
    try { Object.defineProperty(obj, prop, { get: () => value, configurable: true, enumerable: false }); } catch (e) {}
  };

  /* ── navigator ── */
  def(Navigator.prototype, "userAgent", FP.ua);
  def(Navigator.prototype, "appVersion", FP.ua.replace("Mozilla/", ""));
  def(Navigator.prototype, "platform", FP.platform);
  def(Navigator.prototype, "language", FP.language);
  def(Navigator.prototype, "languages", Object.freeze(FP.languages.slice()));
  def(Navigator.prototype, "hardwareConcurrency", FP.hardwareConcurrency);
  def(Navigator.prototype, "deviceMemory", FP.deviceMemory);
  def(Navigator.prototype, "maxTouchPoints", FP.maxTouchPoints);
  def(Navigator.prototype, "webdriver", false);
  def(Navigator.prototype, "vendor", FP.browser === "Firefox" ? "" : "Google Inc.");
  def(Navigator.prototype, "oscpu", undefined);

  /* plugins + mimeTypes as array-likes with named access */
  const mkList = (items, kind) => {
    const list = Object.create(kind === "plugin" ? PluginArray.prototype : MimeTypeArray.prototype);
    items.forEach((it, i) => {
      const entry = kind === "plugin"
        ? Object.create(Plugin.prototype)
        : Object.create(MimeType.prototype);
      if (kind === "plugin") {
        def(entry, "name", it.name); def(entry, "filename", it.filename); def(entry, "description", it.desc); def(entry, "length", 1);
      } else {
        def(entry, "type", it.type); def(entry, "suffixes", it.suffixes); def(entry, "description", it.desc);
      }
      list[i] = entry;
      list[kind === "plugin" ? it.name : it.type] = entry;
    });
    def(list, "length", items.length);
    list.item = (i) => list[i] || null;
    list.namedItem = (n) => list[n] || null;
    if (kind === "plugin") list.refresh = () => {};
    return list;
  };
  def(Navigator.prototype, "plugins", mkList(FP.plugins, "plugin"));
  def(Navigator.prototype, "mimeTypes", mkList(FP.mimeTypes, "mime"));

  /* userAgentData (Chromium) kept consistent with the UA */
  if (FP.browser !== "Firefox") {
    const major = (FP.ua.match(/Chrome\\/(\\d+)/) || [,"131"])[1];
    def(Navigator.prototype, "userAgentData", {
      brands: [
        { brand: "Chromium", version: major },
        { brand: FP.browser === "Edge" ? "Microsoft Edge" : "Google Chrome", version: major },
        { brand: "Not_A Brand", version: "24" },
      ],
      mobile: false,
      platform: FP.os === "macOS" ? "macOS" : FP.os,
      getHighEntropyValues: () => Promise.resolve({ platform: FP.os === "macOS" ? "macOS" : FP.os, architecture: "x86", bitness: "64" }),
    });
  }

  /* ── screen ── */
  def(Screen.prototype, "width", FP.screen.width);
  def(Screen.prototype, "height", FP.screen.height);
  def(Screen.prototype, "availWidth", FP.screen.availWidth);
  def(Screen.prototype, "availHeight", FP.screen.availHeight);
  def(Screen.prototype, "colorDepth", FP.screen.colorDepth);
  def(Screen.prototype, "pixelDepth", FP.screen.colorDepth);

  /* ── canvas noise (stable per tab, unique across tabs) ── */
  let cn = FP.canvasNoise >>> 0;
  const nrand = () => { cn ^= cn << 13; cn ^= cn >>> 17; cn ^= cn << 5; return (cn >>> 0) / 4294967296; };
  const jitter = (data) => {
    for (let i = 0; i < data.length; i += 4 * 997) {   // sparse touch: imperceptible
      data[i]     = Math.max(0, Math.min(255, data[i]     + (nrand() < .5 ? -1 : 1)));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (nrand() < .5 ? -1 : 1)));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (nrand() < .5 ? -1 : 1)));
    }
    return data;
  };
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...a) {
    const img = origGetImageData.apply(this, a);
    jitter(img.data);
    return img;
  };
  const noisyCopy = (canvas) => {
    try {
      const c = document.createElement("canvas");
      c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(canvas, 0, 0);
      const img = origGetImageData.call(ctx, 0, 0, c.width || 1, c.height || 1);
      jitter(img.data);
      ctx.putImageData(img, 0, 0);
      return c;
    } catch (e) { return canvas; }
  };
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...a) {
    return origToDataURL.apply(noisyCopy(this), a);
  };
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
    return origToBlob.call(noisyCopy(this), cb, ...a);
  };

  /* ── WebGL ── */
  const patchGL = (proto) => {
    if (!proto) return;
    const orig = proto.getParameter;
    proto.getParameter = function (p) {
      if (p === 37445) return FP.webgl.vendor;     // UNMASKED_VENDOR_WEBGL
      if (p === 37446) return FP.webgl.renderer;   // UNMASKED_RENDERER_WEBGL
      if (p === 7936)  return "WebKit";            // VENDOR
      if (p === 7937)  return "WebKit WebGL";      // RENDERER
      return orig.call(this, p);
    };
  };
  patchGL(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  patchGL(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);

  /* ── AudioContext micro-noise ── */
  const patchAudio = (Ctor) => {
    if (!Ctor) return;
    const oc = Ctor.prototype.createOscillator;
    if (oc) Ctor.prototype.createOscillator = function () {
      const osc = oc.apply(this, arguments);
      try { osc.frequency.value = osc.frequency.value * (1 + FP.audioNoise); } catch (e) {}
      return osc;
    };
    const ca = Ctor.prototype.createAnalyser;
    if (ca) Ctor.prototype.createAnalyser = function () {
      const an = ca.apply(this, arguments);
      const gfd = an.getFloatFrequencyData;
      an.getFloatFrequencyData = function (arr) {
        gfd.call(this, arr);
        for (let i = 0; i < arr.length; i += 71) arr[i] += FP.audioNoise;
      };
      return an;
    };
  };
  patchAudio(window.AudioContext); patchAudio(window.OfflineAudioContext); patchAudio(window.webkitAudioContext);

  /* ── fonts: consistent-but-unique availability set ── */
  if (document.fonts && document.fonts.check) {
    let fs = FP.fontSeed >>> 0;
    const fhash = (s) => { let h = fs; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619); } return (h >>> 0) / 4294967296; };
    const COMMON = ["Arial","Helvetica","Times New Roman","Courier New","Verdana","Georgia","Tahoma","Segoe UI","Roboto"];
    const origCheck = document.fonts.check.bind(document.fonts);
    document.fonts.check = function (spec, text) {
      try {
        const fam = String(spec).split(/\\s+/).slice(1).join(" ").replace(/["']/g, "");
        if (COMMON.some((c) => fam.toLowerCase().includes(c.toLowerCase()))) return true;
        return fhash(fam) > 0.55;   // stable per profile
      } catch (e) { return origCheck(spec, text); }
    };
  }

  /* ── timezone ── */
  try {
    const OrigDTF = Intl.DateTimeFormat;
    const Patched = function (...a) {
      const inst = new OrigDTF(...a);
      const ro = inst.resolvedOptions.bind(inst);
      inst.resolvedOptions = () => Object.assign(ro(), { timeZone: FP.timezone, locale: FP.language });
      return inst;
    };
    Patched.prototype = OrigDTF.prototype;
    Patched.supportedLocalesOf = OrigDTF.supportedLocalesOf;
    Intl.DateTimeFormat = Patched;
    const TZ_OFFSETS = { "America/New_York": 300, "Europe/London": 0, "Europe/Berlin": -60, "Europe/Paris": -60, "Europe/Moscow": -180, "Asia/Tokyo": -540 };
    const off = TZ_OFFSETS[FP.timezone];
    if (off !== undefined) Date.prototype.getTimezoneOffset = function () { return off; };
  } catch (e) {}

  console.log("[663Nation] anti-detect profile active:", FP.browser + " / " + FP.os + " / " + FP.language);
})();`;
}
