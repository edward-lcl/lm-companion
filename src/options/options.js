import { getSettings } from '../lib/sync.js';
import { resolveLayout, renderLayoutEditor } from '../lib/view.js';
import { setLang, t, applyI18n } from '../lib/i18n.js';

const storage = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };
const $ = (s) => document.querySelector(s);
let s = await getSettings(storage);

const save = async () => {
  await chrome.storage.local.set({ settings: s });
  chrome.runtime.sendMessage({ cmd: 'settings_changed' });
  $('#saved').style.opacity = 1; setTimeout(() => ($('#saved').style.opacity = 0), 900);
};

function translate() {
  setLang(s.lang);
  applyI18n();
  document.title = t('app');
  hiddenLabel();
  drawLayout();
}

$('#lang').value = s.lang || 'auto';
$('#lang').onchange = (e) => { s.lang = e.target.value; save(); translate(); };

// Reminders (notifications are an optional permission, requested from this click).
const remindGroup = $('#remindOn').closest('.group');
const syncRemindUI = () => remindGroup.classList.toggle('off', !s.remind.on);
$('#remindOn').checked = s.remind.on && (await chrome.permissions.contains({ permissions: ['notifications'] }));
s.remind.on = $('#remindOn').checked; syncRemindUI();
$('#remindOn').onchange = async (e) => {
  if (e.target.checked) { const ok = await chrome.permissions.request({ permissions: ['notifications'] }); e.target.checked = ok; s.remind.on = ok; }
  else s.remind.on = false;
  syncRemindUI(); await save();
};
$('#morningOn').checked = s.remind.morning;
$('#morningOn').onchange = (e) => { s.remind.morning = e.target.checked; save(); };
$('#morningAt').value = s.remind.morningAt;
$('#morningAt').onchange = (e) => { s.remind.morningAt = e.target.value || '08:00'; save(); };
for (const b of document.querySelectorAll('[data-before]')) {
  const h = Number(b.dataset.before);
  b.checked = s.remind.before.includes(h);
  b.onchange = () => { s.remind.before = b.checked ? [...new Set([...s.remind.before, h])].sort((x, y) => y - x) : s.remind.before.filter((x) => x !== h); save(); };
}
$('#testNotify').onclick = () => chrome.notifications?.create('test', { type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: t('n_test'), message: t('n_test_body') });

$('#showPanel').checked = s.showPanel;
$('#showPanel').onchange = (e) => { s.showPanel = e.target.checked; save(); };

// Section layout editor (shared with the popup's Customize mode).
let surface = 'popup';
function drawLayout() {
  renderLayoutEditor($('#layout'), resolveLayout(s.layout?.[surface], surface),
    (list) => { s.layout = { ...(s.layout || {}), [surface]: list }; save(); drawLayout(); });
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
  surface = b.dataset.surface;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  drawLayout();
};
$('#resetLayout').onclick = () => { const l = { ...(s.layout || {}) }; delete l[surface]; s.layout = l; save(); drawLayout(); };

$('#onlyModules').checked = s.onlyModules;
$('#onlyModules').onchange = (e) => { s.onlyModules = e.target.checked; save(); };
function hiddenLabel() { const n = s.hiddenItems.length + s.doneItems.length; $('#hiddenCount').textContent = t('o_hidden_n', { n }); $('#resetItems').disabled = !n; }
$('#resetItems').onclick = () => { s.hiddenItems = []; s.doneItems = []; hiddenLabel(); save(); };
$('#studyLog').checked = s.studyLog && (await chrome.permissions.contains({ permissions: ['history'] }));
$('#studyLog').onchange = async (e) => {
  if (e.target.checked) {
    const ok = await chrome.permissions.request({ permissions: ['history'] });   // must be in the click handler
    e.target.checked = ok;
    s.studyLog = ok;
  } else {
    s.studyLog = false;
    await chrome.permissions.remove({ permissions: ['history'] });
  }
  await save();
  chrome.runtime.sendMessage({ cmd: 'refresh' });
};
for (const id of ['windowDays', 'refreshMinutes']) {
  $(`#${id}`).value = String(s[id]);
  $(`#${id}`).onchange = (e) => { s[id] = Number(e.target.value); save(); };
}
for (const box of document.querySelectorAll('[data-change]')) {
  box.checked = !!s.changes[box.dataset.change];
  box.onchange = () => { s.changes[box.dataset.change] = box.checked; save(); };
}

const { snapshot } = await chrome.storage.local.get('snapshot');
const mods = (snapshot?.courses || []).filter((c) => c.code);
if (mods.length) {
  const wrap = $('#modules'); wrap.textContent = '';
  for (const c of mods) {
    const l = document.createElement('label');
    l.innerHTML = '<span></span><input type="checkbox" class="switch">';
    l.querySelector('span').textContent = c.name;
    const box = l.querySelector('input');
    box.checked = !s.hiddenCourses.includes(c.id);
    box.onchange = () => {
      s.hiddenCourses = box.checked ? s.hiddenCourses.filter((x) => x !== c.id) : [...s.hiddenCourses, c.id];
      save();
    };
    wrap.append(l);
  }
}
translate();
