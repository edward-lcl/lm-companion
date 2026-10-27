// Daily checklist + reminders. Pure functions (unit-tested); background.js turns them into
// chrome.alarms and chrome.notifications.
import { classify } from './sync.js';

const DAY = 86400000;
const startOfDay = (ms) => new Date(ms).setHours(0, 0, 0, 0);

// Today's checklist: everything overdue (still to handle), due today, and due before noon tomorrow
// (so a 09:00 deadline shows up the evening before). Items ticked off stay listed as done for the day.
export function checklist(deadlines, now = Date.now(), settings = {}) {
  const lookahead = new Date(startOfDay(now) + DAY).setHours(12, 0, 0, 0);
  const open = classify(deadlines, now, 2, settings);
  const todo = [...open.missing, ...open.upcoming.filter((d) => d.due <= lookahead)];
  const doneToday = new Set(Object.entries(settings.doneAt || {}).filter(([, at]) => at >= startOfDay(now)).map(([id]) => id));
  const done = deadlines.filter((d) => doneToday.has(d.id) && d.due <= lookahead && d.due >= startOfDay(now) - 30 * DAY);
  return { todo, done, total: todo.length + done.length };
}

// Next time-of-day ("HH:MM", local) strictly after now.
export function nextAt(hhmm, now = Date.now()) {
  const [h, m] = String(hhmm || '08:00').split(':').map(Number);
  const t = new Date(now); t.setHours(h, m || 0, 0, 0);
  return t.getTime() <= now ? t.getTime() + DAY : t.getTime();
}

// Per-deadline reminders: `before` is a list of hours (e.g. [24, 2]). Returns future reminders only,
// skipping ones already sent (keys in `sent`). Key is stable so re-planning never duplicates.
export function plan(deadlines, now = Date.now(), settings = {}, sent = {}) {
  if (!settings.remind?.on) return [];
  const { upcoming } = classify(deadlines, now, 3, settings);
  const out = [];
  for (const d of upcoming) for (const h of settings.remind.before || []) {
    const when = d.due - h * 3600000;
    const key = `${d.id}@${h}`;
    if (when > now - 60000 && !sent[key]) out.push({ key, when: Math.max(when, now + 1000), id: d.id, hours: h });
  }
  return out.sort((a, b) => a.when - b.when);
}

// Morning summary line counts.
export function digest(deadlines, now = Date.now(), settings = {}) {
  const { todo } = checklist(deadlines, now, settings);
  const end = startOfDay(now) + DAY;
  return {
    overdue: todo.filter((d) => d.overdue).length,
    today: todo.filter((d) => !d.overdue && d.due < end).length,
    tomorrowAm: todo.filter((d) => d.due >= end).length,
    items: todo,
  };
}
