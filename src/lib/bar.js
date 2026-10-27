// Menu bar bridge: builds the payload the LM Bar Mac app shows, and syncs ticks both ways.
// Pure (unit-tested); background.js sends it through native messaging to `edu.xjtlu.lmbar`.
import { classify } from './sync.js';
import { eventKind } from './calendar.js';

export const HOST = 'edu.xjtlu.lmbar';

export function buildPayload({ snapshot, status, settings, changes = [], lastSeenAt = 0, lang = 'en', now = Date.now() }) {
  const s = { ...settings, doneItems: [], hiddenItems: settings.hiddenItems || [] };   // the app decides done/not-done itself
  const { missing, upcoming } = classify(snapshot?.deadlines || [], now, 30, s);
  const done = new Set(settings.doneItems || []);
  const items = [...missing, ...upcoming].map((d) => ({
    id: d.id, name: d.name, code: d.code || null, course: d.course || null, due: d.due, url: d.url || null,
    kind: eventKind(d), overdue: !!d.overdue, closedNote: d.overdue && d.actionable === false ? true : null,
    action: d.action && d.actionable !== false ? d.action : null,
  }));
  // Ticked in the browser without a timestamp (older "mark done"): treat as ticked at sync time.
  const doneAt = {};
  for (const id of done) doneAt[id] = settings.doneAt?.[id] ?? (snapshot?.at || now);
  const catchup = (snapshot?.engagement || [])
    .filter((m) => m.unopened?.length && !(settings.hiddenCourses || []).includes(m.courseId))
    .map((m) => ({ code: m.code, n: m.unopened.length, url: `https://core.xjtlu.edu.cn/course/view.php?id=${m.courseId}` }))
    .sort((a, b) => b.n - a.n);
  const completion = (snapshot?.courses || []).filter((c) => c.code)
    .map((c) => ({ code: c.code, pct: c.progress ?? null, url: c.url || null }));
  return {
    v: 1, at: snapshot?.at || 0, sentAt: now, status: status?.state || 'ok', lang,
    windowDays: settings.windowDays || 14, items, catchup, completion, doneAt,
    unseenChanges: changes.filter((c) => c.at > lastSeenAt).length,
  };
}

// Menu-bar marks -> extension settings, last write wins against the browser's own ticks.
export function mergeMarks(settings, marks = {}) {
  const doneAt = { ...(settings.doneAt || {}) };
  let doneItems = new Set(settings.doneItems || []);
  let changed = false;
  for (const [id, m] of Object.entries(marks)) {
    const browserAt = doneAt[id] ?? (doneItems.has(id) ? 0 : -1);
    if (m.at <= browserAt) continue;
    if (m.done && !doneItems.has(id)) { doneItems.add(id); doneAt[id] = m.at; changed = true; }
    if (!m.done && doneItems.has(id)) { doneItems.delete(id); delete doneAt[id]; changed = true; }
  }
  return { changed, settings: { ...settings, doneItems: [...doneItems], doneAt } };
}
