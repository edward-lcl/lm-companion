import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshHandler, nativeRefreshConnection } from '../src/lib/refresh-bridge.js';
const message = { cmd: 'refresh', id: '12345678-1234-1234-1234-123456789abc', at: 1000 };

test('refresh waits for real sync, coalesces clicks and never pushes on failure', async () => {
  let release, reads = 0, pushes = 0;
  const reports = [];
  const handler = refreshHandler({ now: () => 1000,
    sync: () => { reads++; return new Promise(r => { release = r; }); },
    push: async id => { assert.equal(id, message.id); pushes++; }, report: async (...x) => reports.push(x) });
  const pending = handler(message);
  await handler(message); await handler({ ...message, id: '22345678-1234-1234-1234-123456789abc' });
  assert.equal(reads, 1); assert.equal(pushes, 0);
  release({ state: 'ok' }); await pending;
  assert.equal(pushes, 1); await handler(message); assert.equal(reads, 1);
  assert.deepEqual(reports, []);
});

test('refresh validates fixed command, age and failures', async () => {
  for (const state of ['signed_out', 'needs_access', 'partial', 'site_changed', 'error']) {
    const reports = [];
    const handler = refreshHandler({ now: () => 1000, sync: async () => ({ state }),
      push: async () => assert.fail('must not push'), report: async (id, s) => reports.push(s) });
    await handler({ ...message, cmd: 'open', url: 'https://example.org' });
    await handler({ ...message, at: -90000 }); await handler({ ...message, at: 1001 });
    await handler({ ...message, id: 'invalid' }); assert.deepEqual(reports, []);
    await handler(message); assert.deepEqual(reports, [state]);
  }
  const reports = [];
  await refreshHandler({ now: () => 1000, sync: async () => ({ state: 'ok', errors: ['partial'] }),
    push: async () => assert.fail(), report: async (id, state) => reports.push(state) })(message);
  assert.deepEqual(reports, ['partial']);
});

test('sync or native push exceptions never produce success', async () => {
  for (const failRead of [true, false]) {
    const reports = [];
    await refreshHandler({ now: () => 1000,
      sync: async () => { if (failRead) throw Error('network'); return { state: 'ok' }; },
      push: async () => { throw Error('host refused'); },
      report: async (id, state) => reports.push(state) })(message);
    assert.deepEqual(reports, ['error']);
  }
});

test('native port requires existing permission and reconnects without requesting it', async () => {
  let allowed = false, connections = 0, disconnect;
  const sent = [];
  const connect = nativeRefreshConnection({ host: 'test', onMessage() {},
    permissions: { contains: async () => allowed }, runtime: { connectNative: () => {
      connections++; return { postMessage: x => sent.push(x), onMessage: { addListener() {} }, onDisconnect: { addListener(fn) { disconnect = fn; } } };
    } } });
  await connect(); assert.equal(connections, 0);
  allowed = true; await Promise.all([connect(), connect()]); assert.equal(connections, 1);
  await connect(); assert.equal(connections, 1);
  disconnect(); await connect(); assert.equal(connections, 2);
  assert.deepEqual(sent, [{ cmd: 'watch' }, { cmd: 'watch' }]);
});
