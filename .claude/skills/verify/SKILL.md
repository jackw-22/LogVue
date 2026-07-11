---
name: verify
description: Build, launch, and drive LogVue (Electron, WSL2) to verify changes at the real UI — CDP screenshots + DOM probes, scratch archive so the user's real data is never touched.
---

# Verifying LogVue

Electron + React app. Verify at the window, not via tests.

## Gotchas first

- **Use Linux node/npm**: bare `npm` resolves to the Windows one and dies on UNC
  paths. Prefix everything: `PATH="/snap/bin:$PATH" npm run build`.
- **Settings**: the built app (`electron out/main/index.js`) uses
  `~/.config/Electron/settings.json`; `electron-vite dev` uses
  `~/.config/logvue/settings.json` (the user's REAL archive root — don't clobber,
  don't point verification at it; imports/edits would write into their robot data).
- **Don't `pkill -f <pattern>`** with a pattern that appears in your own command
  line — it kills your shell (exit 144). Use `pgrep -f "out/main/index[.]js"` + kill.
- GPU-process errors in the log under WSLg are benign.

## Recipe

1. Seed a scratch archive (sessions = folders with `session.json`, schema in
   `src/shared/types/session.ts`; see `scratchpad/seed.js` pattern from past runs
   or build one from tests/archive.test.ts fixtures).
2. `printf '{"archiveRoot":"<scratch>"}' > ~/.config/Electron/settings.json`
   (delete this file when done).
3. `PATH="/snap/bin:$PATH" npm run build`
4. Launch in background:
   `PATH="/snap/bin:$PATH" ./node_modules/.bin/electron out/main/index.js --remote-debugging-port=9223 --no-sandbox`
5. Drive over CDP with a no-deps Node WebSocket client (`cdp.js`: `eval <expr>` /
   `shot <png>`) — there's no `ws`/pip in this env, so keep the hand-rolled client.
   Click via `document.querySelector(...).click()`; set React inputs via the
   native value setter + `dispatchEvent(new Event('input',{bubbles:true}))`.

## Flows worth driving

- Archive dashboard: filter chips (alliance/type), stripe↔tint, search, Latest jump.
- Tree selection → session details (title/tags/notes editing writes to disk).
- New session dialog → folder appears on disk + in tree.
- Control Hub tab: without a device it shows the "not connected" notice; the log
  table + import/quick-import paths need real ADB hardware — say so if not driven.
