import { getSettings } from '../lib/sync.js';

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
