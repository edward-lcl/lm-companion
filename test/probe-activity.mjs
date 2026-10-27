// Read-only probe: which of Moodle's own "your activity" reports does XJTLU let a student see?
// Prints status + shape only (row counts, column headers), never contents.
import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync(`${process.env.HOME}/.xjtlu-session-mcp/session.json`, 'utf8'));
const cookie = s.cookies.filter((c) => 'core.xjtlu.edu.cn'.endsWith(c.domain.replace(/^\./, ''))).map((c) => `${c.name}=${c.value}`).join('; ');
const B = 'https://core.xjtlu.edu.cn';
const get = async (p) => { const r = await fetch(B + p, { headers: { cookie }, redirect: 'manual' }); return [r.status, r.headers.get('location'), await r.text()]; };
const [, , my] = await get('/my/courses.php');
const uid = my.match(/data-userid="(\d+)"/)?.[1];
const courses = JSON.parse(fs.readFileSync(new URL('./fixtures/private/courses.json', import.meta.url)));
const c = courses.find((x) => /MTH015/.test(x.name));
const shape = (h) => {
  const tables = (h.match(/<table/g) || []).length;
  const rows = (h.match(/<tr/g) || []).length;
  const heads = [...h.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].slice(0, 8).map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const err = /(nopermission|You do not have permission|errorcode|Sorry, but you do not currently have permissions)/i.test(h);
  return { tables, rows, heads, err, title: (h.match(/<title>([^<]*)/) || [])[1] };
};
for (const [label, p] of [
  ['outline report (own)', `/report/outline/user.php?id=${uid}&course=${c.id}&mode=outline`],
  ['complete report (own)', `/report/outline/user.php?id=${uid}&course=${c.id}&mode=complete`],
  ['all logs (own, course)', `/report/log/user.php?id=${uid}&course=${c.id}&mode=all`],
  ['today logs (own, course)', `/report/log/user.php?id=${uid}&course=${c.id}&mode=today`],
  ['activity completion (own)', `/blocks/completionstatus/details.php?course=${c.id}&user=${uid}`],
  ['course completion report', `/report/progress/index.php?course=${c.id}`],
  ['profile course list', `/user/profile.php?id=${uid}`],
]) {
  const [st, loc, h] = await get(p);
  const sh = shape(h);
  console.log(label.padEnd(28), st, loc ? 'redirect' : '', JSON.stringify({ ...sh, title: sh.title?.slice(0, 50) }));
  if (st === 200 && !sh.err) fs.writeFileSync(new URL(`./fixtures/private/${label.split(' ')[0]}-${label.includes('complete') ? 'complete' : label.includes('today') ? 'today' : 'x'}.html`, import.meta.url), h);
}
