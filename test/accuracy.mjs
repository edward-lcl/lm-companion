// Live accuracy check: run the real sync (Node stand-in for the worker) and compare its Missing/Due
// lists with the morning brief's independent per-assignment submission states.
import fs from 'node:fs';
import { parseHTML as lp } from 'linkedom';
import { sync, classify, getSettings } from '../src/lib/sync.js';

const s = JSON.parse(fs.readFileSync(`${process.env.HOME}/.xjtlu-session-mcp/session.json`, 'utf8'));
const cookie = s.cookies.filter((c) => 'core.xjtlu.edu.cn'.endsWith(c.domain.replace(/^\./, ''))).map((c) => `${c.name}=${c.value}`).join('; ');
const fetchImpl = (u, o = {}) => fetch(u, { ...o, headers: { ...(o.headers || {}), cookie } });
const mem = {}; const storage = { get: async (k) => (Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, mem[x]])) : { [k]: mem[k] }), set: async (o) => Object.assign(mem, o) };
await sync({ storage, parseHTML: (h) => lp(h).document, fetchImpl });
const st = await getSettings(storage);
const now = Date.now();
const { missing, upcoming } = classify(mem.snapshot.deadlines, now, 60, st);

const snap = JSON.parse(fs.readFileSync(`${process.env.HOME}/.zero/data/school/snapshot.json`, 'utf8'));
const norm = (x) => String(x || '').toLowerCase().replace(/&amp;/g, '&').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const truth = [];   // assignments not submitted, with a due date from now-7d onward
for (const m of snap.modules) for (const w of m.work) {
  if (w.type !== 'assign' || /^Submitted/i.test(w.submission || '')) continue;
  const due = (w.dates || '').match(/Due:\s*\w+,\s*(\d+\s+\w+\s+\d{4})/)?.[1];
  const t = due ? Date.parse(`${due} UTC`) : null;
  if (!t || t < now - 7 * 86400000) continue;
  truth.push({ code: m.code, name: w.name, due: t });
}
const shown = [...missing, ...upcoming];
const found = (t) => shown.some((d) => d.code === t.code && (norm(d.name).includes(norm(t.name)) || norm(t.name).includes(norm(d.name))));
const caught = truth.filter(found);
const falseMissing = missing.filter((d) => !truth.some((t) => t.code === d.code && (norm(d.name).includes(norm(t.name)) || norm(t.name).includes(norm(d.name)))));
console.log(JSON.stringify({ openAssignmentsInGroundTruth: truth.length, shownByExtension: caught.length,
  recall: `${Math.round(100 * caught.length / Math.max(1, truth.length))}%`,
  missingShown: missing.map((d) => `${d.code} ${d.name.slice(0, 40)}${d.note ? ' [note]' : ''}`),
  missingNotInTruth: falseMissing.map((d) => `${d.code} ${d.name.slice(0, 40)}`),
  notShown: truth.filter((t) => !found(t)).map((t) => `${t.code} ${t.name.slice(0, 50)}`),
  fromCoursePages: mem.snapshot.deadlines.filter((d) => d.source).map((d) => `${d.code} ${d.name.slice(0, 40)}`),
  catchUp: mem.snapshot.engagement.map((m) => `${m.code} unopened ${m.unopened.length}, opened ${m.opened}, unknown ${m.unknown}`) }, null, 1));
