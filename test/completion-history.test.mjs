import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload } from '../src/lib/bar.js';
import * as moodle from '../src/lib/moodle.js';
import * as syncLib from '../src/lib/sync.js';
import { parseHTML as dom } from 'linkedom';
const parseHTML = (s) => dom(s).document;
test('only explicit submission status is positive evidence', () => {
 assert.equal(moodle.parseAssignmentStatus('<div class="submissionstatustable"><td class="submissionstatussubmitted">Submitted for grading</td></div>', parseHTML).sourceStatus, 'submitted');
 for (const cls of ['submissionstatusdraft', 'submissionstatusnew', 'completion-done', 'submissiongraded']) {
  assert.notEqual(moodle.parseAssignmentStatus(`<div class="submissionstatustable"><td class="${cls}">Done</td></div>`, parseHTML).sourceStatus, 'submitted');
 }
 assert.throws(() => moodle.parseAssignmentStatus('<html>Login or changed page</html>', parseHTML));
});
test('history retains stable IDs, unknown absence and first observed evidence without inventing submission time', () => {
 const old = [{ ...item, lastSeenAt: now - 1000 }];
 const h = syncLib.reconcileAssignments(old, [], {}, now);
 assert.equal(h[0].feedState, 'not-in-active-feed');
 assert.notEqual(h[0].submitted, true);
 const yes = syncLib.reconcileAssignments(h, [], { [item.id]: { sourceStatus: 'submitted' } }, now + 1);
 assert.equal(yes[0].firstObservedSubmittedAt, now + 1);
 assert.equal(yes[0].submittedAt, undefined);
 const retry = syncLib.reconcileAssignments(yes, [], {}, now + 2);
 assert.equal(retry[0].firstObservedSubmittedAt, now + 1);
 const sibling = { ...item, id: 'assign:999', courseId: '2' };
 assert.equal(syncLib.reconcileAssignments(retry, [sibling], {}, now + 3).length, 2);
 assert.equal(syncLib.reconcileAssignments(old, [], {}, now + 91 * 86400000).length, 0);
 const many = Array.from({ length: 305 }, (_, i) => ({ ...item, id: String(i), lastSeenAt: now }));
 assert.equal(syncLib.reconcileAssignments(many, [], {}, now).length, 300);
 assert.equal(syncLib.reconcileAssignments([{ ...item, feedState: 'active', lastSeenAt: now }], [], {}, now, false)[0].feedState, 'active');
 const reopened = syncLib.reconcileAssignments(yes, [], { [item.id]: { sourceStatus: 'draft' } }, now + 4);
 assert.equal(reopened[0].submitted, false);
 assert.equal(syncLib.reconcileAssignments(yes, [{ ...item, submitted: false }], {}, now + 5)[0].submitted, true);
});
test('sync reads disappeared assignment status via read-only browser fetch and retains failures', async () => {
 const db = { snapshot: { at: now - 1000, deadlines: [item], courses: [], materialIds: [], grades: [] } };
 const storage = { get: async (key) => ({ [key]: db[key] }), set: async (o) => Object.assign(db, o) };
 const requests = [];
 let failStatus = false;
 const fetchImpl = async (url, opts) => {
  requests.push({ url, opts });
  if (url.includes('/mod/assign/')) {
   if (failStatus) throw new Error('offline');
   return { ok: true, url, text: async () => '<div class="submissionstatustable"><td class="submissionstatussubmitted">Submitted</td></div>' };
  }
  if (url.includes('/lib/ajax/')) {
   const method = JSON.parse(opts.body)[0].methodname;
   const data = method.includes('enrolled') ? { courses: [] } : method.includes('timesort') ? { events: [] } : { notifications: [] };
   return { json: async () => [{ data }] };
  }
  return { ok: true, url, text: async () => url.includes('/grade/') ? '<table id="overview-grade"><tbody></tbody></table>' : '<div id="user-menu-toggle" data-userid="1"></div><script>{"sesskey":"fixture"}</script>' };
 };
 await syncLib.sync({ storage, fetchImpl, parseHTML, now });
 assert.equal(db.snapshot.assignmentHistory[0].sourceStatus, 'submitted');
 assert.equal(db.snapshot.assignmentHistory[0].feedState, 'not-in-active-feed');
 const read = requests.find((r) => r.url.includes('/mod/assign/'));
 assert.equal(read.opts.credentials, 'include');
 assert.equal(read.opts.method || 'GET', 'GET');
 const p = buildPayload({ snapshot: db.snapshot, settings: {}, now });
 assert.equal(p.history[0].firstObservedSubmittedAt, now);
 assert.equal(p.history[0].submittedAt, null);
 failStatus = true;
 await syncLib.sync({ storage, fetchImpl, parseHTML, now: now + 1000 });
 assert.equal(db.status.state, 'partial');
 assert.equal(db.snapshot.assignmentHistory[0].firstObservedSubmittedAt, now);
 assert.equal(db.snapshot.assignmentHistory[0].statusCheckedAt, now);
 // Reads are bounded and rotate after failures rather than starving later records.
 db.snapshot.assignmentHistory = Array.from({ length: 15 }, (_, i) => ({ ...item, id: `assign:${i}`, url: item.url.replace('42', String(i + 1)), lastSeenAt: now }));
 requests.length = 0;
 await syncLib.sync({ storage, fetchImpl, parseHTML, now: now + 2000 });
 assert.equal(requests.filter((r) => r.url.includes('/mod/assign/')).length, 12);
 assert.equal(db.snapshot.assignmentHistory.filter((d) => d.sourceStatus === 'submitted').length, 0);
 requests.length = 0;
 await syncLib.sync({ storage, fetchImpl, parseHTML, now: now + 3000 });
 assert.ok(requests.some((r) => r.url.endsWith('id=15')));
});

test('assignment read allowlist rejects quizzes and strips action parameters', () => {
 assert.equal(moodle.assignmentPath('https://core.xjtlu.edu.cn/mod/quiz/view.php?id=1'), null);
 assert.equal(moodle.assignmentPath('https://evil.test/mod/assign/view.php?id=1'), null);
 assert.equal(moodle.assignmentPath(item.url + '&action=submit'), '/mod/assign/view.php?id=42');
});
test('course fallback keeps known identity without merging same-name siblings', () => {
 const a = { ...item, name: 'Same', url: item.url };
 const b = { ...item, id: 'assign:124', name: 'Same', url: item.url.replace('42', '43') };
 const course = { ...item, id: '43', name: 'Same', completion: null, url: b.url };
 assert.equal(syncLib.mergeCourseDeadlines([a], [course], now).length, 2);
});
test('source URL identity survives timeline-to-course fallback', () => {
 const old = [{ ...item, lastSeenAt: now }];
 const fallback = { ...item, id: 'assign-cm:42' };
 const h = syncLib.reconcileAssignments(old, [fallback], {}, now + 1);
 assert.equal(h.length, 1);
 assert.equal(h[0].id, item.id);
 assert.equal(h[0].feedState, 'active');
});
test('course-only completed assignment is discoverable but needs submission evidence', async () => {
 const db = {};
 const storage = { get: async (key) => ({ [key]: db[key] }), set: async (o) => Object.assign(db, o) };
 const fetchImpl = async (url, opts) => {
  if (url.includes('/lib/ajax/')) {
   const method = JSON.parse(opts.body)[0].methodname;
   return { json: async () => [{ data: method.includes('enrolled') ? { courses: [{ id: 1, fullname: 'MTH030-Test' }] } : method.includes('timesort') ? { events: [] } : { notifications: [] } }] };
  }
  let html = '<div id="user-menu-toggle" data-userid="1"></div><script>{"sesskey":"fixture"}</script>';
  if (url.includes('/grade/')) html = '<table id="overview-grade"><tbody></tbody></table>';
  if (url.includes('/course/view')) html = '<li id="module-42" class="modtype_assign"><span data-activityname="Assignment6"></span><a href="https://core.xjtlu.edu.cn/mod/assign/view.php?id=42">Open</a><div data-region="completionrequirements"><button class="btn-success">Done</button></div><div class="activity-dates">Due: Sunday, 13 December 2026, 23:59</div></li>';
  if (url.includes('/mod/assign/')) html = '<div class="submissionstatustable"><td class="submissionstatussubmitted">Submitted</td></div>';
  return { ok: true, url, text: async () => html };
 };
 await syncLib.sync({ storage, fetchImpl, parseHTML, now: Date.UTC(2026, 11, 13) });
 assert.equal(db.snapshot.assignmentHistory[0]?.id, 'assign-cm:42');
 assert.equal(db.snapshot.assignmentHistory[0]?.sourceStatus, 'submitted');
 assert.equal(db.snapshot.assignmentHistory[0]?.feedState, 'not-in-active-feed');
 assert.equal(db.snapshot.deadlines.length, 0);
});
const now = 1800000000000;
const item = { id: 'assign:123', type: 'assign', name: 'Assignment6', code: 'MTH030', courseId: '1', due: now + 1000, url: 'https://core.xjtlu.edu.cn/mod/assign/view.php?id=42' };
test('bridge retains disappeared assignments without calling them completed', () => {
 const p = buildPayload({ snapshot: { at: now, deadlines: [], assignmentHistory: [{ ...item, feedState: 'not-in-active-feed', lastSeenAt: now }] }, settings: {}, now });
 assert.equal(p.history?.[0]?.id, item.id);
 assert.equal(p.history[0].sourceStatus, 'unknown');
 assert.deepEqual(p.doneAt, {});
 assert.deepEqual(p.items, []);
});
