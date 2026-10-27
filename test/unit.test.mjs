// Unit tests: parsers against real Learning Mall markup (private fixtures, skipped if absent)
// and pure logic (diff, classify) with synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML as lp } from 'linkedom';
import { sessionInfo, isLoginPage, parseCourseModules, parseGradeOverview, notificationKind, moduleCode, parseDueDate } from '../src/lib/moodle.js';
import { diff, classify, visibleChanges, DEFAULT_SETTINGS, mergeCourseDeadlines, engagement } from '../src/lib/sync.js';

const parseHTML = (h) => lp(h).document;
const P = new URL('./fixtures/private/', import.meta.url);
const fx = (n) => { try { return fs.readFileSync(new URL(n, P), 'utf8'); } catch { return null; } };

test('sessionInfo finds sesskey and userid on a real page', { skip: !fx('my-courses.html') }, () => {
  const s = sessionInfo(fx('my-courses.html'));
  assert.ok(s.sesskey && s.sesskey.length >= 8);
  assert.ok(Number.isInteger(s.userid));
});

test('signed-in dashboard is not a login page', { skip: !fx('my.html') }, () => {
  assert.equal(isLoginPage('https://core.xjtlu.edu.cn/my/', fx('my.html')), false);
});
test('login URL is a login page', () => {
  assert.equal(isLoginPage('https://core.xjtlu.edu.cn/login/index.php', ''), true);
});

test('course modules parse from a real course page', { skip: !fx('course.html') }, () => {
  const items = parseCourseModules(fx('course.html'), parseHTML);
  assert.ok(items.length >= 10, `got ${items.length}`);
  assert.ok(items.every((i) => /^\d+$/.test(i.id) && i.name && i.type));
  assert.ok(items.some((i) => i.type === 'assign'));
});

test('grade overview parses course totals', { skip: !fx('grades.html') }, () => {
  const rows = parseGradeOverview(fx('grades.html'), parseHTML);
  assert.ok(rows.length >= 5, `got ${rows.length}`);
  assert.ok(rows.every((r) => /^\d+$/.test(r.courseId)));
});
test('grade overview without the table reports a site change', () => {
  assert.throws(() => parseGradeOverview('<html><body>nope</body></html>', parseHTML), /site_changed/);
});

test('module codes', () => {
  assert.equal(moduleCode('MTH015-2627-S1 Calculus'), 'MTH015');
  assert.equal(moduleCode('Career Centre'), null);
});

test('notification kinds', () => {
  assert.equal(notificationKind({ component: 'mod_assign', eventtype: 'assign_notification', subject: 'x' }), 'feedback');
  assert.equal(notificationKind({ component: 'mod_assign', eventtype: 'assign_due_soon' }), 'deadlines');
  assert.equal(notificationKind({ component: 'mod_forum', eventtype: 'posts', contexturlname: 'Announcements' }), 'announcements');
  assert.equal(notificationKind({ component: 'mod_forum', eventtype: 'posts', contexturlname: 'Q&A' }), 'forum');
  assert.equal(notificationKind({ component: 'moodle', eventtype: 'newlogin' }), null);
});

test('first run reports no changes', () => {
  assert.deepEqual(diff(null, { materials: [{ key: 'a' }], grades: [], notifications: [] }), []);
});
test('diff finds new materials, changed grades, new notifications', () => {
  const prev = { materialIds: ['1:1'], grades: [{ courseId: '1', grade: '50' }], notificationIds: ['n1'] };
  const cur = { materials: [{ key: '1:1', name: 'old' }, { key: '1:2', name: 'Week 7 slides', code: 'HSS004' }],
                grades: [{ courseId: '1', grade: '60', course: 'MTH015' }],
                notifications: [{ id: 'n1', kind: 'forum' }, { id: 'n2', kind: 'feedback', subject: 'Feedback posted' }] };
  const kinds = diff(prev, cur).map((c) => c.kind).sort();
  assert.deepEqual(kinds, ['feedback', 'grades', 'materials']);
});

test('classify: overdue unsubmitted is missing (with a note if not actionable); window filters upcoming', () => {
  const now = Date.UTC(2026, 9, 27);
  const d = [
    { id: 'a', name: 'late', code: 'MTH015', due: now - 86400000, overdue: true, actionable: true },
    { id: 'b', name: 'late-closed', code: 'EAP048', due: now - 86400000, overdue: true, actionable: false },
    { id: 'c', name: 'scholarship', code: null, due: now - 86400000, overdue: true, actionable: true },
    { id: 'd', name: 'soon', code: 'MTH030', due: now + 2 * 86400000, overdue: false },
    { id: 'e', name: 'far', code: 'MTH030', due: now + 40 * 86400000, overdue: false },
    { id: 'f', name: 'done-by-me', code: 'MTH030', due: now - 3600000, overdue: true, actionable: true },
  ];
  const { missing, upcoming } = classify(d, now, 14, { onlyModules: true, doneItems: ['f'], hiddenItems: [], hiddenCourses: [] });
  assert.deepEqual(missing.map((x) => x.name), ['late', 'late-closed']);
  assert.ok(missing[1].note && !missing[0].note);
  assert.deepEqual(upcoming.map((x) => x.name), ['soon']);
  assert.equal(classify(d, now, 14, { onlyModules: false }).missing.length, 4);
});

test('course-page due dates parse as Beijing time', () => {
  assert.equal(parseDueDate('Opens: Monday, 2 November 2026, 00:00 Due: Sunday, 13 December 2026, 23:59'),
               Date.UTC(2026, 11, 13, 15, 59));
  assert.equal(parseDueDate('Opened: Monday, 19 October 2026'), null);
});

test('course-page assignments missing from the timeline are merged, without duplicates or stale ones', () => {
  const now = Date.UTC(2026, 9, 27);
  const timeline = [{ id: 'assign:1', name: 'Assignment 11 (Deadline: Wednesday 23:59, Dec 2)', courseId: '9', due: now + 1e9 }];
  const work = [
    { id: '1', type: 'assign', name: 'Assignment 11 (Deadline: Wednesday 23:59, Dec 2)', courseId: '9', due: now + 1e9 },
    { id: '2', type: 'assign', name: 'Coursework: Project Portfolio Part 1.', courseId: '9', code: 'IOT001TC', due: now + 4e9 },
    { id: '3', type: 'assign', name: 'Artifact 1', courseId: '9', due: now - 30 * 86400000 },
    { id: '4', type: 'assign', name: 'Done one', courseId: '9', due: now + 1e9, completion: 'done' },
    { id: '5', type: 'resource', name: 'Slides', courseId: '9', due: now + 1e9 },
  ];
  const merged = mergeCourseDeadlines(timeline, work, now);
  assert.deepEqual(merged.map((x) => x.id), ['assign:1', 'assign-cm:2']);
  assert.equal(merged[1].source, 'course page');
});

test('engagement counts unopened released material per module using Done marks and visits', () => {
  const work = [
    { id: '1', code: 'HSS004', courseId: '7', type: 'resource', name: 'Week 1', completion: 'done' },
    { id: '2', code: 'HSS004', courseId: '7', type: 'resource', name: 'Week 2', completion: 'todo' },
    { id: '3', code: 'HSS004', courseId: '7', type: 'folder', name: 'Week 3', completion: null },
    { id: '4', code: 'HSS004', courseId: '7', type: 'assign', name: 'Essay' },
    { id: '5', code: 'MTH015', courseId: '8', type: 'resource', name: 'L1', completion: null },
  ];
  const e = engagement(work, { '3': 1000 });
  const h = e.find((m) => m.code === 'HSS004');
  assert.equal(h.released, 3); assert.equal(h.opened, 2);
  assert.deepEqual(h.unopened.map((u) => u.name), ['Week 2']);
  assert.equal(h.lastVisit, 1000);
  // Without a study log, untracked items are unknown, not unopened.
  const noLog = engagement(work, null).find((m) => m.code === 'HSS004');
  assert.equal(noLog.opened, 1); assert.equal(noLog.unknown, 1);
  assert.deepEqual(noLog.unopened.map((u) => u.name), ['Week 2']);
  assert.equal(engagement(work, null).find((m) => m.code === 'MTH015').unopened.length, 0);
});

test('toggles hide change kinds; forum and announcements off by default', () => {
  const ch = [{ kind: 'forum', seenAt: 2 }, { kind: 'grades', seenAt: 2 }, { kind: 'announcements', seenAt: 1 }];
  const v = visibleChanges(ch, DEFAULT_SETTINGS, 1);
  assert.deepEqual(v.map((x) => x.kind), ['grades']);
  assert.equal(v[0].unseen, true);
});

test('real course page: completion states and due dates are read', { skip: !fx('course.html') }, () => {
  const items = parseCourseModules(fx('course.html'), parseHTML);
  const states = items.map((i) => i.completion);
  assert.ok(states.includes('done') && states.includes('todo'), JSON.stringify(states));
  assert.ok(items.some((i) => i.type === 'assign' && i.due), 'an assignment with a due date');
});

test('layout: defaults, saved order kept, unknown ids dropped, new sections appended', async () => {
  const { resolveLayout, DEFAULT_LAYOUT } = await import('../src/lib/view.js');
  assert.deepEqual(resolveLayout(null, 'popup'), DEFAULT_LAYOUT.popup);
  assert.equal(resolveLayout(null, 'panel').find((x) => x.id === 'completion').on, false);
  const saved = [{ id: 'catchup', on: true }, { id: 'gone', on: true }, { id: 'missing', on: false }];
  const r = resolveLayout(saved, 'popup');
  const ids = r.map((x) => x.id);
  assert.equal(ids[0], 'today', 'new Today section leads');
  assert.equal(ids[1], 'catchup');
  assert.ok(ids.indexOf('catchup') < ids.indexOf('missing'), 'user order kept');
  assert.equal(r.find((x) => x.id === 'missing').on, false);
  assert.ok(!r.some((x) => x.id === 'gone'));
  assert.deepEqual(r.map((x) => x.id).sort(), ['catchup', 'changes', 'completion', 'due', 'missing', 'today', 'week']);
});

test('layout: new section slots in at its default position in old saved layouts', async () => {
  const { resolveLayout } = await import('../src/lib/view.js');
  const old = [{ id: 'missing', on: true }, { id: 'due', on: false }, { id: 'changes', on: true }, { id: 'catchup', on: true }, { id: 'completion', on: true }];
  assert.deepEqual(resolveLayout(old, 'popup').map((x) => x.id), ['today', 'missing', 'week', 'due', 'changes', 'catchup', 'completion']);
});

test('i18n: every English key has a Chinese translation, and placeholders match', async () => {
  const { KEYS, setLang, t } = await import('../src/lib/i18n.js');
  const missingZh = KEYS.en.filter((k) => !KEYS.zh.includes(k));
  assert.deepEqual(missingZh, []);
  for (const k of KEYS.en) {
    setLang('en'); const en = (t(k).match(/\{\w+\}/g) || []);
    setLang('zh'); const zh = (t(k).match(/\{\w+\}/g) || []);
    assert.equal(en.length, 0, `en ${k} left a placeholder`);
    assert.equal(zh.length, 0, `zh ${k} left a placeholder`);
  }
  setLang('zh'); assert.equal(t('overdue_days', { n: 3 }), '逾期 3 天');
  setLang('en'); assert.equal(t('due_title', { n: 14 }), 'Due in the next 14 days');
  assert.equal(setLang('auto') === 'zh' || setLang('auto') === 'en', true);
});

test('calendar: kinds, week buckets, ics', async () => {
  const { eventKind, week, toICS } = await import('../src/lib/calendar.js');
  assert.equal(eventKind({ type: 'assign', name: 'Assignment 3' }), 'assign');
  assert.equal(eventKind({ type: 'quiz', name: 'Week 5 quiz' }), 'quiz');
  assert.equal(eventKind({ type: 'quiz', name: 'Mock Exam 1' }), 'exam');
  assert.equal(eventKind({ type: 'assign', name: 'In-class Test 2' }), 'exam');
  assert.equal(eventKind({ type: 'assign', name: 'Latest submission' }), 'assign');
  assert.equal(eventKind({ type: 'forum', name: 'Discussion' }), 'other');
  const now = new Date(2026, 9, 27, 10).getTime();
  const ds = [{ id: 'a', due: new Date(2026, 9, 27, 23, 59).getTime(), name: 'A' },
              { id: 'b', due: new Date(2026, 9, 29, 9).getTime(), name: 'B' },
              { id: 'c', due: new Date(2026, 10, 9).getTime(), name: 'C' }];
  const w = week(ds, now);
  assert.equal(w.length, 7);
  assert.deepEqual(w.map((d) => d.items.map((x) => x.id).join('')), ['a', '', 'b', '', '', '', '']);
  const ics = toICS([{ id: 'assign:12,3', due: Date.UTC(2026, 9, 28, 15, 59), name: 'Essay; draft, v2', code: 'EAP048', url: 'https://core.xjtlu.edu.cn/mod/assign/view.php?id=1', course: 'EAP' }], Date.UTC(2026, 9, 27));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTEND:20261028T155900Z/);
  assert.match(ics, /SUMMARY:EAP048 Essay\\; draft\\, v2/);
  assert.match(ics, /UID:lmc-assign:123@core.xjtlu.edu.cn/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'lines folded');
});

test('reminders: checklist, plan, nextAt', async () => {
  const { checklist, plan, nextAt, digest } = await import('../src/lib/reminders.js');
  const now = new Date(2026, 9, 27, 20, 0).getTime();          // Tue 20:00
  const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
  const ds = [
    { id: 'late', name: 'Late', code: 'EAP048', due: at(26, 9), overdue: true, actionable: true },
    { id: 'tonight', name: 'Tonight', code: 'MTH030', due: at(27, 23, 59), overdue: false },
    { id: 'tmrAm', name: 'Tomorrow 9am', code: 'MTH015', due: at(28, 9), overdue: false },
    { id: 'tmrPm', name: 'Tomorrow 23:59', code: 'MTH030', due: at(28, 23, 59), overdue: false },
    { id: 'ticked', name: 'Ticked', code: 'HSS004', due: at(27, 22), overdue: false },
  ];
  const settings = { ...DEFAULT_SETTINGS, doneItems: ['ticked'], doneAt: { ticked: at(27, 15) } };
  const c = checklist(ds, now, settings);
  assert.deepEqual(c.todo.map((d) => d.id), ['late', 'tonight', 'tmrAm']);
  assert.deepEqual(c.done.map((d) => d.id), ['ticked']);
  // ticked yesterday doesn't show as done today
  assert.equal(checklist(ds, now, { ...settings, doneAt: { ticked: at(26, 15) } }).done.length, 0);
  assert.equal(digest(ds, now, settings).overdue, 1);

  assert.equal(nextAt('08:00', now), at(28, 8));
  assert.equal(nextAt('21:30', now), at(27, 21, 30));
  assert.deepEqual(plan(ds, now, { ...settings, remind: { on: false } }), []);
  const p = plan(ds, now, { ...settings, remind: { on: true, before: [24, 2] } }, { 'tmrAm@2': 1 });
  // 24h reminders whose time already passed (tonight, tomorrow 9am) are skipped, not sent late.
  assert.deepEqual(p.map((r) => r.key), ['tonight@2', 'tmrPm@24', 'tmrPm@2']);
  assert.ok(p.every((r) => r.when > now));
});

test('time: countdown, freshness, pressure', async () => {
  const { countdown, freshness, pressure } = await import('../src/lib/time.js');
  const H = 3600000, now = Date.UTC(2026, 9, 27, 12);
  assert.deepEqual(countdown(now + 7 * H + 12 * 60000, now), { h: 7, m: 12 });
  assert.equal(countdown(now + 30 * H, now), null);
  assert.equal(countdown(now - 1, now), null);
  assert.equal(freshness(now - 30 * 60000, 60, now), 'fresh');
  assert.equal(freshness(now - 3 * H, 60, now), 'stale');
  assert.equal(freshness(now - 25 * H, 60, now), 'old');
  assert.equal(freshness(0, 60, now), 'none');
  assert.equal(pressure([], now).level, 'clear');
  assert.equal(pressure([{ due: now - H, overdue: true }], now).level, 'overdue');
  assert.equal(pressure([{ due: now + 10 * H }], now).level, 'today');
  assert.equal(pressure([{ due: now + 48 * H }], now).level, 'soon');
  const calm = pressure([{ due: now + 6 * 24 * H }, { due: now + 9 * 24 * H }], now);
  assert.equal(calm.level, 'calm'); assert.ok(calm.fill > 0.1 && calm.fill < 0.2);
});

test('bar: payload shape and mark merge (last write wins)', async () => {
  const { buildPayload, mergeMarks } = await import('../src/lib/bar.js');
  const now = Date.UTC(2026, 9, 27, 12);
  const snapshot = { at: now - 60000, deadlines: [
    { id: 'a', name: 'Late', code: 'EAP048', due: now - 86400000, overdue: true, actionable: false },
    { id: 'b', name: 'Mock Exam', code: 'MTH030', type: 'quiz', due: now + 3600000, overdue: false, action: 'Attempt quiz', actionable: true },
    { id: 'c', name: 'Scholarship', code: null, due: now + 3600000, overdue: false } ],
    engagement: [{ code: 'MTH030', courseId: '9', unopened: [1, 2, 3] }], courses: [{ code: 'MTH030', progress: 25 }] };
  const settings = { ...DEFAULT_SETTINGS, doneItems: ['b'], doneAt: { b: now - 1000 } };
  const p = buildPayload({ snapshot, status: { state: 'ok' }, settings, lang: 'zh', now });
  assert.deepEqual(p.items.map((i) => i.id), ['a', 'b']);          // only-my-modules drops the scholarship
  assert.equal(p.items[0].closedNote, true);
  assert.equal(p.items[1].kind, 'exam');
  assert.deepEqual(p.doneAt, { b: now - 1000 });
  assert.deepEqual(p.catchup, [{ code: 'MTH030', n: 3, url: 'https://core.xjtlu.edu.cn/course/view.php?id=9' }]);
  assert.equal(p.lang, 'zh');
  // menu bar unticked b after the browser ticked it -> undone; older mark is ignored
  let r = mergeMarks(settings, { b: { done: false, at: now } });
  assert.equal(r.changed, true); assert.deepEqual(r.settings.doneItems, []);
  r = mergeMarks(settings, { b: { done: false, at: now - 5000 } });
  assert.equal(r.changed, false);
  r = mergeMarks(settings, { a: { done: true, at: now } });
  assert.deepEqual(r.settings.doneItems.sort(), ['a', 'b']); assert.equal(r.settings.doneAt.a, now);
});
