// Shared rendering for the popup and the dashboard panel. Plain DOM, no framework.
import { classify, visibleChanges } from './sync.js';

const fmtDue = (ms, now = Date.now()) => {
  const d = new Date(ms);
  const days = Math.floor((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

const decode = (s) => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim(); };
// Titles often repeat the due date ("Assignment 6 (Deadline: Wednesday 23:59, Oct 28)"); the meta line already shows it.
const cleanTitle = (s) => decode(s).replace(/\s*[(（]\s*(deadline|due)[^)）]*[)）]\s*/i, ' ').trim();
const shortCourse = (d) => d.code || (d.course || '').replace(/^School of /, '').split(/\s+/).slice(0, 4).join(' ');

const KIND_LABEL = { materials: 'New material', grades: 'Grade', feedback: 'Feedback', deadlines: 'Reminder',
                     forum: 'Forum', announcements: 'Announcement', other: 'Update' };

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'href') { e.href = v; e.target = '_blank'; e.rel = 'noopener'; }
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

function item(d, now, actions) {
  const urgent = !d.overdue && d.due - now < 48 * 3600000;
  const li = el('li', { class: `item ${d.overdue ? 'overdue' : ''} ${urgent ? 'urgent' : ''}` },
    el('a', { href: d.url || '#', class: 'name', title: decode(d.name) }, cleanTitle(d.name)),
    el('div', { class: 'meta' }, el('span', { class: 'code' }, shortCourse(d)), ' · ',
       el('span', { class: 'due' }, fmtDue(d.due, now)), d.action && d.actionable !== false ? el('span', { class: 'act' }, ` · ${d.action}`) : null,
       d.source ? el('span', { class: 'act' }, ` · from ${d.source}`) : null),
    d.note ? el('div', { class: 'note' }, d.note) : null);
  if (actions) {
    const done = el('button', { class: 'mini', title: "I've handled this" }, '✓');
    const hide = el('button', { class: 'mini', title: 'Hide this item' }, '×');
    done.onclick = () => actions.mark('doneItems', d.id);
    hide.onclick = () => actions.mark('hiddenItems', d.id);
    li.prepend(el('span', { class: 'acts' }, done, hide));
  }
  return li;
}

const ago = (ms, now) => { const d = Math.floor((now - ms) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

export function render(root, { snapshot, status, changes = [], settings, lastSeenAt = 0 }, { compact = false, actions = null } = {}) {
  const now = Date.now();
  root.textContent = '';
  if (!snapshot && status?.state !== 'signed_out') {
    root.append(el('p', { class: 'empty' }, 'Loading Learning Mall… open it once if this stays here.'));
    return;
  }
  if (status?.state === 'signed_out') {
    root.append(el('div', { class: 'banner bad' }, 'Signed out of Learning Mall. ',
      el('a', { href: 'https://core.xjtlu.edu.cn/my/' }, 'Sign in'), ' and this will refresh.'));
  } else if (status?.state === 'site_changed' || status?.state === 'partial') {
    root.append(el('div', { class: 'banner warn' },
      status.state === 'site_changed' ? 'Learning Mall changed and some data could not be read.' : 'Some parts could not be read: ',
      status.errors?.length ? status.errors.slice(0, 2).join('; ') : (status.detail || '')));
  }
  if (!snapshot) return;
  const { missing, upcoming } = classify(snapshot.deadlines, now, settings.windowDays, settings);

  const sec = (title, count, body, cls = '') => el('section', { class: cls }, el('h3', {}, el('span', {}, title), count ? el('span', { class: 'count' }, count) : null), body);

  if (missing.length)
    root.append(sec('Missing', missing.length, el('ul', {}, missing.map((d) => item(d, now, actions))), 'missing'));
  root.append(sec(`Due in the next ${settings.windowDays} days`, upcoming.length,
    upcoming.length ? el('ul', {}, upcoming.slice(0, compact ? 6 : 50).map((d) => item(d, now, actions)), upcoming.length > (compact ? 6 : 50) ? el('li', { class: 'more' }, `+${upcoming.length - (compact ? 6 : 50)} more in the popup`) : null)
                    : el('p', { class: 'empty' }, 'Nothing with a Learning Mall due date. Check module handbooks for others.')));

  const ch = visibleChanges(changes, settings, lastSeenAt).slice(0, compact ? 5 : 30);
  if (ch.length) root.append(sec('What changed', ch.filter((c) => c.unseen).length || null,
    ch.length ? el('ul', {}, ch.map((c) => el('li', { class: `change ${c.unseen ? 'unseen' : ''}` },
      el('span', { class: 'kind' }, KIND_LABEL[c.kind] || c.kind),
      c.url ? el('a', { href: c.url, class: 'name' }, decode(c.title)) : el('span', { class: 'name' }, decode(c.title)),
      el('div', { class: 'meta' }, c.course || ''))))
              : null));

  // Catch up: released material you haven't opened yet, per module (Done marks + optional study log).
  const UTILITY = /appointment|office hours|template|announcement|forum|feedback form|survey/i;
  const eng = (snapshot.engagement || []).map((m) => ({ ...m, unopened: m.unopened.filter((u) => !UTILITY.test(u.name)) }))
    .filter((m) => m.unopened.length && !settings.hiddenCourses.includes(m.courseId));
  if (eng.length) {
    const total = eng.reduce((a, m) => a + m.unopened.length, 0);
    const word = snapshot.studyLog?.visitsMatched ? 'not opened' : 'not done';
    root.append(sec('Catch up', total, el('ul', { class: 'catchup' }, eng.slice(0, compact ? 3 : 10).map((m) =>
      el('li', {},
        compact ? el('div', { class: 'row' }, el('span', { class: 'code' }, m.code), el('span', { class: 'meta' }, ` ${m.unopened.length} ${word}`))
        : el('details', {},
            el('summary', {}, el('span', { class: 'code' }, m.code),
              el('span', { class: 'meta' }, ` ${m.unopened.length} ${word}`,
                m.lastVisit ? ` · last opened ${ago(m.lastVisit, now)}` : '')),
            el('ul', { class: 'sub' }, m.unopened.slice(0, 8).map((u) =>
              el('li', {}, el('a', { href: u.url || '#', class: 'name', title: decode(u.name) }, decode(u.name)))),
              m.unopened.length > 8 ? el('li', { class: 'more' }, el('a', { href: `https://core.xjtlu.edu.cn/course/view.php?id=${m.courseId}` }, `+${m.unopened.length - 8} more on the course page`)) : null)))))));
    if (!snapshot.studyLog?.visitsMatched)
      root.lastChild.append(el('p', { class: 'hint' }, 'From Learning Mall\'s own Done marks. Turn on the study log in Settings to also count what you\'ve opened.'));
  }

  if (!compact) {
    const mods = (snapshot.courses || []).filter((c) => c.code && !settings.hiddenCourses.includes(c.id));
    mods.sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));
    if (mods.length) root.append(sec('Course completion', null, el('ul', { class: 'progress' }, mods.map((c) =>
      el('li', {}, el('a', { href: c.url, class: 'code' }, c.code),
        el('div', { class: 'bar' }, el('div', { class: 'fill', style: `width:${Math.max(0, Math.min(100, c.progress || 0))}%` })),
        el('span', { class: 'pct' }, c.progress == null ? '–' : `${Math.round(c.progress)}%`))))));
  }
  const mins = Math.round((now - snapshot.at) / 60000);
  root.append(el('p', { class: 'foot' }, mins < 1 ? 'Updated just now' : mins < 60 ? `Updated ${mins} min ago` : `Updated ${new Date(snapshot.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`));
}
