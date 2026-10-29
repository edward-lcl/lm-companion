import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto, randomUUID } from 'node:crypto';
import { parseHTML } from 'linkedom';
import * as syncLib from '../src/lib/sync.js';
import * as bridge from '../src/lib/settings-bridge.js';
import * as bar from '../src/lib/bar.js';
import * as reminders from '../src/lib/reminders.js';
import * as time from '../src/lib/time.js';
globalThis.crypto ||= webcrypto;
const source = async p => (await fs.readFile(new URL('../src/' + p, import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
async function harness() {
  const data = { settings: structuredClone({ ...syncLib.DEFAULT_SETTINGS, showPanel: true, displayMode: 'standalone' }) };
  const receipts = [], alarms = [], requests = [];
  let native, markReply;
  const chrome = {
    storage: { local: { get: async () => structuredClone(data), set: async o => { Object.assign(data, structuredClone(o)); } }, onChanged: event() },
    permissions: { contains: async () => true, request: async p => { requests.push(p); return true; }, remove: async () => {}, onAdded: event() },
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event(), openOptionsPage: async () => {}, getURL: p => p,
      sendNativeMessage: async (_, msg) => { if (msg.cmd === 'settings_result') receipts.push(msg); return markReply || { ok: true }; } },
    alarms: { create: async (...a) => alarms.push(a), getAll: async () => [], clear: async () => {}, onAlarm: event() },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
  };
  const deps = { ...syncLib, ...bridge, ...bar, ...reminders, ...time, chrome, console, crypto: webcrypto, TextEncoder, navigator: { language: 'en' },
    setLang() {}, t: x => x, refreshHandler: () => async () => {}, nativeRefreshConnection: opts => { native = opts.onMessage; return async () => {}; } };
  const context = vm.createContext(deps);
  vm.runInContext(await source('background.js'), context);
  chrome.runtime.sendMessage = msg => new Promise((resolve, reject) => {
    try { const accepted = chrome.runtime.onMessage.listeners.some(fn => fn(msg, {}, resolve) === true); if (!accepted) resolve({}); } catch (e) { reject(e); }
  });
  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); };
  async function nativeRequest(cmd, extra = {}) {
    const id = randomUUID(); native({ cmd, id, at: Date.now(), ...extra });
    for (let i = 0; i < 200 && !receipts.some(r => r.id === id); i++) await new Promise(r => setImmediate(r));
    const result = receipts.find(r => r.id === id); assert.ok(result, 'native receipt'); return result;
  }
  async function ui(path) {
    const html = path.startsWith('options') ? await fs.readFile(new URL('../src/options/options.html', import.meta.url), 'utf8') : '<main id="root"></main><button id="edit"></button><button id="refresh"></button><div id="region-main"></div>';
    const { document, window } = parseHTML(html);
    // linkedom select.value has no setter; browser selects do.
    for (const select of document.querySelectorAll('select')) Object.defineProperty(select, 'value', { writable: true, value: '' });
    const rendered = [];
    const scope = vm.createContext({ ...deps, document, window, setTimeout: () => {}, applyI18n() {},
      resolveLayout: x => x || [], renderLayoutEditor: (root, list, save) => { rendered.push({ save }); },
      render: (root, data, opts) => { rendered.push(opts); } });
    let code = await source(path);
    if (path.startsWith('content')) code = code.replace(/^  const \{.*\} = await import\(.*\);\n/gm, '');
    await vm.runInContext('(async () => {\n' + code + '\n})()', scope); await settle();
    return { document, rendered, scope };
  }
  return { data, chrome, receipts, alarms, requests, context, ui, settle, nativeRequest, setMarkReply: r => { markReply = r; } };
}

test('actual popup and panel simultaneous ticks preserve both marks and preferences', async () => {
  const h = await harness();
  const popup = await h.ui('popup/popup.js'), panel = await h.ui('content/panel.js');
  await Promise.all([popup.rendered.at(-1).actions.tick('popup-item', true), panel.rendered.at(-1).actions.tick('panel-item', true)]);
  assert.deepEqual([...h.data.settings.doneItems].sort(), ['panel-item', 'popup-item']);
  assert.ok(h.data.settings.doneAt['popup-item']); assert.ok(h.data.settings.doneAt['panel-item']);
  assert.equal(h.data.settings.refreshMinutes, 60);
});

test('queued native write, browser marks and reads share one revision boundary', async () => {
  const h = await harness(), popup = await h.ui('popup/popup.js');
  const original = await h.nativeRequest('settings_get');
  let release, entered;
  const held = new Promise(r => { release = r; }), started = new Promise(r => { entered = r; });
  const set = h.chrome.storage.local.set;
  h.chrome.storage.local.set = async o => { if (o.settings?.refreshMinutes === 180) { entered(); await held; } await set(o); };
  const native = h.nativeRequest('settings_set', { revision: original.snapshot.revision, patch: { refreshMinutes: 180 } });
  await started;
  const tick = popup.rendered.at(-1).actions.tick('during-native', true);
  const read = h.chrome.runtime.sendMessage({ cmd: 'settings_get' });
  release(); assert.equal((await native).state, 'ok'); await tick;
  const browser = await read;
  assert.equal(browser.settings.refreshMinutes, 180);
  assert.deepEqual([...browser.settings.doneItems], ['during-native']);
  assert.equal(browser.revision, await bridge.settingsRevision(browser.settings));
  const stale = await h.nativeRequest('settings_set', { revision: original.snapshot.revision, patch: { refreshMinutes: 30 } });
  assert.equal(stale.state, 'conflict');
  assert.equal(stale.snapshot.revision, browser.revision);
  const latest = await h.nativeRequest('settings_get');
  assert.equal(latest.snapshot.revision, browser.revision);
  assert.equal(h.alarms.filter(([name]) => name === 'sync').length, 2);
});

test('native push mark merge shares queue with browser preferences and marks', async () => {
  const h = await harness(), popup = await h.ui('popup/popup.js'), options = await h.ui('options/options.js');
  h.data.snapshot = { at: Date.now(), deadlines: [], courses: [] };
  h.setMarkReply({ ok: true, marks: { native: { done: true, at: Date.now() } } });
  await Promise.all([
    h.chrome.runtime.sendMessage({ cmd: 'bar_push' }),
    popup.rendered.at(-1).actions.tick('browser', true),
    options.document.querySelector('#morningAt').onchange({ target: { value: '10:15' } }),
  ]); await h.settle();
  assert.deepEqual([...h.data.settings.doneItems].sort(), ['browser', 'native']);
  assert.equal(h.data.settings.remind.morningAt, '10:15');
  assert.equal(h.requests.length, 0);
});

test('options membership and per-surface layout operations preserve independent edits', async () => {
  const h = await harness(), a = await h.ui('options/options.js'), b = await h.ui('options/options.js');
  const aBefore = a.document.querySelector('[data-before="1"]'), bBefore = b.document.querySelector('[data-before="3"]');
  aBefore.checked = bBefore.checked = true;
  await Promise.all([aBefore.onchange(), bBefore.onchange()]);
  assert.deepEqual([...h.data.settings.remind.before], [24, 3, 2, 1]);
  b.document.querySelector('[data-surface="panel"]').onclick();
  await Promise.all([a.rendered.at(-1).save([{ id: 'week', on: true }]), b.rendered.at(-1).save([{ id: 'today', on: false }])]);
  assert.deepEqual(h.data.settings.layout, { popup: [{ id: 'week', on: true }], panel: [{ id: 'today', on: false }] });
  await a.document.querySelector('#resetLayout').onclick();
  assert.deepEqual(h.data.settings.layout, { panel: [{ id: 'today', on: false }] });
});

test('permission requests remain synchronous browser gestures; failures do not poison queue', async () => {
  const h = await harness(), options = await h.ui('options/options.js');
  h.chrome.permissions.contains = async () => false;
  assert.equal((await h.chrome.runtime.sendMessage({ cmd: 'settings_update', operation: { type: 'patch', patch: { remind: { on: true } } } })).state, 'permission_required');
  assert.equal(h.requests.length, 0);
  const pending = options.document.querySelector('#remindOn').onchange({ target: { checked: true } });
  assert.equal(h.requests.length, 1, 'permission requested before first async yield');
  await pending;
  const set = h.chrome.storage.local.set;
  h.chrome.storage.local.set = async () => { throw Error('fixture disk failure'); };
  assert.equal((await h.chrome.runtime.sendMessage({ cmd: 'settings_update', operation: { type: 'tick', id: 'fail', on: true } })).state, 'error');
  h.chrome.storage.local.set = set;
  assert.equal((await h.chrome.runtime.sendMessage({ cmd: 'settings_update', operation: { type: 'tick', id: 'good', on: true } })).state, 'ok');
  assert.deepEqual([...h.data.settings.doneItems], ['good']);
});

test('popup layout, reset, hide and untick callbacks use the same background writer', async () => {
  const h = await harness(), popup = await h.ui('popup/popup.js');
  const actions = popup.rendered.at(-1).actions;
  await Promise.all([actions.mark('hiddenItems', 'hidden'), actions.mark('doneItems', 'done')]);
  assert.deepEqual([...h.data.settings.hiddenItems], ['hidden']);
  assert.deepEqual([...h.data.settings.doneItems], ['done']);
  await actions.tick('done', false);
  assert.deepEqual([...h.data.settings.doneItems], []); assert.equal(h.data.settings.doneAt.done, undefined);
  popup.document.querySelector('#edit').onclick(); await h.settle();
  await popup.rendered.at(-1).save([{ id: 'week', on: false }]);
  assert.deepEqual(h.data.settings.layout.popup, [{ id: 'week', on: false }]);
  const reset = popup.document.querySelector('.reset');
  await reset.onclick({ target: reset }); await reset.onclick({ target: reset });
  assert.equal(h.data.settings.layout.popup, undefined);
  const options = await h.ui('options/options.js');
  await actions.tick('done', true);
  await options.document.querySelector('#resetItems').onclick();
  assert.deepEqual(h.data.settings.doneAt, {}); assert.deepEqual(h.data.settings.hiddenItems, []);
});

test('all browser settings writers use background operations, not direct storage replacement', async () => {
  for (const p of ['options/options.js', 'popup/popup.js', 'content/panel.js']) {
    const code = await source(p);
    assert.doesNotMatch(code, /(?:local|storage)\.set\(\{\s*settings\b/);
    assert.doesNotMatch(code, /settings_changed/);
  }
});

test('stale actual options editor cannot revert acknowledged native preferences', async () => {
  const h = await harness(), ui = await h.ui('options/options.js');
  const before = await h.nativeRequest('settings_get');
  const saved = await h.nativeRequest('settings_set', { revision: before.snapshot.revision, patch: { refreshMinutes: 180, remind: { morningAt: '09:30' }, changes: { forum: true } } });
  assert.equal(saved.state, 'ok');
  ui.document.querySelector('#showPanel').onchange({ target: { checked: false } }); await h.settle();
  assert.equal(h.data.settings.refreshMinutes, 180);
  assert.equal(h.data.settings.remind.morningAt, '09:30');
  assert.equal(h.data.settings.changes.forum, true);
  assert.equal(h.data.settings.showPanel, false);
  assert.equal(h.requests.length, 0);
});
