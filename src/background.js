// Background service worker: periodic sync + badge. DOMParser isn't available in service
// workers, so HTML parsing happens in an offscreen document.
import { sync, getSettings, visibleChanges, classify } from './lib/sync.js';

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
async function runSync() {
  running ||= sync({ storage, parse }).finally(() => { running = null; });
  const res = await running;
  await updateBadge();
  return res;
}

async function updateBadge() {
  const { status, snapshot, changes = [], lastSeenAt = 0 } = await chrome.storage.local.get(['status', 'snapshot', 'changes', 'lastSeenAt']);
  const settings = await getSettings(storage);
  if (status?.state === 'signed_out') {
    chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
    chrome.action.setTitle({ title: 'LM Companion: signed out of Learning Mall' }); return;
  }
  const missing = snapshot ? classify(snapshot.deadlines, Date.now(), settings.windowDays).missing.length : 0;
  const unseen = visibleChanges(changes, settings, lastSeenAt).filter((c) => c.unseen).length;
  const n = missing + unseen;
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: missing ? '#b3261e' : '#5b4bb7' });
  chrome.action.setTitle({ title: `LM Companion: ${missing} missing, ${unseen} new` });
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings(storage);
  chrome.alarms.create('sync', { periodInMinutes: s.refreshMinutes, delayInMinutes: 0.1 });
});
chrome.runtime.onStartup.addListener(() => runSync().catch(() => {}));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'sync') runSync().catch(() => {}); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === 'offscreen') return;  // handled there
  if (msg.cmd === 'refresh') { runSync().then(reply, (e) => reply({ state: 'error', detail: String(e) })); return true; }
  if (msg.cmd === 'badge') { updateBadge().then(() => reply({})); return true; }
  if (msg.cmd === 'settings_changed') {
    getSettings(storage).then((s) => { chrome.alarms.create('sync', { periodInMinutes: s.refreshMinutes }); return updateBadge(); }).then(() => reply({}));
    return true;
  }
});
