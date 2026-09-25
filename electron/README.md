# 663Nation — desktop shell

Frameless Electron 28 wrapper around the renderer build in `../dist`.

## Run it

```bash
# 1. build the renderer (repo root)
npm install
npm run build

# 2. launch the desktop app
cd electron
npm install
npm start
```

## Architecture

| Concern            | Where                                             |
| ------------------ | ------------------------------------------------- |
| Window chrome      | Custom titlebar in the renderer; `frame: false`   |
| Tab contents       | `<webview partition="persist:663nation">` (iframe in the web build) |
| IPC                | preload `contextBridge` only (`contextIsolation: true`, `nodeIntegration: false`) |
| Persistence        | `electron-store` vault, AES-256-GCM encrypted via Node `crypto` (mirrored from localStorage) |
| Blocklists         | `../public/security/{trackers,miners,phishing}.json` |
| Crypto             | Node `crypto` — vault cipher + `nation.sha256` bridge |

`will-navigate` is blocked on the shell window — only webview contents navigate.
`window.open` events are denied and re-routed to the renderer as new tabs.
