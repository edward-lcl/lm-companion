// Reverse native channel: one fixed verb, no URLs or arbitrary browser actions.
export function refreshHandler({ sync, push, report, now = Date.now }) {
  let active = null;
  const seen = new Set();
  return async (msg) => {
    if (msg?.cmd !== 'refresh' || typeof msg.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(msg.id) ||
        !Number.isFinite(msg.at) || msg.at > now() || now() - msg.at >= 90000 || seen.has(msg.id) || active) return;
    seen.add(msg.id);
    if (seen.size > 100) seen.delete(seen.values().next().value);
    active = msg.id;
    try {
      const result = await sync();
      const state = result?.errors?.length ? 'partial' : result?.state;
      if (state === 'ok') await push(msg.id);
      else await report(msg.id, ['needs_access', 'signed_out', 'partial', 'site_changed'].includes(state) ? state : 'error');
    } catch { await report(msg.id, 'error').catch(() => {}); }
    finally { active = null; }
  };
}

export function nativeRefreshConnection({ runtime, permissions, host, onMessage }) {
  let port = null;
  let connecting = false;
  permissions.onRemoved?.addListener((removed) => {
    if (removed.permissions?.includes('nativeMessaging')) { port?.disconnect(); port = null; }
  });
  return async function connect() {
    if (port || connecting || !runtime.connectNative) return;
    connecting = true;
    try {
      if (!(await permissions.contains({ permissions: ['nativeMessaging'] }))) return;
      port = runtime.connectNative(host);
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(() => { void runtime.lastError; port = null; });
      port.postMessage({ cmd: 'watch' });
    } catch { port = null; }
    finally { connecting = false; }
  };
}
