// Offline real stdio transport + production JS handler, disposable HOME only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { refreshHandler } from '../src/lib/refresh-bridge.js';
const host = resolve('../lm-bar/.build/debug/lmbar-host');
const home = mkdtempSync(join(process.env.TMPDIR, 'lm-refresh-wire-'));
const env = { ...process.env, HOME: home, CFFIXED_USER_HOME: home };
const dir = join(home, 'Library/Application Support/LMBar');
mkdirSync(dir, { recursive: true });
const frame = obj => { const body = Buffer.from(JSON.stringify(obj)), head = Buffer.alloc(4); head.writeUInt32LE(body.length); return Buffer.concat([head, body]); };
const send = obj => {
  const p = spawnSync(host, [], { env, input: frame(obj), timeout: 5000 });
  assert.equal(p.status, 0, String(p.stderr));
  return JSON.parse(p.stdout.subarray(4, 4 + p.stdout.readUInt32LE()));
};
const request = { id: randomUUID(), at: Date.now() - 10 };
writeFileSync(join(dir, 'refresh-request.json'), JSON.stringify(request));
const originalState = { marks: { kept: { done: true, at: 42 } } };
writeFileSync(join(dir, 'state.json'), JSON.stringify(originalState));
const port = spawn(host, [], { env, stdio: ['pipe', 'pipe', 'pipe'] });
try {
  const incoming = new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const timeout = setTimeout(() => reject(Error('watch timeout')), 5000);
    port.stdout.on('data', part => { data = Buffer.concat([data, part]); if (data.length >= 4 && data.length >= 4 + data.readUInt32LE()) { clearTimeout(timeout); resolve(JSON.parse(data.subarray(4, 4 + data.readUInt32LE()))); } });
  });
  port.stdin.write(frame({ cmd: 'watch' }));
  const msg = await incoming;
  assert.equal(msg.id, request.id); assert.equal(msg.cmd, 'refresh');
  assert.ok(JSON.parse(readFileSync(join(dir, 'refresh-connection.json'))) > 0);
  const payload = { v: 1, at: request.at - 100, sentAt: Date.now(), status: 'ok', lang: 'en', windowDays: 14, items: [], catchup: [], completion: [], doneAt: {}, unseenChanges: 0 };
  assert.equal(send({ cmd: 'push', payload, refreshID: request.id }).ok, false, 'cached data must not complete');
  assert.equal(send({ cmd: 'refresh_result', id: randomUUID(), state: 'error' }).ok, false);
  assert.equal(send({ cmd: 'refresh_result', id: request.id, state: 'ok' }).ok, false, 'no success without payload');
  let reads = 0;
  await refreshHandler({ sync: async () => { reads++; payload.at = Date.now(); return { state: 'ok' }; },
    push: async id => { const r = send({ cmd: 'push', payload, refreshID: id }); assert.equal(r.ok, true); assert.deepEqual(r.marks, originalState.marks); },
    report: async () => assert.fail('unexpected error') })(msg);
  assert.equal(reads, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'refresh-receipt.json'))), { id: request.id, state: 'ok' });
  assert.equal(JSON.parse(readFileSync(join(dir, 'payload.json'))).at, payload.at);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'state.json'))), originalState);
  for (const state of ['signed_out', 'needs_access', 'partial', 'error']) {
    assert.equal(send({ cmd: 'refresh_result', id: request.id, state }).ok, true);
    assert.equal(JSON.parse(readFileSync(join(dir, 'refresh-receipt.json'))).state, state);
  }
  const exited = new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('host did not close on EOF')), 3000); port.on('exit', () => { clearTimeout(t); resolve(); }); });
  port.stdin.end(); await exited;
  console.log('PASS: real watch → JS refresh handler → framed push → correlated fresh receipt; stale/invalid/error paths, marks preservation and EOF shutdown');
} finally { port.kill(); rmSync(home, { recursive: true, force: true }); }
