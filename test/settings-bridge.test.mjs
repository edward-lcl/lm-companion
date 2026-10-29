import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { settingsHandler, validPatch, settingsRevision, CHANGE_KEYS } from '../src/lib/settings-bridge.js';
globalThis.crypto ||= webcrypto;
export const fixture = () => ({ remind: { on: false, morning: true, morningAt: '08:00', before: [24,2] }, refreshMinutes: 60,
  changes: Object.fromEntries(CHANGE_KEYS.map(k => [k, true])), onlyModules: true, studyLog: false,
  hiddenCourses: ['private-course'], hiddenItems: ['kept-hidden'], doneItems: ['handled'], layout: { popup: [{ id: 'week', on: false }] }, lang: 'zh', displayMode: 'standalone' });
const request = (cmd = 'settings_get', extras = {}) => ({ cmd, id: randomUUID(), at: 1000, ...extras });
function harness(extra = {}) {
  let settings = fixture(), writes = 0, applied = 0, opened = 0;
  const replies = [];
  const handler = settingsHandler({ getSettings: async () => structuredClone(settings), setSettings: async s => { writes++; settings = structuredClone(s); },
    permissions: { contains: async () => true }, apply: async () => { applied++; }, openOptions: async () => { opened++; }, report: async r => replies.push(r), now: () => 1001, ...extra });
  return { handler, replies, get settings() { return settings; }, get writes() { return writes; }, get applied() { return applied; }, get opened() { return opened; } };
}
test('bounded, strict settings values reject arbitrary verbs/URLs/prototypes/types', () => {
  for (const p of [null, [], {}, { url: 'https://evil.test' }, { refreshMinutes: '60' }, { refreshMinutes: 1 }, { changes: { random: true } }, { remind: { morningAt: '24:00' } }, { remind: { before: [2,2] } }, { remind: { before: [10000] } }, { studyLog: 1 }, JSON.parse('{"__proto__":{}}')]) assert.equal(validPatch(p), false, JSON.stringify(p));
  assert.equal(validPatch({ remind: { on: true, morning: false, morningAt: '23:59', before: [24,3,2,1] }, changes: { forum: false }, refreshMinutes: 180 }), true);
});
test('read snapshot excludes private IDs and marks; fixed options action only', async () => {
  const h = harness(); await h.handler(request());
  assert.equal(h.replies[0].state, 'ok'); assert.equal(h.replies[0].snapshot.hiddenCourses, 1);
  assert.equal(JSON.stringify(h.replies).includes('private-course'), false);
  await h.handler(request('settings_options')); assert.equal(h.opened, 1); assert.equal(h.replies.at(-1).state, 'opened');
  await h.handler(request('settings_options', { url: 'https://evil.test' })); assert.equal(h.opened, 1); assert.equal(h.replies.at(-1).state, 'invalid');
  assert.equal(h.writes, 0);
});
test('write acknowledged only after readback/apply; all unrelated toggles preserved, replay ignored', async () => {
  const h = harness(), original = h.settings;
  const r = request('settings_set', { revision: await settingsRevision(original), patch: { remind: { morningAt: '09:30' }, refreshMinutes: 30, changes: { forum: false } } });
  await h.handler(r); await h.handler(r);
  assert.equal(h.writes, 1); assert.equal(h.applied, 1); assert.equal(h.replies.length, 1); assert.equal(h.replies[0].state, 'ok');
  assert.equal(h.replies[0].snapshot.values.remind.morningAt, '09:30');
  for (const key of ['layout','lang','displayMode','hiddenCourses','hiddenItems','doneItems']) assert.deepEqual(h.settings[key], original[key]);
  assert.equal(h.settings.remind.on, false); assert.deepEqual(h.settings.remind.before, [24,2]);
});
test('stale revision, expired request and missing permissions never write or grant', async () => {
  const h = harness({ permissions: { contains: async () => false } });
  await h.handler(request('settings_set', { revision: 'a'.repeat(64), patch: { refreshMinutes: 30 } }));
  assert.equal(h.replies.at(-1).state, 'conflict');
  await h.handler(request('settings_set', { revision: await settingsRevision(h.settings), patch: { remind: { on: true } } }));
  assert.equal(h.replies.at(-1).state, 'permission_required');
  await h.handler(request('settings_get', { at: -89000 }));
  await h.handler(request('arbitrary')); await h.handler(request('settings_get', { id: '-'.repeat(36) }));
  assert.equal(h.writes, 0); assert.equal(h.replies.length, 2);
});
test('storage failure and failed readback cannot claim save; scheduling failure distinguished', async () => {
  for (const [extra, expected] of [[{ setSettings: async () => { throw Error('disk'); } }, 'error'], [{ setSettings: async () => {} }, 'conflict'], [{ apply: async () => { throw Error('alarm'); } }, 'apply_failed']]) {
    const h = harness(extra); await h.handler(request('settings_set', { revision: await settingsRevision(h.settings), patch: { refreshMinutes: 180 } }));
    assert.equal(h.replies.at(-1).state, expected);
  }
});
test('concurrent native requests get busy, never parallel writes', async () => {
  let release; const wait = new Promise(r => { release = r; });
  const h = harness({ openOptions: () => wait }); const pending = h.handler(request('settings_options'));
  await h.handler(request()); assert.equal(h.replies[0].state, 'busy'); release(); await pending;
});
