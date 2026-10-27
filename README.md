# LM Companion · LM 学习助手

What's due, what's missing and what changed on XJTLU Learning Mall, in one click. No AI, no account
and no setup: install it, sign in to Learning Mall as usual, and it works.

## What it does
- **Missing:** work that is past due and still needs a submission, shown in red with a count on the
  toolbar icon.
- **Due soon:** everything with a Learning Mall due date in the next 7, 14 or 30 days, across all
  modules.
- **What changed:** new materials, grades, feedback and deadline reminders since you last looked. Forum
  posts and announcements are available but off by default. Each kind is a toggle.
- **Next 7 days:** a week strip with each deadline as a coloured chip: assignments, quizzes, and
  exams or mock tests in red. **Add to calendar** downloads an `.ics` file you can import into
  Apple, Google or Outlook Calendar, including deadlines that only appear on course pages.
- **Catch up:** per module, released material you haven't marked done. Turn on the optional study log
  to also count what you've actually opened (reads only Learning Mall pages in this browser's
  history, kept on your device).
- **Course completion:** per-module progress bars.
- **Your layout:** turn any section on or off and reorder them from the popup (the pencil icon) or
  Settings. The popup and the dashboard panel each keep their own layout.
- **中文界面:** follows your browser language, or pick 简体中文 / English in Settings.
- **Dashboard panel (optional):** the same view as a block on your Learning Mall Dashboard. Off by
  default; turn it on in Settings.
- **Honest failures:** if you're signed out or Learning Mall changes, it says so instead of showing an
  empty list.

## Privacy
- Reads Learning Mall with **your own browser login**. It has access to `core.xjtlu.edu.cn` and
  nothing else.
- Everything stays in your browser. No servers, analytics or remote config.
- It never stores your password, and never submits, posts or opens quizzes. It uses three read-only
  Learning Mall functions (course list, timeline, notifications) plus the grade overview and course
  pages.

## Install (developer mode, for now)
1. Download the latest zip from Releases and unzip it, or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load
   unpacked** and pick the folder.
3. Sign in to Learning Mall once. The icon fills in within a minute.

## Develop
```
npm install
npm test                 # parsers + logic; real-page fixtures are optional and stay private
npm run build            # dist/lm-companion-<version>.zip
```
`test/fetch-fixtures.mjs` saves your own Learning Mall pages into `test/fixtures/private/`
(gitignored), so the parsers are tested against real markup without publishing anyone's data.

## Status
v0.1, built 2026-10-27. Works end to end in Chromium against the live site. Not yet in a browser store.
Optional add-on in progress: staying signed in automatically through the OS keychain
(see the `xjtlu-login-helper` prototype).

MIT licence.
