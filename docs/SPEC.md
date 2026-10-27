# XJTLU Learning Mall extension: v1 spec (draft, 2026-10-27)

Sources: design/prior-art-canvas.md, design/prior-art-moodle.md, the working prototype in this repo.

## Who it is for
Every XJTLU student who uses Learning Mall in a browser. It has to be useful with no AI, no agent
and no setup beyond installing it. Agents (xjtlu-core-mcp, Campus) plug into it, but it does not
depend on them. That is the version the school could adopt.

## The one job
Know at a glance what is due, what is missing and what changed, and never get kicked out mid-task.

## v1 features (in order)
1. **Due and missing.** A popup and an optional sidebar on Learning Mall that show the coming
   7/14/30 days across all modules, per-course progress, and overdue or not-submitted items. Each
   course and item can be hidden, starred or marked done locally. Users of Tasks for Canvas valued
   this most (per-course progress, weekly window); most of their feature requests asked for more
   control over the list.
2. **What changed.** New materials, new grades and new feedback since you last looked. A badge
   count on the icon.
3. **Clear failure.** If data can't load, say why ("signed out", "Learning Mall changed") and
   offer one click to fix. Never show an empty list that looks like "nothing due".
4. **Stay signed in (opt-in).** The prototype's flow, proven at XJTLU: a one-time keychain setup,
   then the extension refreshes the login silently. Needs a small native helper, so it is an
   optional add-on, not a requirement.

## Not in v1
- AI summaries, chat or study help. These come later as an optional layer.
- Theming or dark mode. Popular elsewhere, but not the job.
- Outlook or email drafting. That is a separate product.
- Anything on quiz, exam or lesson-question pages. The extension does not run there, for academic
  integrity.
- Sending page content to any server. Everything stays in the browser and on the student's computer.

## How it reads Learning Mall
- The student's own logged-in session. The mobile web service is disabled at XJTLU, so token-based
  approaches (Moodesk, moodlenotifier) fail here.
- Primary: Moodle's AJAX endpoint with the session key, limited to the methods already proven at
  XJTLU by xjtlu-core-mcp (course list, `core_calendar_get_action_events_by_timesort`).
- Fallback: page parsing of course and assignment pages for submission and grade status, with a
  test fixture per selector. nitech broke on the Moodle 4.0 page changes; fixtures catch that in CI.
- One data layer behind one interface (ports and adapters), so a site change breaks one adapter,
  not the UI.

## Privacy and permissions
- Host access limited to `core.xjtlu.edu.cn` and `uim.xjtlu.edu.cn`. Never all URLs, never all
  frames. Tasks for Canvas and Better Canvas both broke unrelated sites by running everywhere.
- Permissions: `storage`, plus `nativeMessaging` only for the opt-in login add-on.
- Passwords are never stored in the extension. Only the OS keychain holds them, through the native
  helper. Moodesk keeps the key next to the ciphertext; moodlenotifier puts the password in a URL.
- A plain-language privacy page and a per-feature on/off switch.
- No telemetry, no remote config, no obfuscation. The code that ships is the code in the repo.

## Agent bridge (optional)
The extension and xjtlu-core-mcp share one parsing layer, ideally upstream's client.js/parse.js
(MIT), so the agent and the extension see the same truth. Extension users who also run the MCP get
login refresh for free, which is the point of upstream issue #1.

## Distribution
- Chrome Web Store may be unreachable for students in mainland China (unverified). Plan for Edge
  Add-ons and GitHub Releases from the start, plus Firefox if cheap.
- Build every release in CI from a tagged commit. Tasks for Canvas drifted between repo and store
  and once shipped a broken manifest.
- At least two maintainers before any official or school adoption.

## Where it lives
Proposed to shanyuzhang/xjtlu-core-mcp first (issue #1). If he wants it: a sibling package in his
repo or org, making it the official open-source XJTLU tool. If not: under edward-lcl, MIT, with the
same design.

## Reuse (licence-checked)
- MIT, keep notices: canvas-task-extension's plugin/task model, time-window filter and request
  helper; paladini's Moodle detection, selector fallbacks and privacy-doc template; BGU's due-date
  scraping and its guard against filling password fields; upstream's client.js and parse.js.
- Design only, no code: Better Canvas (AGPL plus a no-redistribution clause), Moodesk (obfuscated,
  unsafe credential handling), moodlenotifier (non-standard licence clause), nitech (MV2, site-specific).

## Open questions for Edward
Resolved 2026-10-27:
1. **Surface: popup by default, built-in panel as a setting.** The popup comes from the toolbar icon
   and works on any page. The panel is an optional block on the Learning Mall dashboard, injected
   only on `/my/`, styled like Moodle's own blocks and collapsible. It is never injected on course,
   quiz or assignment pages. Setting: "Show on Learning Mall dashboard" (off by default).
2. **What changed: toggles.** On by default: new materials, grades, feedback, upcoming and missing
   work. Off by default: forum posts and announcements. Each is a switch in Settings.
3. **Name: "LM Companion"** (working name). It is plain and neutral, and the school could adopt it.
   Chinese: 学习助手 LM Companion.
