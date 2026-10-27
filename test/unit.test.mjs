// Unit tests: parsers against real Learning Mall markup (private fixtures, skipped if absent)
// and pure logic (diff, classify) with synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML as lp } from 'linkedom';
import { sessionInfo, isLoginPage, parseCourseModules, parseGradeOverview, notificationKind, moduleCode } from '../src/lib/moodle.js';
import { diff, classify, visibleChanges, DEFAULT_SETTINGS } from '../src/lib/sync.js';

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

test('classify: overdue+actionable is missing; window filters upcoming', () => {
  const now = Date.UTC(2026, 9, 27);
  const d = [
    { name: 'late', due: now - 86400000, overdue: true, actionable: true },
    { name: 'late-but-done', due: now - 86400000, overdue: true, actionable: false },
    { name: 'soon', due: now + 2 * 86400000, overdue: false },
    { name: 'far', due: now + 40 * 86400000, overdue: false },
  ];
  const { missing, upcoming } = classify(d, now, 14);
  assert.deepEqual(missing.map((x) => x.name), ['late']);
  assert.deepEqual(upcoming.map((x) => x.name), ['soon']);
});

test('toggles hide change kinds; forum and announcements off by default', () => {
  const ch = [{ kind: 'forum', seenAt: 2 }, { kind: 'grades', seenAt: 2 }, { kind: 'announcements', seenAt: 1 }];
  const v = visibleChanges(ch, DEFAULT_SETTINGS, 1);
  assert.deepEqual(v.map((x) => x.kind), ['grades']);
  assert.equal(v[0].unseen, true);
});
