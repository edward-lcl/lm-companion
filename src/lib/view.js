// Shared rendering for the popup and the dashboard panel. Plain DOM, no framework.
import { classify, visibleChanges } from './sync.js';
import { t, tAction, locale } from './i18n.js';
import { eventKind, week as buildWeek, toICS } from './calendar.js';
import { checklist } from './reminders.js';
import { countdown, freshness } from './time.js';

const fmtTime = (d) => d.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', hour12: !locale() });
const fmtDue = (ms, now = Date.now()) => {
  const d = new Date(ms);
  const days = Math.floor((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  const time = fmtTime(d);
  if (days < 0 || ms < now) return days < 0 ? t('overdue_days', { n: -days }) : t('overdue_hours', { n: Math.max(1, Math.round((now - ms) / 3600000)) });
  const cd = countdown(ms, now);
  if (cd) return `${cd.h < 1 ? t('cd_m', { m: cd.m }) : t('cd_hm', { h: cd.h, m: cd.m })} · ${time}`;
  if (days === 0) return `${t('today')} ${time}`;
  if (days === 1) return `${t('tomorrow')} ${time}`;
  const date = d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
  return `${date} ${d.toLocaleDateString(locale(), { weekday: 'short' })} ${time}`;
};

// Decode HTML entities from Moodle titles without innerHTML (DOMParser builds an inert document).
const decode = (s) => { const x = new DOMParser().parseFromString(`<!doctype html><body>${String(s || '')}`, 'text/html').body.textContent || ''; return x.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim(); };
// Titles often repeat the due date ("Assignment 6 (Deadline: Wednesday 23:59, Oct 28)"); the meta line already shows it.
const cleanTitle = (s) => decode(s).replace(/\s*[(（]\s*(deadline|due)[^)）]*[)）]\s*/i, ' ').trim();
// Week chips are ~44px wide: stack the subject letters over the number so codes never truncate.
const chipLabel = (d) => { const m = /^([A-Z]{2,4})(\d{3}[A-Z]{0,2})$/.exec(d.code || ''); return m ? [el('span', { class: 'cl' }, m[1]), el('span', { class: 'cn' }, m[2])] : shortCourse(d); };
const shortCourse = (d) => d.code || (d.course || '').replace(/^School of /, '').split(/\s+/).slice(0, 4).join(' ');

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
  const kind = eventKind(d);
  const li = el('li', { class: `item k-${kind} ${d.overdue ? 'overdue' : ''} ${urgent ? 'urgent' : ''}` },
    el('a', { href: d.url || '#', class: 'name', title: decode(d.name) }, cleanTitle(d.name)),
    el('div', { class: 'meta' }, el('span', { class: 'code' }, shortCourse(d)), ' · ',
       el('span', { class: 'due' }, fmtDue(d.due, now)),
       d.action && d.actionable !== false ? [' · ', el('a', { href: d.url || '#', class: 'go' }, tAction(d.action), ' ›')]
         : null,
       d.source ? el('span', { class: 'act' }, ` · ${t('from_source', { s: t('src_course') })}`) : null),
    d.note ? el('div', { class: 'note' }, `⚠ ${t('note_closed')}`) : null);
  if (actions) {
    const done = el('button', { class: 'mini', title: t('btn_done') }, '✓');
    const hide = el('button', { class: 'mini', title: t('btn_hide') }, '×');
    done.onclick = () => actions.mark('doneItems', d.id);
    hide.onclick = () => actions.mark('hiddenItems', d.id);
    li.prepend(el('span', { class: 'acts' }, done, hide));
  }
  return li;
}

const ago = (ms, now) => { const d = Math.floor((now - ms) / 86400000); return d <= 0 ? t('ago_today') : d === 1 ? t('ago_yesterday') : t('ago_days', { n: d }); };

// Sections are a registry. The user's layout (per surface: popup / panel) is an ordered list of
// { id, on }. New sections appear automatically in saved layouts.
export const SECTIONS = ['today', 'missing', 'due', 'week', 'changes', 'catchup', 'completion']
  .map((id) => ({ id, get label() { return t(`sec_${id}`); }, get hint() { return t(`sec_${id}_hint`); } }));
export const DEFAULT_LAYOUT = {
  popup: [{ id: 'today', on: true }, { id: 'missing', on: false }, { id: 'week', on: true }, { id: 'due', on: true }, { id: 'changes', on: true },
          { id: 'catchup', on: true }, { id: 'completion', on: true }],
  panel: [{ id: 'today', on: true }, { id: 'missing', on: true }, { id: 'due', on: true }, { id: 'week', on: false }, { id: 'changes', on: true },
          { id: 'catchup', on: true }, { id: 'completion', on: false }],
};
// Merge a saved layout with the registry: keeps the user's order, drops unknown ids, appends new
// sections at their default position relative to the sections before them.
export function resolveLayout(saved, surface) {
  const base = DEFAULT_LAYOUT[surface] || DEFAULT_LAYOUT.popup;
  const known = new Set(SECTIONS.map((s) => s.id));
  const out = (saved || []).filter((x) => known.has(x.id)).map((x) => ({ ...x }));
  base.forEach((d, i) => {
    if (out.some((x) => x.id === d.id)) return;
    const prev = base.slice(0, i).reverse().find((p) => out.some((x) => x.id === p.id));
    const at = prev ? out.findIndex((x) => x.id === prev.id) + 1 : 0;
    out.splice(at, 0, { ...d });
  });
  return out;
}

// Editor for one surface's layout: toggle + reorder (buttons and drag). Calls onChange(newList).
export function renderLayoutEditor(ol, list, onChange) {
  ol.textContent = '';
  ol.classList.add('layout');
  list.forEach((entry, i) => {
    const meta = SECTIONS.find((x) => x.id === entry.id);
    const box = el('input', { type: 'checkbox', class: 'switch', 'aria-label': t('show_x', { x: meta.label }) });
    box.checked = entry.on;
    const up = el('button', { type: 'button', class: 'up', title: t('move_up') }, '↑');
    const down = el('button', { type: 'button', class: 'down', title: t('move_down') }, '↓');
    up.disabled = i === 0; down.disabled = i === list.length - 1;
    const li = el('li', { class: entry.on ? '' : 'off', draggable: 'true', 'data-id': entry.id },
      el('span', { class: 'grip' }, '⋮⋮'), el('span', { class: 'txt' }, el('strong', {}, meta.label), el('small', {}, meta.hint)),
      up, down, box);
    const copy = () => list.map((x) => ({ ...x }));
    box.onchange = () => { const l = copy(); l[i].on = box.checked; onChange(l); };
    const move = (d) => { const l = copy(); [l[i], l[i + d]] = [l[i + d], l[i]]; onChange(l); };
    up.onclick = () => move(-1); down.onclick = () => move(1);
    li.ondragstart = (e) => { li.classList.add('dragging'); e.dataTransfer.setData('text/plain', entry.id); };
    li.ondragend = () => li.classList.remove('dragging');
    li.ondragover = (e) => e.preventDefault();
    li.ondrop = (e) => {
      e.preventDefault();
      const l = copy(); const from = l.findIndex((x) => x.id === e.dataTransfer.getData('text/plain'));
      if (from < 0 || from === i) return;
      const [m] = l.splice(from, 1); l.splice(i, 0, m); onChange(l);
    };
    ol.append(li);
  });
}

function downloadICS(deadlines) {
  const blob = new Blob([toICS(deadlines)], { type: 'text/calendar;charset=utf-8' });
  const a = el('a', {}); a.href = URL.createObjectURL(blob); a.download = 'learning-mall-deadlines.ics';
  a.removeAttribute('target');
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function render(root, { snapshot, status, changes = [], settings, lastSeenAt = 0, needsAccess = false }, { compact = false, actions = null, surface = 'popup' } = {}) {
  const now = Date.now();
  root.textContent = '';
  // Firefox/Zen: host access is opt-in. Without it requests go out without your Learning Mall login.
  if (needsAccess) {
    const btn = el('button', { type: 'button', class: 'grant' }, t('grant_btn'));
    btn.onclick = () => actions?.grant?.();
    root.append(el('div', { class: 'banner warn grantbox' }, el('div', {}, t('grant_msg')), btn));
    return;
  }
  if (!snapshot && status?.state !== 'signed_out') {
    root.append(el('p', { class: 'empty' }, t('loading')));
    return;
  }
  if (status?.state === 'signed_out') {
    root.append(el('div', { class: 'banner bad' }, t('signed_out'), ' ',
      el('a', { href: 'https://core.xjtlu.edu.cn/my/' }, t('sign_in')), t('refresh_after')));
  } else if (status?.state === 'site_changed' || status?.state === 'partial') {
    root.append(el('div', { class: 'banner warn' },
      status.state === 'site_changed' ? t('site_changed') : t('partial'),
      status.errors?.length ? status.errors.slice(0, 2).join('; ') : (status.detail || '')));
  }
  if (!snapshot) return;
  const fresh = freshness(snapshot.at, settings.refreshMinutes, now);
  if (status?.state !== 'signed_out' && (fresh === 'stale' || fresh === 'old'))
    root.append(el('div', { class: 'banner stale' }, t('stale', { t: new Date(snapshot.at).toLocaleString(locale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' }) })));
  root.classList.toggle('is-stale', fresh !== 'fresh' || status?.state === 'signed_out');
  const { missing, upcoming } = classify(snapshot.deadlines, now, settings.windowDays, settings);
  const sec = (title, count, body, cls = '') => el('section', { class: `lmc-card ${cls}` }, el('h3', {}, el('span', {}, title), count ? el('span', { class: 'count' }, count) : null), body);
  const dueLimit = compact ? 6 : 50;

  const build = {
    // Daily checklist: overdue + due today + due before noon tomorrow, with tick boxes.
    today: () => {
      const c = checklist(snapshot.deadlines, now, settings);
      const row = (d, isDone) => {
        const box = el('input', { type: 'checkbox', class: 'tick', 'aria-label': t('btn_done') });
        box.checked = isDone;
        if (actions?.tick) box.onchange = () => actions.tick(d.id, box.checked); else box.disabled = true;
        const li = el('li', { class: `check k-${eventKind(d)} ${isDone ? 'done' : ''} ${d.overdue ? 'overdue' : ''}` }, box,
          el('div', { class: 'body' },
            el('a', { href: d.url || '#', class: 'name', title: decode(d.name) }, cleanTitle(d.name)),
            el('div', { class: 'meta' }, el('span', { class: 'code' }, shortCourse(d)), ' · ', el('span', { class: 'due' }, fmtDue(d.due, now)),
              !isDone && d.action && d.actionable !== false ? [' · ', el('a', { href: d.url || '#', class: 'go' }, tAction(d.action), ' ›')] : null),
            !isDone && d.note ? el('div', { class: 'note' }, `⚠ ${t('note_closed')}`) : null));
        return li;
      };
      const head = t('today_title', { d: new Date(now).toLocaleDateString(locale(), { month: 'short', day: 'numeric', weekday: 'short' }) });
      if (!c.total) return sec(head, null, el('p', { class: 'empty clear' }, '✓ ', t('today_clear')), 'today');
      const s = sec(head, c.todo.length || null, el('ul', { class: 'checklist' },
        c.todo.slice(0, compact ? 5 : 20).map((d) => row(d, false)), c.done.map((d) => row(d, true))), 'today');
      if (c.done.length) s.querySelector('h3').append(el('span', { class: 'prog' }, t('today_done', { a: c.done.length, b: c.total })));
      return s;
    },

    missing: () => missing.length
      ? sec(t('sec_missing'), missing.length, el('ul', {}, missing.map((d) => item(d, now, actions))), 'missing') : null,

    due: () => sec(t('due_title', { n: settings.windowDays }), upcoming.length,
      upcoming.length ? el('ul', {}, upcoming.slice(0, dueLimit).map((d) => item(d, now, actions)),
                           upcoming.length > dueLimit ? el('li', { class: 'more' }, t('more_popup', { n: upcoming.length - dueLimit })) : null)
                      : el('p', { class: 'empty' }, t('empty_due'))),

    // Seven day columns; each deadline is a chip coloured by type (assignment / quiz / exam·mock).
    week: () => {
      const visible = classify(snapshot.deadlines, now, 7, settings);
      const pool = [...visible.upcoming, ...visible.missing.filter((d) => d.due >= new Date(now).setHours(0, 0, 0, 0))];
      const days = buildWeek(pool, now, 7);
      const grid = el('div', { class: 'week' }, days.map((day, i) => {
        const d = new Date(day.date);
        return el('div', { class: `day ${i === 0 ? 'today' : ''} ${day.items.length ? '' : 'free'}` },
          el('div', { class: 'dow' }, d.toLocaleDateString(locale(), { weekday: 'short' })),
          el('div', { class: 'dnum' }, d.getDate(), (i > 0 && d.getDate() === 1) ? el('span', { class: 'mon' }, d.toLocaleDateString(locale(), { month: 'short' })) : null),
          el('div', { class: 'chips' }, day.items.slice(0, 3).map((x) =>
            el('a', { href: x.url || '#', class: `chip k-${eventKind(x)}`, title: `${shortCourse(x)} · ${cleanTitle(x.name)} · ${fmtTime(new Date(x.due))}` },
              chipLabel(x))),
            day.items.length > 3 ? el('span', { class: 'chip more' }, `+${day.items.length - 3}`) : null));
      }));
      const present = new Set(days.flatMap((d) => d.items.map(eventKind)));
      const legend = present.size ? el('div', { class: 'legend' },
        ['assign', 'quiz', 'exam', 'other'].filter((k) => present.has(k)).map((k) => el('span', { class: `lg k-${k}` }, t(`t_${k}`)))) : null;
      const s = sec(t('sec_week'), null, el('div', {}, grid, compact || !legend ? null : legend));
      if (!compact) {
        const cal = el('button', { type: 'button', class: 'ics', title: t('ics_hint') }, el('span', { class: 'calplus' }), t('ics'));
        const all = classify(snapshot.deadlines, now, 365, settings);
        cal.onclick = () => downloadICS([...all.missing, ...all.upcoming]);
        s.querySelector('h3').append(cal);
        s.append(el('p', { class: 'hint' }, t('ics_sync'), el('a', { href: 'https://core.xjtlu.edu.cn/calendar/export.php', class: 'go' }, t('ics_lm'), ' ›')));
      }
      return s;
    },

    changes: () => {
      const ch = visibleChanges(changes, settings, lastSeenAt).slice(0, compact ? 5 : 30);
      return ch.length ? sec(t('sec_changes'), ch.filter((c) => c.unseen).length || null,
        el('ul', {}, ch.map((c) => el('li', { class: `change ${c.unseen ? 'unseen' : ''}` },
          el('span', { class: 'kind' }, t(`k_${c.kind}`)),
          c.url ? el('a', { href: c.url, class: 'name' }, decode(c.title)) : el('span', { class: 'name' }, decode(c.title)),
          el('div', { class: 'meta' }, c.course || ''))))) : null;
    },

    // Released material you haven't done or opened, per module (Done marks + optional study log).
    catchup: () => {
      const UTILITY = /appointment|office hours|template|announcement|forum|feedback form|survey/i;
      const eng = (snapshot.engagement || []).map((m) => ({ ...m, unopened: m.unopened.filter((u) => !UTILITY.test(u.name)) }))
        .filter((m) => m.unopened.length && !settings.hiddenCourses.includes(m.courseId))
        .sort((a, b) => b.unopened.length - a.unopened.length);
      if (!eng.length) return null;
      const total = eng.reduce((a, m) => a + m.unopened.length, 0);
      const word = snapshot.studyLog?.visitsMatched ? t('not_opened') : t('not_done');
      const s = sec(t('sec_catchup'), total, el('ul', { class: 'catchup' }, eng.slice(0, compact ? 3 : 10).map((m) =>
        el('li', {},
          compact ? el('div', { class: 'row' }, el('span', { class: 'code' }, m.code), el('span', { class: 'meta' }, ` ${m.unopened.length} ${word}`))
          : el('details', {},
              el('summary', {}, el('span', { class: 'code' }, m.code),
                el('span', { class: 'meta' }, ` ${m.unopened.length} ${word}`, m.lastVisit ? ` · ${t('last_opened', { ago: ago(m.lastVisit, now) })}` : '')),
              el('ul', { class: 'sub' }, m.unopened.slice(0, 8).map((u) =>
                el('li', {}, el('a', { href: u.url || '#', class: 'name', title: decode(u.name) }, decode(u.name)))),
                m.unopened.length > 8 ? el('li', { class: 'more' }, el('a', { href: `https://core.xjtlu.edu.cn/course/view.php?id=${m.courseId}` }, t('more_course', { n: m.unopened.length - 8 }))) : null))))));
      if (!snapshot.studyLog?.visitsMatched && !compact) s.append(el('p', { class: 'hint' }, t('catchup_hint')));
      return s;
    },

    completion: () => {
      const mods = (snapshot.courses || []).filter((c) => c.code && !settings.hiddenCourses.includes(c.id))
        .sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));
      return mods.length ? sec(t('sec_completion'), null, el('ul', { class: 'progress' }, mods.map((c) =>
        el('li', {}, el('a', { href: c.url, class: 'code' }, c.code),
          el('div', { class: 'bar' }, el('div', { class: 'fill', style: `width:${Math.max(0, Math.min(100, c.progress || 0))}%` })),
          el('span', { class: 'pct' }, c.progress == null ? '–' : `${Math.round(c.progress)}%`))))) : null;
    },
  };

  const layout = resolveLayout(settings.layout?.[surface], surface);
  let shown = 0;
  for (const { id, on } of layout) {
    if (!on || !build[id]) continue;
    const node = build[id]();
    if (node) { node.dataset.section = id; root.append(node); shown++; }
  }
  if (!shown) root.append(el('p', { class: 'empty' }, t('all_off')));
  const mins = Math.round((now - snapshot.at) / 60000);
  root.append(el('p', { class: 'foot' }, mins < 1 ? t('updated_now') : mins < 60 ? t('updated_min', { n: mins })
    : t('updated_at', { t: new Date(snapshot.at).toLocaleString(locale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' }) })));
}
