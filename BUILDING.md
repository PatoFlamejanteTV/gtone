Building and using this extension without Google services

Overview

This repository contains a browser extension originally built to use Google accounts, Google Nearby, and Google Analytics. The changes in this workspace remove dependencies on Google login and external Google services and replace them with local alternatives so the extension can run fully without Google.

What changed

- `manifest.json` no longer requests Google endpoints or includes Google-specific bundles.
- `js/identity-manager.js` now uses a simple local profile stored in `chrome.storage.local`.
- `js/log-client.js` logs locally and can optionally forward logs to a configurable URL.
- `js/nearby-manager.js` is a lightweight replacement that uses an optional WebSocket signalling server for message relay and always performs a local loopback for publish verification.
- `pages/settings.html` and `js/settings.js` include a small UI so you can set the local display name/avatar and configure optional server URLs.
- `scripts/signaling-server.js` is a minimal example WebSocket server for local testing.

Local testing steps (Windows / PowerShell)

1) Install Node.js (if you want to run the example signaling server) - download from https://nodejs.org/ and install.

2) Run the signaling server (optional):

```powershell
cd "<path-to-repo>\scripts"
npm install ws
node signaling-server.js
```

By default the server will listen on port 8080. You can set PORT environment variable to change it.

3) Load the extension into Chrome/Edge (unpacked):

- Open the browser and navigate to chrome://extensions/ (or edge://extensions/)
- Enable "Developer mode"
- Click "Load unpacked" and select the repository root folder (the folder that contains `manifest.json`).

4) Configure the extension:

- Click the extension icon -> "Options" (or open the options page directly at chrome-extension://<extension-id>/pages/settings.html)
- Enter a display name and optional avatar URL.
- If you started the signaling server, set the Signaling URL to ws://localhost:8080
- (Optional) Set the Log Server URL to forward logs to your own server.

5) Use the extension:

- Use the browser action button to send a "shoutout". If signaling is configured and other clients are connected they will receive it. Otherwise the local loopback will still mark the send as successful.

Notes and limitations

- The signaling server is an example only and is not secured. For production use you'd need authentication, encryption (wss), and rate limiting.
- Avatar URLs are not validated; using remote resources depends on the browser's loading policy.
- Logs are persisted to chrome.storage.local under the key `_localLogs` for easy inspection.

Next steps (suggested)

- Add input validation and nicer UI for the settings page.
- Implement encrypted WebSockets (wss://) and authentication for multi-user scenarios.
- Provide an option to export local logs.

If you want, I can wire up an in-browser peer-to-peer transport using WebRTC for direct client-to-client exchange; tell me if you'd like that and I will implement it.
