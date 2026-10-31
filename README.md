# Pocket Protocol exhibition kiosk

Starr Luxury Winter Installation, Sun 22 Nov 2026. Static, dependency-free (vanilla JS, no CDN). Deploy the folder as-is to GitHub Pages (HTTPS is required for iOS motion sensors). Nothing has been published or pushed.

## Files
- `index.html` mode picker (Stand helper / Display / Phone sensor / Demo)
- `display.html` iPad / AirPlay screen. `display.html?demo=1` = offline demo (no network at all, for the website link). Also `?room=ABCD`, `?dur=60`
- `sensor.html` phone page. `?room=ABCD` (the QR carries it)
- `operator.html` 8-step wizard (`?room=`, `?step=` also accepted). Fail-safe "Switch to Demo mode" button on every step, Troubleshooting drawer on every step
- `sitter.html` printable A5 sitter card (same card renders inside operator step 5)
- `sw.js` service worker (display, demo, operator, sitter card work offline after first load)
- `css/` kiosk.css (Design Language v1 tokens), display.css, operator.css, card.css
- `js/` config, analysis (metrics + spike detection + synthetic traces), qr (inline QR encoder), transport (Supabase Realtime broadcast), display, sensor, operator, card

## Run
`cd pocket-kiosk && python3 -m http.server 8765`, open http://127.0.0.1:8765/. On the day: open `operator.html` on the helper's device and follow the steps. Phones need the HTTPS (deployed) URL for motion sensors; a local server only works for desktop testing.

## How it works
- Phone -> display over Supabase Realtime BROADCAST only (no tables, nothing written). Room = random 4 characters (no 0/O/1/I). Phone batches ~10 messages/s. Messages: `hello`, `ping`, `start`, `s` (batch of `[t,ax,ay,az,gx,gy,gz]`), `stop`, `end`, `reset`, `mode` (`test`, `demo`, `dur`), and the reserved `{type:"rein", l, r, unit:"kg", t}` (rein panel appears only when one arrives, hides after 3 s of silence).
- Status pill: Connected / Waiting for phone / Offline (Demo mode in demo). Reconnects with back-off (1,2,4,8 s) and immediately on `online`.
- Shown: sway (side tilt, degrees, 5th-95th percentile range), symmetry (percent match of the two sides), tempo/regularity, steadiness events. No OBI, weight distribution, diagnosis or clinical claim. Disclaimer shown on display, phone, index and card.
- Spike logic: **the Lovable PocketProtocol project contains no detection code** (its `telemetry.ts` only buffers raw `{t,ax,ay,az,gx,gy,gz}`; `capture.tsx` uploads them). The detection lives in the sibling Sovereign Eye repo (`telemetry.server.ts`, `detectPelvicStaticSpikes`); that is what `js/analysis.js` ports: rolling variance of accel magnitude, 0.5 s window, threshold = 2.5 x whole-session variance, adjacent windows collapse to the peak. One deliberate addition: an absolute floor of 0.5 (m/s2)^2 so a still, noise-only session cannot flag itself (`minVar:0` restores the original). A synthetic spike over 5.0-5.5 s is reported at 5.2 s (peak-variance centre); I could not reproduce the quoted 5.45 s because no such fixture exists in either source.
- Demo: loops a steady and an unsteady synthetic trace (30 s each, 10 s results card), SAMPLE chip always visible.
- Privacy: no accounts, analytics, cookies or visitor storage. localStorage keeps only kiosk settings (room code, session length, demo flag). Samples exist in memory only and vanish on reset.

## Decisions and deviations (read these)
- **Supabase project**: the brief said ref `mykrmlrxpefrllbkaqel`; the Lovable source (`src/lib/supabase.ts`, `.env`) says `shmajnwkvfcvtdmgbxks`. I used the source values (`js/config.js`). Swap there if the other is intended. Broadcast works on it (tested live).
- Projects tool was not available in this session, so the Brand CI and Design Language docs were NOT loaded; the tokens in the brief were applied instead. The "ChampionPrideAssets" logo PNGs are not embedded (not provided to this task); the header uses the gold-square eyebrow only. Please check against the Brand CI.
- **Fonts**: OPTIAmway.otf was retrievable from Drive but only as inline base64 through the MCP, which could not be written to disk without re-typing it, so it is not bundled. There is no Brandon Grotesque Light in that Drive folder (only Bold and Black, plus Proxima Nova Light). Fonts fall back via the variables (`Optima`/Palatino/Georgia serif; Century Gothic/Futura sans). `@font-face` uses `local()` so installing the fonts on the iPad works; to bundle, put the .otf files in `fonts/` and add `url(fonts/...)` sources in `css/kiosk.css`.
- "Sovereign Eye" appears once on the end card because the brief asks for the free Sovereign Eye read QR. No other Sovereign System vocabulary, no String Manager, no emojis.
- Left/right wording: pocket side is unknown, so the copy says "one side", never left/right.
- The start of a session is the phone's Start button (display also auto-starts if samples arrive). Display timer then ends it, sends `end` so the phone stops, shows the summary, resets after 20 s. Operator step 4 puts the display in Test mode (no timer, no results card).
- Sitter card art: slots try `art/step-0N.png` then `../pocket-art/step-0N.png`, text-only fallback. Card uses steps 01-04 (change in `js/card.js`). `/home/claude/pocket-art/` did not exist at test time. Missing images show as 404s in the console; harmless. For GitHub Pages copy the PNGs to `pocket-kiosk/art/`.
- `?fake=steady|unsteady|tap` on sensor.html and `?rt=` on any page are test hooks (synthetic stream / alternate realtime URL).

## Tested (headless Chrome via Playwright at 1366x1024, 1024x768, 390x844; the Chrome extension browser cannot reach the sandbox localhost)
Display demo (attract, running, end card), all 8 operator steps + troubleshooting drawer, sensor, index, sitter card: no horizontal scroll, no JS errors (only the expected art 404s). Real Supabase Realtime: throwaway script published fake samples to a random room, display went Waiting -> Connected, drew them, counted 2 spikes, showed the end card and sent `end`. Phone page (fake stream) -> display end to end. Operator self-test saw a tap. Operator Demo button switched the display via broadcast. Service worker: demo and operator load with the network off.
## Not tested
Real iPhone motion sensors / `requestPermission` prompt / Wake Lock on iOS; AirPlay; real Starlink flakiness and long soak; rein rig (only the panel with a fake message); printing the A5 card; the actual brand fonts; deployed GitHub Pages HTTPS; real left-right/axis behaviour with different phone orientations (tilt assumes the phone's x axis is across the body).

## Deploy to kiosk.championpride.com (GitHub Pages)
1. New repo (suggested: ZOSCreative/pocket-kiosk), push this folder's contents to the root of `main`.
2. Repo Settings > Pages > Source: main / root. Custom domain is picked up from the `CNAME` file; tick Enforce HTTPS once the certificate is issued.
3. DNS at the championpride.com host: add `CNAME  kiosk  ->  zoscreative.github.io` (no proxy/orange cloud while the certificate issues).
4. Open https://kiosk.championpride.com/operator.html on the stand tablet; test sensors on a real iPhone.
