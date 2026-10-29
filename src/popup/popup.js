import { render, renderLayoutEditor, resolveLayout } from '../lib/view.js';
import { companionMode, renderCompanion } from '../lib/bar.js';
import { getSettings } from '../lib/sync.js';
import { setLang, t, applyI18n } from '../lib/i18n.js';

const storage = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };
const root = document.getElementById('root');
const updateSettings = async operation => {
  const result = await chrome.runtime.sendMessage({ cmd: 'settings_update', operation });
  if (result?.state !== 'ok') throw Error(result?.state || 'Settings save failed');
  return result;
};

const HOSTS = { origins: ['https://core.xjtlu.edu.cn/*'] };
const hasAccess = () => chrome.permissions.contains(HOSTS);
const actions = {
  // Must run straight from the click (Firefox requires a user gesture for permission prompts).
  grant() {
    chrome.permissions.request(HOSTS).then(async (ok) => {
      if (ok) { await chrome.runtime.sendMessage({ cmd: 'refresh' }); draw(); }
    });
  },
  async tick(id, on) {
    await updateSettings({ type: 'tick', id, on });
  },
  async mark(list, id) {
    await updateSettings(list === 'doneItems' ? { type: 'tick', id, on: true } : { type: 'member', field: list, value: id, on: true });
  },
};
let editing = false;
async function draw() {
  const data = await chrome.storage.local.get(['snapshot', 'status', 'changes', 'lastSeenAt', 'barStatus']);
  const settings = await getSettings(storage);
  setLang(settings.lang);
  applyI18n();
  const hasPermission = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
  const companion = companionMode(settings, data.barStatus, hasPermission);
  document.getElementById('edit').hidden = companion;
  if (companion) {
    editing = false;
    renderCompanion(root, { ...data, hasPermission, zh: document.documentElement.lang.startsWith('zh') }, {
      settings: () => chrome.runtime.openOptionsPage(),
      standalone: async () => {
        await updateSettings({ type: 'patch', patch: { displayMode: 'standalone' } });
        await draw();
      },
    });
    return;
  }
  if (editing) return drawEditor(settings);
  render(root, { ...data, settings, needsAccess: !(await hasAccess()) }, { actions, surface: 'popup' });
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
    await updateSettings({ type: 'layout', surface: 'popup', list });
  };
  renderLayoutEditor(ol, resolveLayout(settings.layout?.popup, 'popup'), save);
  bar.querySelector('.done').onclick = () => { editing = false; draw(); };
  bar.querySelector('.reset').onclick = async (e) => {
    if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = t('ed_reset_q'); setTimeout(() => { delete e.target.dataset.armed; e.target.textContent = t('ed_reset'); }, 2500); return; }
    await updateSettings({ type: 'layout', surface: 'popup', list: null });
  };
  const more = document.createElement('p'); more.className = 'hint';
  const a = document.createElement('a'); a.href = '../options/options.html'; a.target = '_blank'; a.textContent = t('ed_settings');
  more.append(t('ed_more'), a);
  root.append(more);
}
document.getElementById('edit').onclick = () => { editing = !editing; draw(); };

await draw();
// Diagnostics do not mark unseen course changes as read.
const initial = await storage.get('barStatus');
if (!companionMode(await getSettings(storage), initial.barStatus, await chrome.permissions.contains({ permissions: ['nativeMessaging'] }))) {
  await chrome.storage.local.set({ lastSeenAt: Date.now() });
}
chrome.runtime.sendMessage({ cmd: 'badge' });

document.getElementById('refresh').onclick = async (e) => {
  e.currentTarget.disabled = true;
  await chrome.runtime.sendMessage({ cmd: 'refresh' });
  await draw();
  document.getElementById('refresh').disabled = false;
};
chrome.storage.onChanged.addListener(draw);
