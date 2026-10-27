// Background service worker: periodic sync + badge. DOMParser isn't available in service
// workers, so HTML parsing happens in an offscreen document.
import { sync, getSettings, visibleChanges, classify } from './lib/sync.js';
import { setLang, t } from './lib/i18n.js';
import { plan, nextAt, digest } from './lib/reminders.js';
import { pressure, freshness } from './lib/time.js';

const storage = {
  get: (k) => chrome.storage.local.get(k),
  set: (o) => chrome.storage.local.set(o),
};

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({ url: 'src/offscreen.html', reasons: ['DOM_PARSER'],
    justification: 'Parse Learning Mall pages (grades, course materials) with DOMParser.' });
}

// Firefox (and Zen) run the background as an event page that has DOMParser and no offscreen API;
// Chrome/Edge run a service worker that needs the offscreen document.
let localParsers = null;
async function parse(parser, html) {
  if (!chrome.offscreen && typeof DOMParser !== 'undefined') {
    localParsers ||= await import('./lib/moodle.js');
    const fn = { courseModules: localParsers.parseCourseModules, gradeOverview: localParsers.parseGradeOverview }[parser];
    return fn(html, (h) => new DOMParser().parseFromString(h, 'text/html'));
  }
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

// Toolbar icon as a meter (after CodexBar): a rounded tile whose fill rises as the nearest deadline
// approaches over 7 days. Colour: purple calm, amber within 3 days, red within 24h or overdue.
// Dimmed grey when signed out or the data is stale, so old numbers never look live.
const LEVEL = { clear: '#8f7cff', calm: '#7a68f0', soon: '#e59a1a', today: '#e5484d', overdue: '#e5484d' };
async function drawIcon({ fill, level }, dim) {
  if (typeof OffscreenCanvas === 'undefined') return;
  const imageData = {};
  for (const size of [16, 32]) {
    const c = new OffscreenCanvas(size, size); const g = c.getContext('2d');
    const px = size / 16, pad = px, w = size - 2 * pad, r = size * 0.24;
    const tile = () => { g.beginPath(); g.roundRect(pad, pad, w, w, r); };
    tile(); g.fillStyle = dim ? '#e4e2ea' : '#ece8ff'; g.fill();
    // Whole-pixel fill steps so 16px states stay distinct: calm >= 3px, today leaves >= 3px empty.
    let h = 0;
    if (fill > 0) {
      const steps = Math.round(w / px);
      let n = Math.round(fill * steps);
      if (level === 'calm') n = Math.max(3, Math.min(n, steps - 6));
      if (level === 'soon') n = Math.max(6, Math.min(n, steps - 4));
      if (level === 'today') n = steps - 5;
      if (level === 'overdue') n = steps;
      h = n * px;
      g.save(); tile(); g.clip();
      g.fillStyle = dim ? '#8f8b9e' : (LEVEL[level] || LEVEL.calm); g.fillRect(pad, pad + w - h, w, h);
      g.restore();
    }
    tile(); g.lineWidth = px * 1.2; g.strokeStyle = dim ? '#8e8a9c' : (LEVEL[level] || LEVEL.calm); g.stroke();
    // Tick: white with a dark halo when it sits on colour, indigo on the pale tile.
    const onFill = h > w * 0.62;
    const tick = () => { g.beginPath(); g.moveTo(size * 0.29, size * 0.47); g.lineTo(size * 0.44, size * 0.62); g.lineTo(size * 0.72, size * 0.33); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (onFill) { g.strokeStyle = 'rgba(40,20,60,.35)'; g.lineWidth = px * 2.6; tick(); g.stroke(); }
    g.strokeStyle = onFill ? '#ffffff' : (dim ? '#5f5b6e' : '#4a3db8'); g.lineWidth = px * 1.7; tick(); g.stroke();
    imageData[size] = g.getImageData(0, 0, size, size);
  }
  await chrome.action.setIcon({ imageData });
}

async function updateBadge() {
  const { status, snapshot, changes = [], lastSeenAt = 0 } = await chrome.storage.local.get(['status', 'snapshot', 'changes', 'lastSeenAt']);
  const settings = await getSettings(storage);
  setLang(settings.lang);
  if (status?.state === 'signed_out') {
    await drawIcon({ fill: 0, level: 'clear' }, true);
    chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
    chrome.action.setTitle({ title: t('badge_out') }); return;
  }
  const missing = snapshot ? classify(snapshot.deadlines, Date.now(), settings.windowDays, settings).missing.length : 0;
  const unseen = visibleChanges(changes, settings, lastSeenAt).filter((c) => c.unseen).length;
  const n = missing + unseen;
  const fresh = snapshot ? freshness(snapshot.at, settings.refreshMinutes) : 'none';
  await drawIcon(snapshot ? pressure(classify(snapshot.deadlines, Date.now(), 30, settings).missing.concat(classify(snapshot.deadlines, Date.now(), 30, settings).upcoming)) : { fill: 0, level: 'clear' }, fresh !== 'fresh');
  if (fresh === 'stale' || fresh === 'old') { chrome.action.setBadgeText({ text: n ? String(n) : '' }); chrome.action.setBadgeBackgroundColor({ color: '#8e8a9c' }); chrome.action.setTitle({ title: t('badge_stale') }); return; }
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
