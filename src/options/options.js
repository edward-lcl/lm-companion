import { getSettings } from '../lib/sync.js';
import { resolveLayout, renderLayoutEditor } from '../lib/view.js';

const storage = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };
const $ = (s) => document.querySelector(s);
let s = await getSettings(storage);

const save = async () => {
  await chrome.storage.local.set({ settings: s });
  chrome.runtime.sendMessage({ cmd: 'settings_changed' });
  $('#saved').style.opacity = 1; setTimeout(() => ($('#saved').style.opacity = 0), 900);
};

$('#showPanel').checked = s.showPanel;
$('#showPanel').onchange = (e) => { s.showPanel = e.target.checked; save(); };

// Section layout editor (shared with the popup's Customize mode).
let surface = 'popup';
const drawLayout = () => renderLayoutEditor($('#layout'), resolveLayout(s.layout?.[surface], surface),
  (list) => { s.layout = { ...(s.layout || {}), [surface]: list }; save(); drawLayout(); });
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
  surface = b.dataset.surface;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  drawLayout();
};
$('#resetLayout').onclick = () => { const l = { ...(s.layout || {}) }; delete l[surface]; s.layout = l; save(); drawLayout(); };
drawLayout();
$('#onlyModules').checked = s.onlyModules;
$('#onlyModules').onchange = (e) => { s.onlyModules = e.target.checked; save(); };
const hiddenLabel = () => { $('#hiddenCount').textContent = `${s.hiddenItems.length + s.doneItems.length} item(s) hidden or marked done.`; };
hiddenLabel();
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
    l.innerHTML = '<span></span><input type="checkbox">';
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
