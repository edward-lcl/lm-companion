// Sync: pulls from Learning Mall, diffs against the last run, stores a snapshot for the popup and panel.
import { Moodle, SignedOut, assignmentPath } from './moodle.js';

export const DEFAULT_SETTINGS = {
  windowDays: 14,
  showPanel: false,                 // built-in dashboard panel, off by default
  onlyModules: true,                // hide non-module sites (scholarship pages, school elections) from Due/Missing
  changes: { materials: true, grades: true, feedback: true, deadlines: true, forum: false, announcements: false },
  hiddenCourses: [],
  hiddenItems: [],                  // per-item "hide" (ids from deadline items)
  doneItems: [],                    // per-item "I've handled this" (stays visible elsewhere, leaves Missing/Due)
  studyLog: false,                  // optional: use browser history of Learning Mall pages (needs the history permission)
  refreshMinutes: 60,
  doneAt: {},                       // id -> when it was ticked off (for today's checklist)
  remind: { on: false, morning: true, morningAt: '08:00', before: [24, 2] },   // notifications (optional permission)
  lang: 'auto',                     // 'auto' (follow browser) | 'en' | 'zh'
  layout: null,                     // per surface { popup: [{id,on}], panel: [...] }; null = defaults (see view.js)
};

export async function getSettings(storage) {
  const { settings } = await storage.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}),
           changes: { ...DEFAULT_SETTINGS.changes, ...(settings?.changes || {}) },
           remind: { ...DEFAULT_SETTINGS.remind, ...(settings?.remind || {}) } };
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

// Missing = past due in your own modules and not handled. Moodle's `actionable` flag is false both when
// you already submitted AND when submissions closed / only a group leader can submit, so it can't be
// the test on its own: non-actionable overdue items still show, labelled, unless marked done.
export function classify(deadlines, now = Date.now(), windowDays = 14, settings = {}) {
  const end = now + windowDays * 86400000;
  const hidden = new Set([...(settings.hiddenItems || []), ...(settings.doneItems || [])]);
  const keep = (d) => !hidden.has(d.id) && !(settings.hiddenCourses || []).includes(d.courseId) &&
                      !(settings.onlyModules && !d.code);
  const pool = deadlines.filter(keep);
  const missing = pool.filter((d) => d.overdue && !d.submitted)
    .map((d) => ({ ...d, note: d.actionable ? null : '⚠ Drop-box closed or group-leader-only. Check with your group.' }))
    .sort((a, b) => a.due - b.due);
  const upcoming = pool.filter((d) => !d.submitted && !d.overdue && d.due >= now && d.due <= end).sort((a, b) => a.due - b.due);
  return { missing, upcoming };
}

// Merge course-page due dates into the timeline: catches assignments Moodle's timeline leaves out.
export function mergeCourseDeadlines(timeline, courseWork, now = Date.now()) {
  // Prefer module URL identity; names are only a legacy fallback when no URL exists.
  const extra = [];
  for (const w of courseWork) {
    if (!w.due || w.type !== 'assign' || w.completion === 'done') continue;
    if (w.due < now - 7 * 86400000) continue;   // old course-page dates: unknown submission state, don't nag
    if (timeline.some((d) => d.courseId === w.courseId &&
      (assignmentPath(d.url) && assignmentPath(w.url) ? assignmentPath(d.url) === assignmentPath(w.url) : norm(d.name) === norm(w.name)))) continue;
    extra.push({ id: `assign-cm:${w.id}`, name: w.name, type: 'assign', due: w.due, courseId: w.courseId, course: w.course,
                 code: w.code, overdue: w.due < now, action: null, actionable: false, url: w.url, source: 'course page' });
  }
  return [...timeline, ...extra];
}
const norm = (s) => String(s || '').toLowerCase().replace(/&amp;/g, '&').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Engagement: per module, released material you haven't opened. Evidence: Moodle's own Done/To do
// marks, plus (optional) this browser's visit history. Items Moodle doesn't track and that have no
// history evidence are "unknown", never counted as unopened.
export function engagement(courseWork, visits = null, now = Date.now()) {
  const out = {};
  for (const w of courseWork) {
    if (!w.code || !['resource', 'folder', 'page', 'url', 'book', 'lesson'].includes(w.type)) continue;
    const m = (out[w.code] ||= { code: w.code, courseId: w.courseId, released: 0, opened: 0, unknown: 0, unopened: [], lastVisit: null });
    m.released++;
    const v = visits?.[w.id];
    if (w.completion === 'done' || v) m.opened++;
    else if (w.completion === 'todo' || visits) m.unopened.push({ id: w.id, name: w.name, url: w.url, firstSeen: w.firstSeen || null });
    else m.unknown++;
    if (v && (!m.lastVisit || v > m.lastVisit)) m.lastVisit = v;
  }
  for (const m of Object.values(out)) m.unopened.sort((a, b) => (a.firstSeen || 0) - (b.firstSeen || 0));
  return Object.values(out).sort((a, b) => b.unopened.length - a.unopened.length);
}

// Bounded last-known records, keyed by source ID (never by assignment name).
export function reconcileAssignments(previous = [], active = [], statuses = {}, now = Date.now(), feedOK = true) {
  const records = new Map(previous.filter((d) => d.type === 'assign' &&
    now - (d.lastSeenAt || d.due || 0) <= 90 * 86400000).map((d) => [d.id, { ...d,
      feedState: feedOK ? 'not-in-active-feed' : d.feedState }]));
  for (const d of active.filter((d) => d.type === 'assign')) {
    const same = records.get(d.id) || [...records.values()].find((p) => p.courseId === d.courseId &&
      assignmentPath(p.url) && assignmentPath(p.url) === assignmentPath(d.url));
    const id = same?.id || d.id;
    records.set(id, { ...same, ...d, id, lastSeenAt: now, feedState: 'active' });
  }
  for (const d of records.values()) {
    const evidence = statuses[d.id];
    if (evidence) {
      d.statusCheckedAt = now;
      // Unknown/new markup cannot retract prior positive evidence. Explicit draft/new can.
      if (evidence.sourceStatus !== 'unknown') {
        d.sourceStatus = evidence.sourceStatus;
        d.submitted = evidence.sourceStatus === 'submitted';
        if (d.submitted) d.firstObservedSubmittedAt ||= now;
      }
    }
    d.sourceStatus ||= 'unknown';
    d.submitted = d.sourceStatus === 'submitted';
  }
  return [...records.values()].sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0)).slice(0, 300);
}

export async function sync({ storage, parseHTML, parse, history, fetchImpl = (...a) => fetch(...a), now = Date.now() }) {
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
  const courseWork = [];
  const firstSeen = prev?.firstSeen || {};
  for (const c of modules) {
    const items = await safe(`course ${c.code}`, () => m.materials(c.id), null);
    if (items) for (const it of items) {
      const key = `${c.id}:${it.id}`;
      firstSeen[key] ||= now;
      courseWork.push({ ...it, courseId: c.id, course: c.name, code: c.code, firstSeen: prev ? firstSeen[key] : null });
      if (!['assign', 'quiz'].includes(it.type)) materials.push({ key, name: it.name, code: c.code, course: c.name, url: it.url });
    }
    else for (const k of prev?.materialIds || []) if (k.startsWith(`${c.id}:`)) materials.push({ key: k });  // keep old ids so a failed read doesn't fake "new"
  }
  deadlines = mergeCourseDeadlines(deadlines, courseWork, now);
  // Seed from the previous active snapshot on upgrade. Failed feed reads are not disappearances.
  const feedOK = !errors.some((e) => e.startsWith('deadlines:') || e.startsWith('course '));
  const previousAssignments = prev?.assignmentHistory || (prev?.deadlines || []).map((d) => ({ ...d, lastSeenAt: prev.at }));
  let assignmentHistory = reconcileAssignments(previousAssignments, deadlines, {}, now, feedOK);
  // Bootstrap recent course-only assignments even when completion removed them from the feed.
  // A course completion tick is discovery, NOT submission evidence.
  for (const w of courseWork) {
    if (w.type !== 'assign' || !w.due || w.due < now - 90 * 86400000 || !assignmentPath(w.url)) continue;
    if (assignmentHistory.some((d) => d.courseId === w.courseId && assignmentPath(d.url) === assignmentPath(w.url))) continue;
    assignmentHistory.push({ ...w, id: `assign-cm:${w.id}`, lastSeenAt: now,
      feedState: 'not-in-active-feed', sourceStatus: 'unknown', submitted: false });
  }
  assignmentHistory = reconcileAssignments(assignmentHistory, [], {}, now, false);
  const statuses = {};
  const candidates = assignmentHistory.filter((d) => assignmentPath(d.url))
    .sort((a, b) => (a.statusAttemptedAt || 0) - (b.statusAttemptedAt || 0)).slice(0, 12);
  for (const d of candidates) {
    d.statusAttemptedAt = now; // rotate even failed reads; never starve the rest
    try { statuses[d.id] = await m.assignmentStatus(d.url); }
    catch (e) {
      if (e instanceof SignedOut) {
        await storage.set({ status: { state: 'signed_out', at: now } });
        return { state: 'signed_out' };
      }
      errors.push(`assignment ${d.id}: ${e.what || e.message}`);
    }
  }
  assignmentHistory = reconcileAssignments(assignmentHistory, [], statuses, now, false);
  const byId = new Map(assignmentHistory.map((d) => [d.id, d]));
  deadlines = deadlines.map((d) => {
    const known = byId.get(d.id) || assignmentHistory.find((p) => p.courseId === d.courseId &&
      assignmentPath(p.url) && assignmentPath(p.url) === assignmentPath(d.url));
    return known ? { ...d, id: known.id, submitted: known.submitted === true } : d;
  });
  const visits = settings.studyLog && history ? await safe('study log', () => history(), null) : null;
  // An empty history with study log on means the log can't see anything yet: treat as no evidence.
  const evidence = visits && Object.keys(visits).length ? visits : null;
  if (!settings.changes.materials) materials.length = 0;
  const cur = { courses, deadlines, grades, materials, notifications };
  const fresh = diff(prev, cur);
  const { changes: older = [] } = await storage.get('changes');
  const merged = [...fresh.map((c) => ({ ...c, seenAt: now })), ...older].slice(0, 200);
  const snapshot = {
    at: now, courses, deadlines, assignmentHistory, grades, firstSeen,
    engagement: engagement(courseWork, evidence, now),
    studyLog: settings.studyLog ? { visitsMatched: visits ? Object.keys(visits).length : 0, permission: visits !== null } : null,
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
