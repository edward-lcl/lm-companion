// Browser owns storage, permissions and the existing scheduler. No permission requests here.
export const CHANGE_KEYS = ['materials', 'grades', 'feedback', 'deadlines', 'forum', 'announcements'];
const verbs = ['settings_get', 'settings_set', 'settings_options'];
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function validPatch(p) {
  if (!plain(p) || !Object.keys(p).length || Object.keys(p).some(k => !['remind', 'refreshMinutes', 'changes', 'onlyModules', 'studyLog'].includes(k))) return false;
  if ('refreshMinutes' in p && ![30, 60, 180].includes(p.refreshMinutes)) return false;
  for (const k of ['onlyModules', 'studyLog']) if (k in p && typeof p[k] !== 'boolean') return false;
  if ('changes' in p && (!plain(p.changes) || !Object.keys(p.changes).length || Object.entries(p.changes).some(([k,v]) => !CHANGE_KEYS.includes(k) || typeof v !== 'boolean'))) return false;
  if ('remind' in p) {
    const r = p.remind;
    if (!plain(r) || !Object.keys(r).length || Object.keys(r).some(k => !['on', 'morning', 'morningAt', 'before'].includes(k))) return false;
    for (const k of ['on', 'morning']) if (k in r && typeof r[k] !== 'boolean') return false;
    if ('morningAt' in r && (typeof r.morningAt !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.morningAt))) return false;
    if ('before' in r && (!Array.isArray(r.before) || r.before.length > 4 || new Set(r.before).size !== r.before.length || r.before.some(h => ![24,3,2,1].includes(h)))) return false;
  }
  return true;
}
export function preferences(s) {
  return { remind: { on: s.remind.on, morning: s.remind.morning, morningAt: s.remind.morningAt, before: [...s.remind.before] }, refreshMinutes: s.refreshMinutes,
    changes: Object.fromEntries(CHANGE_KEYS.map(k => [k, !!s.changes[k]])), onlyModules: !!s.onlyModules, studyLog: !!s.studyLog };
}
// Hash the complete browser settings, including upstream filters/marks: stale native edits
// must not overwrite a newer browser edit. Token is opaque, never a private settings dump.
export async function settingsRevision(s) {
  const canonical = x => Array.isArray(x) ? x.map(canonical) : plain(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(s))));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// One background-owned FIFO covers native revisions, browser operations and mark merges.
// Rejections never poison the next request. Callers must not re-enter this queue.
export function settingsQueue() {
  let tail = Promise.resolve();
  return work => { const result = tail.then(work); tail = result.catch(() => {}); return result; };
}
export function browserSettingsOperation(s, op, now = Date.now()) {
  if (!plain(op)) throw Error('Invalid settings operation');
  if (op.type === 'patch') {
    const p = op.patch;
    if (!plain(p) || !Object.keys(p).length) throw Error('Invalid patch');
    const native = {};
    for (const [key, value] of Object.entries(p)) {
      if (['remind', 'changes', 'refreshMinutes', 'onlyModules', 'studyLog'].includes(key)) native[key] = value;
      else if (!(key === 'lang' && ['auto', 'en', 'zh'].includes(value)) &&
               !(key === 'displayMode' && ['auto', 'companion', 'standalone'].includes(value)) &&
               !(key === 'showPanel' && typeof value === 'boolean') &&
               !(key === 'windowDays' && [7, 14, 30].includes(value))) throw Error('Invalid field');
    }
    if (Object.keys(native).length && !validPatch(native)) throw Error('Invalid preference');
    return { ...s, ...p, remind: { ...s.remind, ...p.remind }, changes: { ...s.changes, ...p.changes } };
  }
  if (op.type === 'tick' && typeof op.id === 'string' && typeof op.on === 'boolean') {
    const doneAt = { ...s.doneAt };
    if (op.on) doneAt[op.id] = now; else delete doneAt[op.id];
    return { ...s, doneAt, doneItems: op.on ? [...new Set([...s.doneItems, op.id])] : s.doneItems.filter(id => id !== op.id) };
  }
  if (op.type === 'member' && ['hiddenItems', 'hiddenCourses', 'before'].includes(op.field) && typeof op.on === 'boolean') {
    if (op.field === 'before' ? ![24, 3, 2, 1].includes(op.value) : typeof op.value !== 'string') throw Error('Invalid member');
    const old = op.field === 'before' ? s.remind.before : s[op.field];
    const list = op.on ? [...new Set([...old, op.value])] : old.filter(x => x !== op.value);
    return op.field === 'before' ? { ...s, remind: { ...s.remind, before: list.sort((a,b) => b-a) } } : { ...s, [op.field]: list };
  }
  if (op.type === 'layout' && ['popup', 'panel'].includes(op.surface)) {
    if (op.list !== null && (!Array.isArray(op.list) || op.list.length > 30 || op.list.some(x => !plain(x) || typeof x.id !== 'string' || typeof x.on !== 'boolean'))) throw Error('Invalid layout');
    const layout = { ...s.layout };
    if (op.list === null) delete layout[op.surface]; else layout[op.surface] = op.list;
    return { ...s, layout };
  }
  if (op.type === 'resetItems') return { ...s, hiddenItems: [], doneItems: [], doneAt: {} };
  throw Error('Invalid settings operation');
}
export function settingsHandler({ getSettings, setSettings, permissions, apply, openOptions, report, serialize = settingsQueue(), now = Date.now }) {
  let active = false;
  const seen = new Set();
  const snapshot = async s => ({ revision: await settingsRevision(s), values: preferences(s),
    notifications: await permissions.contains({ permissions: ['notifications'] }), history: await permissions.contains({ permissions: ['history'] }),
    hiddenCourses: (s.hiddenCourses || []).length, hiddenItems: (s.hiddenItems || []).length });
  return async msg => {
    if (!verbs.includes(msg?.cmd) || typeof msg.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(msg.id) ||
        !Number.isFinite(msg.at) || msg.at > now() || now() - msg.at >= 90000 || seen.has(msg.id)) return;
    if (active) { await report({ id: msg.id, state: 'busy' }); return; }
    seen.add(msg.id); if (seen.size > 100) seen.delete(seen.values().next().value);
    active = true;
    try { await serialize(async () => {
      if (msg.at > now() || now() - msg.at >= 90000) { await report({ id: msg.id, state: 'error' }); return; }
      if (Object.keys(msg).some(k => !['cmd','id','at','revision','patch'].includes(k)) ||
          (msg.cmd !== 'settings_set' && ('patch' in msg || 'revision' in msg))) {
        await report({ id: msg.id, state: 'invalid' }); return;
      }
      if (msg.cmd === 'settings_options') { await openOptions(); await report({ id: msg.id, state: 'opened' }); return; }
      let s = await getSettings();
      if (msg.cmd === 'settings_set') {
        if (!validPatch(msg.patch) || !/^[0-9a-f]{64}$/.test(msg.revision || '')) { await report({ id: msg.id, state: 'invalid' }); return; }
        if (msg.revision !== await settingsRevision(s)) { await report({ id: msg.id, state: 'conflict', snapshot: await snapshot(s) }); return; }
        if ((msg.patch.remind?.on === true && !(await permissions.contains({ permissions: ['notifications'] }))) ||
            (msg.patch.studyLog === true && !(await permissions.contains({ permissions: ['history'] })))) {
          await report({ id: msg.id, state: 'permission_required', snapshot: await snapshot(s) }); return;
        }
        // Re-read after asynchronous permission/hash checks. Merge only allowlisted fields.
        s = await getSettings();
        if (msg.revision !== await settingsRevision(s)) { await report({ id: msg.id, state: 'conflict', snapshot: await snapshot(s) }); return; }
        if (msg.at > now() || now() - msg.at >= 90000) { await report({ id: msg.id, state: 'error' }); return; }
        const next = { ...s, ...msg.patch, remind: { ...s.remind, ...msg.patch.remind }, changes: { ...s.changes, ...msg.patch.changes } };
        await setSettings(next);
        const actual = await getSettings();
        if (await settingsRevision(next) !== await settingsRevision(actual)) { await report({ id: msg.id, state: 'conflict', snapshot: await snapshot(actual) }); return; }
        // This calls the existing scheduler, not a second alarm/notification owner.
        try { await apply(); } catch { await report({ id: msg.id, state: 'apply_failed', snapshot: await snapshot(await getSettings()) }); return; }
        s = await getSettings();
        if (await settingsRevision(next) !== await settingsRevision(s)) { await report({ id: msg.id, state: 'conflict', snapshot: await snapshot(s) }); return; }
      }
      await report({ id: msg.id, state: 'ok', snapshot: await snapshot(s) });
    }); } catch { await report({ id: msg.id, state: 'error' }).catch(() => {}); }
    finally { active = false; }
  };
}
