import fs from 'node:fs';
import { parseHTML as lp } from 'linkedom';
import { Moodle } from '../src/lib/moodle.js';
const s = JSON.parse(fs.readFileSync(`${process.env.HOME}/.xjtlu-session-mcp/session.json`, 'utf8'));
const cookie = s.cookies.filter((c) => 'core.xjtlu.edu.cn'.endsWith(c.domain.replace(/^\./, ''))).map((c) => `${c.name}=${c.value}`).join('; ');
const m = new Moodle({ fetch: (u, o = {}) => fetch(u, { ...o, headers: { ...(o.headers || {}), cookie } }), parseHTML: (h) => lp(h).document });
for (const d of await m.deadlines(45)) if (d.overdue || d.due < Date.now() + 3 * 86400000)
  console.log((d.code || d.course.slice(0, 12)).padEnd(12), d.name.slice(0, 40).padEnd(40), 'overdue', d.overdue, 'actionable', d.actionable, d.action);
