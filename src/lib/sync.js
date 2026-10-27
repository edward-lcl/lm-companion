// Sync: pulls from Learning Mall, diffs against the last run, stores a snapshot for the popup and panel.
import { Moodle, SignedOut } from './moodle.js';

export const DEFAULT_SETTINGS = {
  windowDays: 14,
  showPanel: false,                 // built-in dashboard panel, off by default
  changes: { materials: true, grades: true, feedback: true, deadlines: true, forum: false, announcements: false },
  hiddenCourses: [],
  refreshMinutes: 60,
};

export async function getSettings(storage) {
  const { settings } = await storage.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}),
           changes: { ...DEFAULT_SETTINGS.changes, ...(settings?.changes || {}) } };
}

// Pure diff, unit-tested: previous + current -> change list (kinds the settings can toggle).
export function diff(prev, cur) {
  const changes = [];
  if (!prev) return changes;   // first run: nothing is "new"
  const oldMat = new Set(prev.materialIds || []);
  for (const m of cur.materials) if (!oldMat.has(m.key)) changes.push({ kind: 'materials', title: m.name, course: m.code || m.course, url: m.url });
  const oldGrades = new Map((prev.grades || []).map((g) => [g.courseId, g.grade]));
  for (const g of cur.grades) {
    if (oldGrades.has(g.courseId) && oldGrades.get(g.courseId) !== g.grade && g.grade)
      changes.push({ kind: 'grades', title: `Course total now ${g.grade}`, course: g.course });
  }
  const oldNotes = new Set(prev.notificationIds || []);
  for (const n of cur.notifications) if (!oldNotes.has(n.id)) changes.push({ kind: n.kind, title: n.subject, course: n.course, url: n.url, at: n.at });
  return changes;
}

export function classify(deadlines, now = Date.now(), windowDays = 14) {
  const end = now + windowDays * 86400000;
  const missing = deadlines.filter((d) => d.overdue && d.actionable);
  const upcoming = deadlines.filter((d) => !d.overdue && d.due >= now && d.due <= end).sort((a, b) => a.due - b.due);
  return { missing, upcoming };
}

export async function sync({ storage, parseHTML, parse, fetchImpl = (...a) => fetch(...a), now = Date.now() }) {
  const settings = await getSettings(storage);
  const m = new Moodle({ fetch: fetchImpl, parseHTML, parse });
  const { snapshot: prev } = await storage.get('snapshot');
  const errors = [];
  try {
    await m.connect();
  } catch (e) {
    const state = e instanceof SignedOut ? 'signed_out' : 'site_changed';
    await storage.set({ status: { state, at: now, detail: e.what || e.message } });
    return { state };
  }
  const safe = async (label, fn, fallback) => {
    try { return await fn(); } catch (e) {
      if (e instanceof SignedOut) throw e;
      errors.push(`${label}: ${e.what || e.message}`); return fallback;
    }
  };
  let courses, deadlines, notifications, grades;
  try {
    courses = await safe('courses', () => m.courses(), prev?.courses || []);
    deadlines = await safe('deadlines', () => m.deadlines(Math.max(settings.windowDays, 30)), prev?.deadlines || []);
    notifications = await safe('notifications', () => m.notifications(50), []);
    grades = await safe('grades', () => m.grades(), prev?.grades || []);
  } catch {
    await storage.set({ status: { state: 'signed_out', at: now } });
    return { state: 'signed_out' };
  }
  const modules = courses.filter((c) => c.code && !settings.hiddenCourses.includes(c.id));
  const materials = [];
  if (settings.changes.materials) {
    for (const c of modules) {
      const items = await safe(`materials ${c.code}`, () => m.materials(c.id), null);
      if (items) for (const it of items) materials.push({ key: `${c.id}:${it.id}`, name: it.name, code: c.code, course: c.name, url: it.url });
      else for (const k of prev?.materialIds || []) if (k.startsWith(`${c.id}:`)) materials.push({ key: k });  // keep old ids so a failed read doesn't fake "new"
    }
  }
  const cur = { courses, deadlines, grades, materials, notifications };
  const fresh = diff(prev, cur);
  const { changes: older = [] } = await storage.get('changes');
  const merged = [...fresh.map((c) => ({ ...c, seenAt: now })), ...older].slice(0, 200);
  const snapshot = {
    at: now, courses, deadlines, grades,
    materialIds: materials.length ? materials.map((x) => x.key) : (prev?.materialIds || []),
    notificationIds: [...new Set([...notifications.map((n) => n.id), ...(prev?.notificationIds || [])])].slice(0, 500),
  };
  await storage.set({ snapshot, changes: merged,
    status: { state: errors.length ? 'partial' : 'ok', at: now, errors } });
  return { state: 'ok', newChanges: fresh.length, errors };
}

export function visibleChanges(changes, settings, lastSeenAt = 0) {
  return changes.filter((c) => settings.changes[c.kind] !== false && settings.changes[c.kind] !== undefined)
    .map((c) => ({ ...c, unseen: c.seenAt > lastSeenAt }));
}
