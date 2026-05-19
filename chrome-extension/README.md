# StriveAI Focus - Chrome Extension

This extension opens the configured StriveAI site and mirrors the current session state into the popup.

## URL mode

Edit [`config.js`](./config.js) to switch the target site:

- `STRIVEAI_EXTENSION_ENV = 'local'` opens `http://localhost:3000`
- `STRIVEAI_EXTENSION_ENV = 'production'` opens `https://example.com`

`https://example.com` is a temporary placeholder. Replace it with the real production domain when SSL and the final domain are ready.

## Install

1. Open Chrome and go to `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select this `chrome-extension/` folder

## Files

- `manifest.json` - extension permissions and scripts
- `config.js` - single source of truth for the app URL
- `background.js` - alarms, notifications, and stored session state
- `content.js` - reads `window.__striveAI` from the configured host
- `popup.html` / `popup.js` - popup UI and app opener
