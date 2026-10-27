import { render, renderLayoutEditor, resolveLayout } from '../lib/view.js';
import { getSettings } from '../lib/sync.js';
import { setLang, t, applyI18n } from '../lib/i18n.js';

const storage = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };
const root = document.getElementById('root');

const actions = {
  async mark(list, id) {
    const s = await getSettings(storage);
    s[list] = [...new Set([...(s[list] || []), id])];
    await chrome.storage.local.set({ settings: s });
    chrome.runtime.sendMessage({ cmd: 'settings_changed' });
  },
};
let editing = false;
async function draw() {
  const data = await chrome.storage.local.get(['snapshot', 'status', 'changes', 'lastSeenAt']);
  const settings = await getSettings(storage);
  setLang(settings.lang);
  applyI18n();
  if (editing) return drawEditor(settings);
  render(root, { ...data, settings }, { actions, surface: 'popup' });
}
function drawEditor(settings) {
  root.textContent = '';
  const bar = document.createElement('div'); bar.className = 'editbar';
  bar.innerHTML = '<small></small><span><button type="button" class="ghost reset"></button><button type="button" class="done"></button></span>';
  bar.querySelector('small').textContent = t('ed_title');
  bar.querySelector('.reset').textContent = t('ed_reset');
  bar.querySelector('.done').textContent = t('ed_done');
  const ol = document.createElement('ol');
  root.append(bar, ol);
  const save = async (list) => {
    const s = await getSettings(storage);
    s.layout = { ...(s.layout || {}), popup: list };
    await chrome.storage.local.set({ settings: s });
  };
  renderLayoutEditor(ol, resolveLayout(settings.layout?.popup, 'popup'), save);
  bar.querySelector('.done').onclick = () => { editing = false; draw(); };
  bar.querySelector('.reset').onclick = async (e) => {
    if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = t('ed_reset_q'); setTimeout(() => { delete e.target.dataset.armed; e.target.textContent = t('ed_reset'); }, 2500); return; }
    const s = await getSettings(storage); const l = { ...(s.layout || {}) }; delete l.popup; s.layout = l;
    await chrome.storage.local.set({ settings: s });
  };
  const more = document.createElement('p'); more.className = 'hint';
  const a = document.createElement('a'); a.href = '../options/options.html'; a.target = '_blank'; a.textContent = t('ed_settings');
  more.append(t('ed_more'), a);
  root.append(more);
}
document.getElementById('edit').onclick = () => { editing = !editing; draw(); };

await draw();
// Opening the popup marks changes as seen (after drawing, so they still show as new this time).
await chrome.storage.local.set({ lastSeenAt: Date.now() });
chrome.runtime.sendMessage({ cmd: 'badge' });

document.getElementById('refresh').onclick = async (e) => {
  e.currentTarget.disabled = true;
  await chrome.runtime.sendMessage({ cmd: 'refresh' });
  await draw();
  document.getElementById('refresh').disabled = false;
};
chrome.storage.onChanged.addListener(draw);
