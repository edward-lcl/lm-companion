// Background service worker: periodic sync + badge. DOMParser isn't available in service
// workers, so HTML parsing happens in an offscreen document.
import { sync, getSettings, visibleChanges, classify } from './lib/sync.js';
import { setLang, t } from './lib/i18n.js';
import { plan, nextAt, digest } from './lib/reminders.js';

const storage = {
  get: (k) => chrome.storage.local.get(k),
  set: (o) => chrome.storage.local.set(o),
};

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({ url: 'src/offscreen.html', reasons: ['DOM_PARSER'],
    justification: 'Parse Learning Mall pages (grades, course materials) with DOMParser.' });
}

async function parse(parser, html) {
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'parse', parser, html });
  if (!r?.ok) { const e = new Error(r?.message || 'parse failed'); e.code = r?.code; e.what = r?.what; throw e; }
  return r.value;
}

let running = null;
// Optional study log: which Learning Mall activity pages you've opened, from this browser's own
// history. Needs the optional "history" permission, granted from Settings; stays on this device.
async function history() {
  if (!(await chrome.permissions.contains({ permissions: ['history'] }))) return null;   // no evidence, not "nothing opened"
  const items = await chrome.history.search({ text: 'core.xjtlu.edu.cn/mod/', startTime: Date.now() - 180 * 86400000, maxResults: 5000 });
  const visits = {};
  for (const h of items) {
    const m = h.url.match(/^https:\/\/core\.xjtlu\.edu\.cn\/mod\/\w+\/view\.php\?id=(\d+)/);
    if (m) visits[m[1]] = Math.max(visits[m[1]] || 0, h.lastVisitTime || 0);
  }
  return visits;
}

async function runSync() {
  running ||= sync({ storage, parse, history }).finally(() => { running = null; });
  const res = await running;
  await updateBadge();
  await schedule();
  return res;
}

async function updateBadge() {
  const { status, snapshot, changes = [], lastSeenAt = 0 } = await chrome.storage.local.get(['status', 'snapshot', 'changes', 'lastSeenAt']);
  const settings = await getSettings(storage);
  setLang(settings.lang);
  if (status?.state === 'signed_out') {
    chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
    chrome.action.setTitle({ title: t('badge_out') }); return;
  }
  const missing = snapshot ? classify(snapshot.deadlines, Date.now(), settings.windowDays, settings).missing.length : 0;
  const unseen = visibleChanges(changes, settings, lastSeenAt).filter((c) => c.unseen).length;
  const n = missing + unseen;
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: missing ? '#b3261e' : '#5b4bb7' });
  chrome.action.setTitle({ title: t('badge_title', { m: missing, n: unseen }) });
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings(storage);
  chrome.alarms.create('sync', { periodInMinutes: s.refreshMinutes, delayInMinutes: 0.1 });
});
chrome.runtime.onStartup.addListener(() => runSync().catch(() => {}));
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'sync') runSync().catch(() => {});
  else if (a.name === 'morning') morning().catch(() => {});
  else if (a.name.startsWith('r:')) remind(a.name.slice(2)).catch(() => {});
});

// ---- reminders: alarms -> system notifications. Needs the optional "notifications" permission.
const canNotify = () => chrome.permissions.contains({ permissions: ['notifications'] });
async function schedule() {
  const settings = await getSettings(storage);
  const { snapshot, sentReminders = {} } = await chrome.storage.local.get(['snapshot', 'sentReminders']);
  for (const a of await chrome.alarms.getAll()) if (a.name === 'morning' || a.name.startsWith('r:')) await chrome.alarms.clear(a.name);
  if (!settings.remind.on || !snapshot || !(await canNotify())) return;
  if (settings.remind.morning) chrome.alarms.create('morning', { when: nextAt(settings.remind.morningAt) });
  for (const r of plan(snapshot.deadlines, Date.now(), settings, sentReminders).slice(0, 40)) chrome.alarms.create(`r:${r.key}`, { when: r.when });
}
async function notify(id, title, message, url) {
  if (!(await canNotify())) return;
  const { notifyUrls = {} } = await chrome.storage.local.get('notifyUrls');
  notifyUrls[id] = url; await chrome.storage.local.set({ notifyUrls });
  chrome.notifications.create(id, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title, message, priority: 1 });
}
async function remind(key) {
  const settings = await getSettings(storage); setLang(settings.lang);
  const { snapshot, sentReminders = {} } = await chrome.storage.local.get(['snapshot', 'sentReminders']);
  const [id, hours] = [key.slice(0, key.lastIndexOf('@')), Number(key.slice(key.lastIndexOf('@') + 1))];
  const d = snapshot?.deadlines.find((x) => x.id === id);
  sentReminders[key] = Date.now(); await chrome.storage.local.set({ sentReminders });
  if (!d || d.submitted || (settings.doneItems || []).includes(id) || (settings.hiddenItems || []).includes(id)) return;
  const time = new Date(d.due).toLocaleString(settings.lang === 'zh' || (settings.lang !== 'en' && navigator.language.startsWith('zh')) ? 'zh-CN' : undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  await notify(`r:${key}`, t(hours >= 24 ? 'n_due_tomorrow' : 'n_due_soon', { h: hours }), `${d.code ? d.code + ' · ' : ''}${d.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()}\n${time}`, d.url);
}
async function morning() {
  const settings = await getSettings(storage); setLang(settings.lang);
  const { snapshot } = await chrome.storage.local.get('snapshot');
  chrome.alarms.create('morning', { when: nextAt(settings.remind.morningAt) });
  if (!snapshot) return;
  const g = digest(snapshot.deadlines, Date.now(), settings);
  if (!g.items.length) return;   // nothing to do today: stay quiet
  const lines = g.items.slice(0, 4).map((d) => `${d.code || ''} ${d.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()}`.trim());
  await notify(`m:${Date.now()}`, t('n_morning', { n: g.items.length }), lines.join('\n'), 'https://core.xjtlu.edu.cn/my/');
}
chrome.permissions.onAdded.addListener(() => { bindNotifications(); schedule(); });
function bindNotifications() {
  if (!chrome.notifications || bindNotifications.done) return; bindNotifications.done = true;
  chrome.notifications.onClicked.addListener(async (id) => {
  const { notifyUrls = {} } = await chrome.storage.local.get('notifyUrls');
  if (notifyUrls[id]) chrome.tabs.create({ url: notifyUrls[id] });
  chrome.notifications.clear(id);
  });
}
bindNotifications();

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === 'offscreen') return;  // handled there
  if (msg.cmd === 'refresh') { runSync().then(reply, (e) => reply({ state: 'error', detail: String(e) })); return true; }
  if (msg.cmd === 'badge') { updateBadge().then(() => reply({})); return true; }
  if (msg.cmd === 'settings_changed') {
    getSettings(storage).then((s) => { chrome.alarms.create('sync', { periodInMinutes: s.refreshMinutes }); return updateBadge(); }).then(schedule).then(() => reply({}));
    return true;
  }
});
