// Synthetic real framed transport; never uses the installed host or live HOME.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, webcrypto } from 'node:crypto';
import { settingsHandler, CHANGE_KEYS, settingsRevision } from '../src/lib/settings-bridge.js';
globalThis.crypto ||= webcrypto;
const host = resolve('../lm-bar/.build/debug/lmbar-host');
const home = mkdtempSync(join(process.env.TMPDIR, 'lm-settings-wire-'));
const env = { ...process.env, HOME: home, CFFIXED_USER_HOME: home };
const dir = join(home, 'Library/Application Support/LMBar'); mkdirSync(dir, { recursive: true });
const frame = obj => { const body = Buffer.from(JSON.stringify(obj)), head = Buffer.alloc(4); head.writeUInt32LE(body.length); return Buffer.concat([head, body]); };
const send = obj => { const p = spawnSync(host, [], { env, input: frame(obj), timeout: 5000 }); assert.equal(p.status, 0, String(p.stderr)); return JSON.parse(p.stdout.subarray(4, 4 + p.stdout.readUInt32LE())); };
let settings = { remind: { on: false, morning: true, morningAt: '08:00', before: [24,2] }, refreshMinutes: 60, changes: Object.fromEntries(CHANGE_KEYS.map(k => [k,true])), onlyModules: true, studyLog: false, hiddenItems: ['hidden'], hiddenCourses: [], doneItems: ['kept'] };
let writes = 0, applies = 0;
const originalState = { marks: { kept: { done: true, at: 42 } } };
writeFileSync(join(dir, 'state.json'), JSON.stringify(originalState));
const handler = settingsHandler({ getSettings: async () => structuredClone(settings), setSettings: async s => { settings = s; writes++; }, permissions: { contains: async () => true }, apply: async () => { applies++; }, openOptions: async () => {}, report: async result => { assert.equal(send({ cmd: 'settings_result', ...result }).ok, true); } });
let port;
try {
  const request = { id: randomUUID(), at: Date.now() - 10, cmd: 'settings_set', revision: await settingsRevision(settings), patch: { ...settings, refreshMinutes: 180 } };
  // Wire patch carries only the fixed settings schema, no private lists.
  delete request.patch.hiddenItems; delete request.patch.hiddenCourses; delete request.patch.doneItems;
  writeFileSync(join(dir, 'settings-request.json'), JSON.stringify(request));
  port = spawn(host, [], { env, stdio: ['pipe','pipe','pipe'] });
  const incoming = new Promise((resolve, reject) => {
    let data = Buffer.alloc(0); const timeout = setTimeout(() => reject(Error('watch timeout')), 5000);
    port.stdout.on('data', part => { data = Buffer.concat([data,part]); if (data.length >= 4 && data.length >= 4 + data.readUInt32LE()) { clearTimeout(timeout); resolve(JSON.parse(data.subarray(4,4 + data.readUInt32LE()))); } });
  });
  port.stdin.write(frame({ cmd: 'watch' })); const msg = await incoming;
  assert.equal(msg.cmd, 'settings_set'); assert.equal(msg.id, request.id);
  assert.equal(send({ cmd: 'settings_result', id: randomUUID(), state: 'error' }).ok, false);
  assert.equal(send({ cmd: 'settings_result', id: request.id, state: 'ok' }).ok, false);
  await handler(msg);
  const receipt = JSON.parse(readFileSync(join(dir, 'settings-receipt.json')));
  assert.equal(receipt.id, request.id); assert.equal(receipt.state, 'ok'); assert.equal(receipt.snapshot.values.refreshMinutes, 180);
  assert.equal(writes, 1); assert.equal(applies, 1); assert.deepEqual(settings.doneItems, ['kept']); assert.deepEqual(settings.hiddenItems, ['hidden']);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'state.json'))), originalState);
  assert.equal(send({ cmd: 'settings_result', ...receipt }).ok, false, 'receipt cannot be overwritten by replay');
  const exited = new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('EOF timeout')), 3000); port.on('exit', () => { clearTimeout(t); resolve(); }); });
  port.stdin.end(); await exited;
  console.log('PASS settings watch → production JS → actual write/readback → framed host receipt; correlation, replay, missing snapshot rejection, retained marks and EOF');
} finally { port?.kill(); rmSync(home, { recursive: true, force: true }); }
