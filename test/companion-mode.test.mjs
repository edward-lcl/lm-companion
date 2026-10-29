import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { DEFAULT_SETTINGS } from '../src/lib/sync.js';
import fs from 'node:fs/promises';
import * as bar from '../src/lib/bar.js';
import { browserSettingsOperation } from '../src/lib/settings-bridge.js';

test('popup companion wiring preserves preferences and does not request permissions or mark changes read', async () => {
  const { document, window } = parseHTML(await fs.readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8'));
  // linkedom's dataset digit conversion differs from browsers for `i18n`.
  for (const node of document.querySelectorAll('*')) Object.defineProperty(node, 'dataset', {value: new Proxy({}, {get: (_, key) => node.getAttribute('data-' + String(key).replace(/[A-Z]/g, x => '-' + x.toLowerCase()))})});
  const settings = structuredClone({...DEFAULT_SETTINGS, lang: 'en', showPanel: true, doneItems: ['kept'], doneAt: {kept: 10}, layout: {popup: [{id: 'today', on: true}]}});
  const data = {settings, barStatus: {ok: true, at: 10}, status: {state: 'signed_out'}, lastSeenAt: 5};
  const globals = {document: globalThis.document, window: globalThis.window, chrome: globalThis.chrome};
  globalThis.document = document; globalThis.window = window;
  globalThis.chrome = {
    storage: {local: {get: async () => data, set: async (o) => Object.assign(data, o)}, onChanged: {addListener() {}}},
    permissions: {contains: async () => true, request: () => {throw Error('Unexpected permission prompt');}},
    runtime: {sendMessage: async msg => {
      if (msg.cmd === 'settings_update') { data.settings = browserSettingsOperation(data.settings, msg.operation); return { state: 'ok', settings: data.settings }; }
      return {};
    }, openOptionsPage() {}},
  };
  try {
    await import('../src/popup/popup.js?companion-test');
    assert.equal(document.getElementById('edit').hidden, true);
    assert.equal(data.lastSeenAt, 5);
    assert.match(document.getElementById('root').textContent, /companion mode/);
    const buttons = document.getElementById('root').querySelectorAll('button');
    await buttons[1].onclick();
    assert.equal(data.settings.displayMode, 'standalone');
    assert.equal(data.settings.showPanel, true);
    assert.deepEqual(data.settings.doneAt, {kept: 10});
    assert.deepEqual(data.settings.layout, settings.layout);
    assert.equal(document.getElementById('edit').hidden, false);
  } finally { Object.assign(globalThis, globals); }
});

test('native payload includes bounded change summaries without private source bodies', () => {
  const change = {kind: 'materials', title: '<img> New lecture', course: 'MTH030', url: 'https://core.xjtlu.edu.cn/course/view.php?id=1', at: 100, body: 'not exported'};
  const p = bar.buildPayload({settings: DEFAULT_SETTINGS, changes: Array(25).fill(change)});
  assert.equal(p.changes?.length, 20);
  assert.deepEqual(p.changes[0], {kind: change.kind, title: change.title, course: change.course, url: change.url, at: 100});
  const filtered = bar.buildPayload({settings: DEFAULT_SETTINGS, lastSeenAt: 10, changes: [
    {kind: 'materials', title: 'New notes', seenAt: 200},
    {kind: 'forum', title: 'Hidden by default', seenAt: 300},
  ]});
  assert.deepEqual(filtered.changes.map(c => [c.title, c.at]), [['New notes', 200]]);
  assert.equal(filtered.unseenChanges, 1);
});

test('companion is automatic only with permission and confirmed bridge; explicit standalone wins', () => {
  assert.equal(typeof bar.companionMode, 'function');
  assert.equal(bar.companionMode({}, null, false), false);
  assert.equal(bar.companionMode({}, {ok: true}, false), false);
  assert.equal(bar.companionMode({}, {ok: false}, true), false);
  assert.equal(bar.companionMode({}, {ok: true}, true), true);
  assert.equal(bar.companionMode({displayMode: 'standalone'}, {ok: true}, true), false);
  assert.equal(bar.companionMode({displayMode: 'companion'}, {ok: false}, false), true);
});

test('companion diagnostics are lightweight, escaped, and distinguish bridge from LM signin', () => {
  assert.equal(typeof bar.renderCompanion, 'function');
  for (const zh of [false, true]) {
    const {document} = parseHTML('<main></main>');
    const root = document.querySelector('main');
    bar.renderCompanion(root, {zh, barStatus: {ok: true, at: 1000}, status: {state: 'signed_out'}, snapshot: {at: 1000}}, {});
    assert.match(root.textContent, zh ? /登录/ : /Sign in/);
    assert.match(root.textContent, zh ? /浏览器/ : /browser/);
    assert.equal(root.querySelectorAll('input[type=checkbox]').length, 0);
    assert.equal(root.querySelectorAll('a[href="https://core.xjtlu.edu.cn/my/"]').length, 1);
    assert.equal(root.querySelectorAll('button').length, 2);
  }
});
