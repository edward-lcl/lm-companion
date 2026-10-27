// Data layer: everything LM Companion knows comes through here.
// Reads only, with the student's own Learning Mall session. Never posts, submits or touches quizzes.
// `parseHTML(html)` is injected: DOMParser in the browser, linkedom in tests.

export const BASE = 'https://core.xjtlu.edu.cn';
export const MODULE_CODE = /^([A-Z]{3,4}\d{3}[A-Z]{0,3})-/;

export class SignedOut extends Error {
  constructor() { super('signed_out'); this.code = 'signed_out'; }
}
export class SiteChanged extends Error {
  constructor(what) { super(`site_changed:${what}`); this.code = 'site_changed'; this.what = what; }
}

export function sessionInfo(html) {
  const sesskey = html.match(/"sesskey"\s*:\s*"([^"]+)"/)?.[1] || null;
  const userid = html.match(/data-userid="(\d+)"/)?.[1] || html.match(/[?&]userid="?(\d+)/)?.[1] ||
                 html.match(/"userid"\s*:\s*"?(\d+)/)?.[1] || null;
  return { sesskey, userid: userid ? Number(userid) : null };
}

export function isLoginPage(url, html) {
  return /\/login\/index\.php/.test(url) || (!/id="user-menu-toggle"/.test(html) && /XJTLU Account/.test(html));
}

// Course page: module ids + names + types (materials only matter for "what changed").
export function parseCourseModules(html, parseHTML) {
  const doc = parseHTML(html);
  const items = [];
  for (const li of doc.querySelectorAll('li[id^="module-"]')) {
    const id = li.id.slice(7);
    if (!/^\d+$/.test(id)) continue;
    const type = (li.className.match(/modtype_(\w+)/) || [])[1] || 'unknown';
    const named = li.querySelector('[data-activityname]');
    const name = (named?.getAttribute('data-activityname') ||
                  li.querySelector('.instancename, .activityname')?.textContent || '').replace(/\s+/g, ' ').trim();
    const link = li.querySelector('a[href*="/mod/"]')?.getAttribute('href') || null;
    if (name) items.push({ id, type, name, url: link });
  }
  return items;
}

// Grade overview: one row per course with the course total as shown to the student.
export function parseGradeOverview(html, parseHTML) {
  const doc = parseHTML(html);
  const table = doc.querySelector('table#overview-grade');
  if (!table) throw new SiteChanged('grade_overview');
  const rows = [];
  for (const tr of table.querySelectorAll('tbody tr')) {
    const a = tr.querySelector('a[href*="id="]');
    const cells = tr.querySelectorAll('td');
    if (!a || cells.length < 2) continue;
    const courseId = (a.getAttribute('href').match(/[?&]id=(\d+)/) || [])[1];
    const grade = cells[1].textContent.replace(/\s+/g, ' ').trim();
    if (courseId) rows.push({ courseId, course: a.textContent.replace(/\s+/g, ' ').trim(), grade: grade === '-' ? null : grade });
  }
  return rows;
}

export function moduleCode(name) {
  return (name.match(MODULE_CODE) || [])[1] || null;
}

// Classify a Moodle popup notification into one of LM Companion's change kinds.
export function notificationKind(n) {
  const key = `${n.component}/${n.eventtype}`;
  if (key === 'mod_assign/assign_notification' || /feedback|graded/i.test(n.subject || '')) return 'feedback';
  if (/assign_due_soon|assign_overdue|_due|duedate/.test(key)) return 'deadlines';
  if (n.component === 'mod_forum') return /announcement|news/i.test(`${n.contexturlname} ${n.subject}`) ? 'announcements' : 'forum';
  if (n.component === 'moodle' && n.eventtype === 'newlogin') return null; // security notice, not coursework
  return 'other';
}

export class Moodle {
  constructor({ fetch: f = fetch, parseHTML, parse }) {
    this.fetch = f;
    this.parseHTML = parseHTML;
    this.parse = parse;   // optional async (parserName, html) => value, used by the extension worker
    this.session = null;
  }

  async page(path) {
    const r = await this.fetch(BASE + path, { credentials: 'include', redirect: 'follow' });
    const html = await r.text();
    if (isLoginPage(r.url, html)) throw new SignedOut();
    if (!r.ok) throw new SiteChanged(`http_${r.status}:${path}`);
    return html;
  }

  async connect() {
    const html = await this.page('/my/courses.php');
    const s = sessionInfo(html);
    if (!s.sesskey || !s.userid) throw new SiteChanged('sesskey');
    this.session = s;
    return s;
  }

  // Read-only Moodle AJAX methods only (the same ones Learning Mall's own pages call).
  async ajax(methodname, args) {
    if (!READ_METHODS.has(methodname)) throw new Error(`not a read method: ${methodname}`);
    if (!this.session) await this.connect();
    const r = await this.fetch(`${BASE}/lib/ajax/service.php?sesskey=${encodeURIComponent(this.session.sesskey)}&info=${methodname}`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname, args }]) });
    let j;
    try { j = await r.json(); } catch { throw new SiteChanged(`ajax_json:${methodname}`); }
    const res = Array.isArray(j) ? j[0] : j;
    if (res?.error) {
      if (/servicerequireslogin|requirelogin|invalidsesskey/.test(res.exception?.errorcode || '')) throw new SignedOut();
      throw new SiteChanged(`ajax:${methodname}:${res.exception?.errorcode || 'error'}`);
    }
    return res.data;
  }

  async courses() {
    const out = []; let offset = 0;
    for (let i = 0; i < 10; i++) {
      const d = await this.ajax('core_course_get_enrolled_courses_by_timeline_classification',
        { classification: 'inprogress', limit: 100, offset, sort: 'fullname ASC' });
      for (const c of d.courses) out.push({ id: String(c.id), name: c.fullname || c.shortname,
        code: moduleCode(c.fullname || c.shortname || ''), progress: c.progress ?? null, url: `${BASE}/course/view.php?id=${c.id}` });
      const next = Number(d.nextoffset);
      if (!Number.isFinite(next) || next <= offset || !d.courses.length) break;
      offset = next;
    }
    return out;
  }

  // Everything with a Moodle due date: from 7 days ago (to catch overdue) to `days` ahead.
  async deadlines(days = 30) {
    const now = Math.floor(Date.now() / 1000);
    const events = []; let after = 0;
    for (let i = 0; i < 6; i++) {
      const d = await this.ajax('core_calendar_get_action_events_by_timesort', {
        timesortfrom: now - 14 * 86400, timesortto: now + days * 86400, limitnum: 50, ...(after ? { aftereventid: after } : {}) });
      const batch = d.events || [];
      events.push(...batch);
      if (batch.length < 50) break;
      after = batch.at(-1).id;
    }
    return events.map((e) => ({
      id: String(e.instance ? `${e.modulename}:${e.instance}` : e.id),
      name: e.activityname || e.name, type: e.modulename, due: e.timesort * 1000,
      courseId: e.course?.id ? String(e.course.id) : null,
      course: e.course?.fullname || e.course?.shortname || '', code: moduleCode(e.course?.fullname || ''),
      overdue: !!e.overdue, action: e.action?.name || null, actionable: !!e.action?.actionable,
      url: e.url || e.action?.url || null }));
  }

  async notifications(limit = 50) {
    if (!this.session) await this.connect();
    const d = await this.ajax('message_popup_get_popup_notifications',
      { useridto: this.session.userid, newestfirst: 1, limit, offset: 0 });
    return (d.notifications || []).map((n) => ({ id: String(n.id), kind: notificationKind(n),
      subject: n.subject, course: n.contexturlname || '', url: n.contexturl || null, at: n.timecreated * 1000 }))
      .filter((n) => n.kind);
  }

  async grades() {
    const html = await this.page('/grade/report/overview/index.php');
    return this.parse ? this.parse('gradeOverview', html) : parseGradeOverview(html, this.parseHTML);
  }

  async materials(courseId) {
    const html = await this.page(`/course/view.php?id=${encodeURIComponent(courseId)}`);
    const items = this.parse ? await this.parse('courseModules', html) : parseCourseModules(html, this.parseHTML);
    return items.filter((m) => ['resource', 'folder', 'page', 'url', 'book', 'lesson', 'assign', 'quiz'].includes(m.type));
  }
}

export const READ_METHODS = new Set([
  'core_course_get_enrolled_courses_by_timeline_classification',
  'core_calendar_get_action_events_by_timesort',
  'message_popup_get_popup_notifications',
]);
