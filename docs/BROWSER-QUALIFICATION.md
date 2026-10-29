# Browser qualification — LM Companion 0.7.1

Qualification date: **2026-10-29 (UTC+08:00)**. macOS, Apple Silicon.
Base commit: `724e21e961212dd1909d5e1873f63cc8c20cd6ea`, **dirty working tree**.
This qualifies the extension source snapshot, **not** the installed `friend-agenda-06` distribution, signing, updater or clean-Mac installation. Each JSON receipt includes SHA-256 hashes of the 24 staged runtime files. All recorded `src/` hashes matched the working tree when evidence was collected.

## Honest matrix

“Passed” below means only the listed synthetic runtime checks. It does not mean a live school account, browser-store distribution, native app UI or all permission dialogs were qualified.

| Browser | Direct execution | Result and boundary |
|---|---|---|
| Google Chrome stable **156.0.8078.73** | Actual installed binary launched with a fresh profile | **Blocked extension loading**: branded Chrome ignored command-line unpacked loading; `Extensions.loadUnpacked` returned “Method not available”. No stable-Chrome extension runtime pass claimed. Manual Developer mode → Load unpacked remains to be checked in a disposable profile. |
| Chrome for Testing **156.0.8078.73** | Official Google testing binary, real headless process | **Passed** extension/background, popup/options EN/ZH, settings, synthetic dashboard panel, reminder planner and framed mock-native bridge/reconnect. This is direct testing-build evidence, not a substitute for stable Chrome acceptance. |
| Microsoft Edge **156.0.4314.50** | Actual Edge app extracted from Microsoft's public PKG; installer never executed | **Passed** the same checks as Chrome for Testing, including dashboard panel and framed mock-native bridge. Not inferred from Chromium. |
| Brave **1.98.62**, Chromium **156.0.8078.74** | Actual Brave app copied from official public DMG | **Partial / not reliably qualified**: one fresh standalone run passed extension load, settings, EN/ZH DOM and reminder planner. Later fresh launches timed out before automation attached, both with and without the mock-native variant. Native bridge and dashboard panel remain blocked; the earlier pass is retained, not promoted to a full pass. Root cause of repeated startup timeouts is not established. |
| Firefox **157.0** | Actual installed Firefox, fresh profile **and disposable HOME** | **Passed** temporary add-on loading, background, popup/options EN/ZH, settings, reminder planner, real host-permission denial and framed mock-native bridge/reconnect. Dashboard content-script injection was not exercised in Gecko. |
| Zen **1.23.3b** | Actual installed Zen, fresh profile and disposable HOME | **Passed** the same scoped Gecko checks. This is direct Zen execution, not inferred from Firefox. Dashboard content-script injection remains untested. |
| Safari **27.0.1** | Installed version inventoried; extension not launched | **Unsupported**: no Safari Web Extension wrapper/app-extension packaging exists here. Chromium/Gecko ZIPs are not Safari support. Needs genuine packaging, entitlement/signing/distribution work and Safari runtime testing before any support claim. |

Other Chromium or Gecko derivatives are only **family-expected**, never directly qualified by these receipts.

## What the runnable qualification asserts

`test/browser-qualification.mjs` stages production `src/`, `icons/` and a family-specific manifest in a new scratch directory. It uses no saved user profile, cookies, passwords or private school fixtures. It routes browser network traffic through a non-listening local proxy; the Chromium dashboard is fulfilled by an explicit synthetic HTML response, not fetched from school.

- A newly launched real browser loads the extension and its production background responds to `settings_get`.
- Native permission is absent in the normal run; standalone remains usable.
- Notification/history enable attempts return `permission_required` without granting anything.
- A browser settings write survives readback; a stale revision returns `conflict`.
- Production options language change handlers persist English/Chinese across page reloads; the actual popup contains the synthetic assignment and correct document language.
- Chromium content scripts import their production modules and render the fixture assignment into a synthetic `/my/` dashboard.
- The production reminder planner, given synthetic data, plans one reminder and suppresses its already-sent key. **No OS notification delivery is claimed.**
- Firefox/Zen origin removal really causes `refresh` to return `needs_access`, not `signed_out`. Chromium refuses API removal of a required origin, so its denied-access screenshot uses a **status fixture only**.
- Optional `LMC_MOCK_NATIVE=1` moves `nativeMessaging` from optional to required **in the disposable test manifest only**. No installed extension permission is approved or modified. A Python test host is registered only under the temporary profile/HOME. Actual browser native-messaging framing carries `push`, `watch`, reverse `settings_set` and correlated `settings_result`; the host deliberately closes the watch connection and a subsequent production `bar_push` reconnects. Settings are read back as `refreshMinutes: 30` from browser storage and the framed receipt. This tests reconnect-on-next-push, not minute-alarm timing or service-worker eviction.
- The mock is intentionally not the shipped native host. Separate `settings-wire.mjs` and `refresh-wire.mjs` ran against `../lm-bar/.build/debug/lmbar-host`, with a disposable HOME, and passed framed transport/correlation/readback/error/EOF checks. Those are **Node-to-host integration checks**, not proof of the installed app or browser-to-production-host integration.

Chromium page exceptions are collected and asserted empty. Gecko uses actual DOM and message assertions but does **not** claim an exhaustive browser-console audit. Settings persistence here means reload, not a browser quit/restart durability test. Live sign-in, real Moodle fetch accuracy, actual reminder display, native app settings UI, clean-Mac Gatekeeper, signed permanent Firefox installation and updates remain outside this qualification.

## Reproduce

These are **developer test dependencies**, not recipient dependencies: Node, `playwright-core` for Chromium, `selenium-webdriver` plus `geckodriver` for Firefox/Zen; Python 3 for the explicit mock-native variant. LM Companion itself does not require Hermes, Homebrew, Python or Node.

From the extension repository, choose a disposable scratch directory and an existing compatible browser binary:

```sh
# On this host the task scratch directory was used. Else choose your own scratch location.
export TMPDIR="$HOME/.hermes/cache/scratch"
export PLAYWRIGHT_CORE=/absolute/path/to/playwright-core/index.mjs

BROWSER=chrome-testing BROWSER_BINARY='/absolute/path/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node test/browser-qualification.mjs
BROWSER=edge BROWSER_BINARY='/absolute/path/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' node test/browser-qualification.mjs
BROWSER=brave BROWSER_BINARY='/absolute/path/Brave Browser.app/Contents/MacOS/Brave Browser' node test/browser-qualification.mjs
BROWSER=firefox node test/browser-qualification.mjs
BROWSER=zen node test/browser-qualification.mjs

# Same browser commands with this environment prefix exercise framed native transport:
LMC_MOCK_NATIVE=1 BROWSER=firefox node test/browser-qualification.mjs

# Explicitly attempted, currently blocked by branded Chrome's unpacked loading policy:
BROWSER=chrome node test/browser-qualification.mjs

# Never opens test/fixtures/private:
node test/run-synthetic-unit.mjs

# Requires an already-built lm-bar debug host; never touches the installed host/settings:
node test/settings-wire.mjs
node test/refresh-wire.mjs
```

`LMC_SCRATCH` overrides scratch location; `LMC_EVIDENCE` selects an output directory. Each run prints its evidence directory and writes `result.json` plus screenshots. Temporary browser profiles/HOMEs are removed by the current harness after closure; staged source and synthetic receipts remain. Use an external timeout if adapting the harness to a browser that cannot quit. Do not point this harness at real browser profiles or registered live native hosts.

Firefox/Zen automation uses geckodriver's `--allow-system-access` solely to open the staged extension pages in its disposable browser. Modern Gecko rejects normal WebDriver navigation to `moz-extension:` URLs. Installed Firefox initially exited with “Could not find profile folder”; giving the child a disposable HOME as well as a fresh profile resolved startup. No live Firefox profile/configuration was changed.

### Public browser artifacts used

- Google Chrome for Testing: `https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.73/mac-arm64/chrome-mac-arm64.zip`, discovered from Google's `last-known-good-versions-with-downloads.json`.
- Edge: `https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/78eb886e-d4b1-4efe-a623-075a0e576c65/MicrosoftEdge-156.0.4314.50.pkg`, discovered from `https://edgeupdates.microsoft.com/api/products?view=enterprise`. Used `pkgutil --expand-full`, never `installer`.
- Brave: `https://github.com/brave/brave-browser/releases/download/v1.98.62/Brave-Browser-arm64.dmg`. Mounted read-only, copied app to scratch, unmounted.

No package-manager/browser runtime installation, enrollment, paid download, quarantine removal, store submission or publication occurred.

## Evidence and review

Receipts and representative production UI captures are in [`evidence/browser-qualification/`](evidence/browser-qualification/):

- `chrome-stable-blocked.json`, `chrome-testing.json`, `edge.json`, `firefox.json`, `zen.json`.
- `brave-standalone.json` preserves the successful direct run; `brave-repeat-blocked.json` preserves a later standalone launch failure. It must not be omitted when interpreting Brave status.
- `synthetic-unit.txt`: **49 passed, 5 skipped, 0 failed** (private-fixture cases deliberately unavailable).
- `settings-wire.txt`, `refresh-wire.txt`: successful isolated real-host transport results.
- `popup-en.png`, `popup-zh.png`, `options-en.png`, `options-zh.png`, `panel-zh.png`: production UI with visibly synthetic task data. English/Chinese popup and options captures were visually inspected; no concrete clipping/overlap defect was found. The panel fixture lacks the real Moodle page's surrounding styling, so it is DOM/import evidence rather than full site visual acceptance.

An initial direct `node --test test/*.test.mjs` invocation also ran the existing local private-fixture unit cases (54 passed); that was outside the requested synthetic-only boundary and is **not used as qualification evidence**. No fixture contents or cookies were copied into these artifacts. The accepted unit receipt is the later isolated-source runner: 49 passed and all five private-fixture cases skipped. All browser runs used synthetic data and no live school cookies.

No production browser bug was proven in this scope, so no speculative production fix was made. Changes are test harnesses, mock transport, documentation and evidence. Existing uncommitted feature work was preserved.

## Follow-up: frozen production host and full browser restart

`test/browser-production-host.mjs` now directly exercises **Chrome for Testing 156.0.8078.73 → the precompiled production host from `friend-cohesive-07` PRELIMINARY**, not the Python mock. The frozen package's extension runtime is copied unchanged; only the disposable manifest moves `nativeMessaging` to required. This does **not** qualify the release's optional-permission grant UI. The receipt inventories 25 original package files, the modified manifest hash and host SHA-256 `0f8c1fc6b62bacf94306ff14c7fb75ea5ad377c105bfabdcd3ae24ff9aff8bf8`.

Verified in an isolated HOME/profile with external traffic sent to a non-listening proxy:

- Real browser native push writes the synthetic item to the production host's isolated payload store.
- Production watch delivers a native settings request; correlated receipt and browser storage both confirm the change.
- Terminating only this run's production watch process and pushing again reconnects with a new PID.
- Fully closing the browser closes the native port; the watch process exits on EOF.
- Relaunching the **same** disposable profile preserves settings, language, completion ticks and snapshot. The bridge reconnects; payload `at` remains the original source time while `sentAt` advances. Reconnection is not misrepresented as a fresh source read.

Receipt: [`chrome-testing-production-host.json`](evidence/browser-qualification/chrome-testing-production-host.json). An initial harness request used an incomplete native settings schema and correctly received no receipt; its failed run is retained as `production-host-invalid-fixture-request.json`. The harness was corrected to supply the full `BrowserPreferences` schema; no production feature changed.

Reproduce with `LMC_SCRATCH` set explicitly to a disposable scratch directory, `PLAYWRIGHT_CORE` to the developer dependency, `LMC_PACKAGE` to the frozen `Payload` directory, and `BROWSER_BINARY` to Chrome for Testing, then run `node test/browser-production-host.mjs`. Profiles/HOME are retained under that run's scratch directory for inspection; browser and host processes are closed. Never use a real profile or a global native-host manifest.

### Regular Chrome remains an explicit gate

A new isolated regular Chrome **156.0.8078.73** instance reached `chrome://extensions/`, toggled Developer mode through the real page UI, and invoked **Load unpacked**. Native directory selection could not be completed: the desktop tool found no matching Chrome window (its window listing exposed only Terminal), and a PID-scoped System Events inspection timed out. The dedicated CDP endpoint confirmed **zero extension service workers**; the disposable Chrome instance was then closed through `Browser.close`. No regular-Chrome runtime pass is claimed. Optional `nativeMessaging` consent was neither requested nor granted.

Still open: regular-Chrome native picker/install and owner-approved optional permission UI; the actual LM Bar application UI/restart; live source fetch advancement and native rendered freshness. The passing checks above establish production **host** lifecycle and browser restart durability, not native application lifecycle or live-school acceptance.
