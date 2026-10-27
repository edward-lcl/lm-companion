# LM Companion · LM 学习助手

What's due, what's missing and what changed on XJTLU Learning Mall, in one click. No AI, no account
and no setup: install it, sign in to Learning Mall as usual, and it works.

## What it does
- **Today (今日清单):** a daily checklist of what's overdue, due today and due tomorrow morning.
  Tick things off as you go; ticks reset each day.
- **Reminders (optional):** a morning checklist notification (skipped on days with nothing due) and
  reminders 1 day and 2 hours before each deadline. Times are adjustable. Notifications come from
  your browser; nothing is sent anywhere.
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
- **Countdowns:** anything due within 24 hours shows time left (还剩 5 小时 11 分) instead of a date.
- **Toolbar meter:** the icon fills up as your next deadline gets closer over the week: purple when
  calm, amber within 3 days, red within 24 hours or overdue. It turns grey when you're signed out or
  the data is out of date, so old numbers never look current. (Idea from CodexBar.)
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

### Installing with an AI coding agent (Codex, Claude Code)
Agents can do everything except the final click, because Chrome only lets a person load an unpacked
extension.
1. Download the latest release zip from
   `https://github.com/edward-lcl/lm-companion/releases/latest` and unzip it to a stable folder the
   user won't delete (for example `~/Applications/lm-companion`). Don't use a temp folder: Chrome
   loads the extension from that folder every time.
2. Open `chrome://extensions` for the user and tell them to: turn on **Developer mode** (top right),
   click **Load unpacked**, and pick that folder.
3. Tell them to open Learning Mall and sign in once, then click the toolbar icon. For Chinese, or for
   reminders, they open Settings (⚙): 语言 → 简体中文, 提醒 → 通知.

The extension needs no API keys, passwords or accounts. Don't ask the user for their Learning Mall
password.

This repo is self-contained: nothing else needs to be installed for the extension to work. If the
user also wants their agent to read Learning Mall directly (ask about deadlines or grades in chat),
that is a separate, optional tool: [xjtlu-core-mcp](https://github.com/shanyuzhang/xjtlu-core-mcp),
an MCP server with its own setup. Only install it if they ask for that.

## Develop
```
npm install
npm test                 # parsers + logic; real-page fixtures are optional and stay private
npm run build            # dist/lm-companion-<version>.zip
```
`test/fetch-fixtures.mjs` saves your own Learning Mall pages into `test/fixtures/private/`
(gitignored), so the parsers are tested against real markup without publishing anyone's data.

## Status
v0.6, October 2026. Works end to end in Chrome and Edge against the live site. Not yet in a browser
store. Built by an XJTLU student; not an official university tool.

## Credits
Design informed by [xjtlu-core-mcp](https://github.com/shanyuzhang/xjtlu-core-mcp) (MIT), the
Learning Mall MCP server by Shanyu Zhang, and by open-source Canvas and Moodle extensions.

MIT licence.
