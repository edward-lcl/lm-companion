// End-to-end sync in Node against live Learning Mall with the saved session (read-only).
// Stands in for the extension's offscreen document: same sync() code, Node fetch + linkedom.
import fs from 'node:fs';
import { parseHTML as lp } from 'linkedom';
import { sync, classify, getSettings, visibleChanges } from '../src/lib/sync.js';

const s = JSON.parse(fs.readFileSync(`${process.env.HOME}/.xjtlu-session-mcp/session.json`, 'utf8'));
const cookie = s.cookies.filter((c) => 'core.xjtlu.edu.cn'.endsWith(c.domain.replace(/^\./, ''))).map((c) => `${c.name}=${c.value}`).join('; ');
const fetchImpl = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), cookie } });
const mem = {}; const storage = { get: async (k) => (Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, mem[x]])) : { [k]: mem[k] }), set: async (o) => Object.assign(mem, o) };
const parseHTML = (h) => lp(h).document;

let t = Date.now();
console.log('run 1', await sync({ storage, parseHTML, fetchImpl }), `${Date.now() - t}ms`);
const st = await getSettings(storage);
const { missing, upcoming } = classify(mem.snapshot.deadlines, Date.now(), st.windowDays);
console.log('courses', mem.snapshot.courses.length, 'modules', mem.snapshot.courses.filter((c) => c.code).length,
  'deadlines', mem.snapshot.deadlines.length, 'missing', missing.length, 'upcoming14', upcoming.length,
  'grades', mem.snapshot.grades.length, 'materialIds', mem.snapshot.materialIds.length, 'status', mem.status.state, mem.status.errors);
// Simulate a previous run that lacked one material and one notification: run 2 must report them as new.
mem.snapshot.materialIds = mem.snapshot.materialIds.slice(1);
mem.snapshot.notificationIds = mem.snapshot.notificationIds.slice(1);
t = Date.now();
console.log('run 2', await sync({ storage, parseHTML, fetchImpl }), `${Date.now() - t}ms`);
console.log('changes kinds', mem.changes.map((c) => c.kind), 'visible by default', visibleChanges(mem.changes, st, 0).length);
