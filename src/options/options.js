import { companionMode } from '../lib/bar.js';
import { getSettings } from '../lib/sync.js';
import { resolveLayout, renderLayoutEditor } from '../lib/view.js';
import { setLang, t, applyI18n } from '../lib/i18n.js';

const storage = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };
const $ = (s) => document.querySelector(s);
let s = await getSettings(storage);

const save = async (patch, operation = { type: 'patch', patch }) => {
  const result = await chrome.runtime.sendMessage({ cmd: 'settings_update', operation });
  if (result?.settings) s = result.settings;
  if (result?.state !== 'ok') { $('#saved').textContent = result?.state || 'Save failed'; $('#saved').style.opacity = 1; return; }
  $('#saved').textContent = t('o_saved');
  $('#saved').style.opacity = 1; setTimeout(() => ($('#saved').style.opacity = 0), 900);
};

function translate() {
  setLang(s.lang);
  applyI18n();
  document.title = t('app');
  hiddenLabel();
  drawLayout();
  syncModeUI();
}

async function syncModeUI() {
  const zh = document.documentElement.lang.startsWith('zh');
  const { barStatus } = await storage.get('barStatus');
  const permission = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
  const companion = companionMode(s, barStatus, permission);
  $('#displayMode').value = s.displayMode || 'auto';
  $('#modeLabel').textContent = zh ? '使用方式' : 'Display mode';
  const labels = zh ? ['自动（连接成功后使用配套模式）', 'LM Bar 配套模式', '独立浏览器模式'] : ['Automatic (companion after connection)', 'LM Bar companion', 'Standalone browser'];
  [...$('#displayMode').options].forEach((o, i) => { o.textContent = labels[i]; });
  $('#modeHint').textContent = zh ? '配套模式将任务和显示设置集中到 Mac 菜单栏。独立模式的布局和勾选会保留。提醒、历史权限和同步筛选仍由浏览器负责。' : 'Companion mode puts tasks and display settings in the Mac menu bar. Standalone layouts and ticks are preserved. Reminders, history permission and sync filters remain browser-owned.';
  $('#bridgePermissionHint').textContent = zh ? '连接步骤：打开下方开关并批准浏览器的 nativeMessaging 权限。需要已安装 LM Bar 桥接；不需要密码或复制登录会话。' : 'Connection step: switch on below and approve the browser’s nativeMessaging permission. Requires the installed LM Bar bridge; no password or copied login session.';
  $('#standaloneDisplay').hidden = companion;
  $('#windowDays').closest('label').hidden = companion;
  $('[data-i18n="o_remind"]').textContent = zh ? '浏览器提醒（唯一通知来源）' : 'Browser reminders (sole notification owner)';
  $('[data-i18n="o_log"]').textContent = zh ? '浏览器学习记录与历史权限' : 'Browser study log & history permission';
  $('#barHint').textContent = permission ? barStatusText(barStatus) : t('o_bar_hint');
}
$('#displayMode').onchange = async (e) => {
  s.displayMode = e.target.value;
  await save({ displayMode: s.displayMode }); await syncModeUI();
};

$('#lang').value = s.lang || 'auto';
$('#lang').onchange = (e) => { s.lang = e.target.value; save({ lang: s.lang }); translate(); };

// Reminders (notifications are an optional permission, requested from this click).
const remindGroup = $('#remindOn').closest('.group');
const syncRemindUI = () => remindGroup.classList.toggle('off', !s.remind.on);
$('#remindOn').checked = s.remind.on && (await chrome.permissions.contains({ permissions: ['notifications'] }));
s.remind.on = $('#remindOn').checked; syncRemindUI();
$('#remindOn').onchange = async (e) => {
  if (e.target.checked) { const ok = await chrome.permissions.request({ permissions: ['notifications'] }); e.target.checked = ok; s.remind.on = ok; }
  else s.remind.on = false;
  syncRemindUI(); await save({ remind: { on: s.remind.on } });
};
$('#morningOn').checked = s.remind.morning;
$('#morningOn').onchange = (e) => { s.remind.morning = e.target.checked; save({ remind: { morning: s.remind.morning } }); };
$('#morningAt').value = s.remind.morningAt;
$('#morningAt').onchange = (e) => { s.remind.morningAt = e.target.value || '08:00'; save({ remind: { morningAt: s.remind.morningAt } }); };
for (const b of document.querySelectorAll('[data-before]')) {
  const h = Number(b.dataset.before);
  b.checked = s.remind.before.includes(h);
  b.onchange = () => save(null, { type: 'member', field: 'before', value: h, on: b.checked });
}
$('#testNotify').onclick = () => chrome.notifications?.create('test', { type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: t('n_test'), message: t('n_test_body') });

// LM Bar (Mac menu bar app): optional nativeMessaging permission, then one push to confirm.
const barStatusText = (b) => !b ? t('o_bar_hint') : b.ok ? t('o_bar_ok') : t('o_bar_missing');
$('#barOn').checked = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
if ($('#barOn').checked) $('#barHint').textContent = barStatusText((await chrome.storage.local.get('barStatus')).barStatus);
$('#barOn').onchange = async (e) => {
  if (e.target.checked) {
    const ok = await chrome.permissions.request({ permissions: ['nativeMessaging'] });
    e.target.checked = ok;
    if (ok) $('#barHint').textContent = barStatusText(await chrome.runtime.sendMessage({ cmd: 'bar_push' }));
  } else {
    await chrome.permissions.remove({ permissions: ['nativeMessaging'] });
    $('#barHint').textContent = t('o_bar_hint');
  }
  await syncModeUI();
};

$('#showPanel').checked = s.showPanel;
$('#showPanel').onchange = (e) => { s.showPanel = e.target.checked; save({ showPanel: s.showPanel }); };

// Section layout editor (shared with the popup's Customize mode).
let surface = 'popup';
function drawLayout() {
  renderLayoutEditor($('#layout'), resolveLayout(s.layout?.[surface], surface),
    async (list) => { await save(null, { type: 'layout', surface, list }); drawLayout(); });
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
  surface = b.dataset.surface;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  drawLayout();
};
$('#resetLayout').onclick = async () => { await save(null, { type: 'layout', surface, list: null }); drawLayout(); };

$('#onlyModules').checked = s.onlyModules;
$('#onlyModules').onchange = (e) => { s.onlyModules = e.target.checked; save({ onlyModules: s.onlyModules }); };
function hiddenLabel() { const n = s.hiddenItems.length + s.doneItems.length; $('#hiddenCount').textContent = t('o_hidden_n', { n }); $('#resetItems').disabled = !n; }
$('#resetItems').onclick = async () => { await save(null, { type: 'resetItems' }); hiddenLabel(); };
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
  await save({ studyLog: s.studyLog });
  chrome.runtime.sendMessage({ cmd: 'refresh' });
};
for (const id of ['windowDays', 'refreshMinutes']) {
  $(`#${id}`).value = String(s[id]);
  $(`#${id}`).onchange = (e) => { s[id] = Number(e.target.value); save({ [id]: s[id] }); };
}
for (const box of document.querySelectorAll('[data-change]')) {
  box.checked = !!s.changes[box.dataset.change];
  box.onchange = () => { s.changes[box.dataset.change] = box.checked; save({ changes: { [box.dataset.change]: box.checked } }); };
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
      save(null, { type: 'member', field: 'hiddenCourses', value: c.id, on: !box.checked });
    };
    wrap.append(l);
  }
}
translate();
