// Load the unpacked extension in Chrome for Testing (Playwright), seed the Learning Mall session
// cookies into a throwaway profile, trigger a sync and screenshot the popup + settings + dashboard panel.
// The school's SSO gateway is never visited (only core.xjtlu.edu.cn with existing cookies).
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = process.env.LMC_SHOTS || `${process.env.TMPDIR || '/tmp'}/lmc-shots`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const profile = `${OUT}/profile`;
const s = JSON.parse(fs.readFileSync(`${process.env.HOME}/.xjtlu-session-mcp/session.json`, 'utf8'));

const ctx = await chromium.launchPersistentContext(profile, {
  headless: true, channel: 'chromium', acceptDownloads: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.addCookies(s.cookies.filter((c) => c.domain.replace(/^\./, '').endsWith('xjtlu.edu.cn')).map((c) => ({
  name: c.name, value: c.value, domain: c.domain, path: c.path || '/', httpOnly: !!c.httpOnly, secure: !!c.secure,
  sameSite: c.sameSite || 'Lax', expires: c.expires > 0 ? c.expires : -1 })));

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(sw.url()).host;
console.log('extension id', id);
const errs = [];
sw.on?.('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

// Seed a little browsing history on Learning Mall so the study log has something to match.
const seedPage = await ctx.newPage();
for (const u of ['https://core.xjtlu.edu.cn/my/']) await seedPage.goto(u, { waitUntil: 'domcontentloaded' });
await seedPage.close();
const popup = await ctx.newPage();
popup.on('console', (m) => { if (m.type() === 'error') errs.push('popup: ' + m.text()); });
popup.on('pageerror', (e) => errs.push('popup pageerror: ' + e.message));
await popup.setViewportSize({ width: 380, height: 600 });
await popup.goto(`chrome-extension://${id}/src/popup/popup.html`);
const t = Date.now();
// Grant the optional history permission the way Settings would (Playwright auto-accepts).
// permissions.request opens a prompt that headless Chrome never answers, so race it with a timeout.
const granted = await popup.evaluate(async () => Promise.race([
  chrome.permissions.request({ permissions: ['history'] }).catch((e) => 'err:' + e.message),
  new Promise((r) => setTimeout(() => r('prompt-unanswered'), 3000))]));
console.log('history permission', granted);
await popup.evaluate(async () => { const { settings = {} } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, studyLog: true } }); });
const res = await popup.evaluate(() => chrome.runtime.sendMessage({ cmd: 'refresh' }));
console.log('refresh', JSON.stringify(res), `${Date.now() - t}ms`);
await popup.reload(); await popup.waitForTimeout(800);
const st = await popup.evaluate(() => chrome.storage.local.get(['status', 'snapshot']));
console.log('status', JSON.stringify(st.status), 'deadlines', st.snapshot?.deadlines?.length, 'courses', st.snapshot?.courses?.length,
  'studyLog', JSON.stringify(st.snapshot?.studyLog), 'catchup', (st.snapshot?.engagement || []).map((m) => `${m.code}:${m.unopened.length}`).join(','));
const sections = await popup.$$eval('section h3', (hs) => hs.map((h) => h.textContent));
console.log('popup sections', sections);
await popup.screenshot({ path: `${OUT}/popup.png`, fullPage: true });

// Customize: hide Course completion, move Catch up to the top, via the popup's own editor.
await popup.click('#edit');
await popup.waitForSelector('ol.layout li');
await popup.click('ol.layout li[data-id="completion"] input');
await popup.waitForTimeout(300);
for (let i = 0; i < 4; i++) { await popup.click('ol.layout li[data-id="catchup"] .up'); await popup.waitForTimeout(250); }
await popup.screenshot({ path: `${OUT}/customize.png`, fullPage: true });
await popup.click('.editbar .done');
await popup.waitForTimeout(400);
const order = await popup.$$eval('section[data-section]', (ss) => ss.map((s) => s.dataset.section));
console.log('custom order', JSON.stringify(order), 'completion hidden', !order.includes('completion'), 'catchup first', order[0] === 'catchup');
await popup.screenshot({ path: `${OUT}/popup-custom.png`, fullPage: true });
const opts = await ctx.newPage();
await opts.goto(`chrome-extension://${id}/src/options/options.html`);
await opts.waitForTimeout(500);
await opts.check('#showPanel');
const settingsOrder = await opts.$$eval('#layout li', (ls) => ls.map((l) => l.dataset.id + (l.classList.contains('off') ? ':off' : '')));
console.log('settings shows same layout', JSON.stringify(settingsOrder));
await opts.waitForTimeout(400);
await opts.screenshot({ path: `${OUT}/settings.png`, fullPage: true });
const settings = await opts.evaluate(() => chrome.storage.local.get('settings'));
console.log('settings saved', JSON.stringify(settings.settings?.showPanel), JSON.stringify(settings.settings?.changes));

const dash = await ctx.newPage();
dash.on('pageerror', (e) => errs.push('dash pageerror: ' + e.message));
await dash.setViewportSize({ width: 1280, height: 900 });
await dash.goto('https://core.xjtlu.edu.cn/my/', { waitUntil: 'domcontentloaded' });
await dash.waitForTimeout(3000);
const panel = await dash.$('.lmc-panel');
console.log('dashboard url', new URL(dash.url()).pathname, 'panel injected', !!panel);
if (panel) await panel.screenshot({ path: `${OUT}/panel.png` });

// Chinese: switch language in Settings, screenshot popup, settings and panel in zh.
await opts.selectOption('#lang', 'zh');
await opts.waitForTimeout(500);
await opts.screenshot({ path: `${OUT}/settings-zh.png`, fullPage: true });
const zhLeft = await opts.evaluate(() => [...document.querySelectorAll('h2, label > span, .tabs button, #layout strong')].map((n) => n.textContent).filter((x) => /[A-Za-z]{4,}/.test(x) && !/Learning Mall|LM|English|PingFang/.test(x)));
console.log('settings zh untranslated', JSON.stringify(zhLeft.slice(0, 8)));
// Reset the custom layout so the zh popup shows the default (week near the top).
await opts.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, layout: null } }); });
await popup.reload(); await popup.waitForTimeout(800);
const zhSections = await popup.$$eval('section h3 > span:first-child', (hs) => hs.map((h) => h.textContent));
console.log('popup zh sections', JSON.stringify(zhSections), 'html lang', await popup.evaluate(() => document.documentElement.lang));
const weekInfo = await popup.$$eval('.week .day', (ds) => ds.map((d) => d.querySelector('.dow').textContent + d.querySelector('.dnum').textContent + ':' + [...d.querySelectorAll('.chip')].map((c) => c.className.replace('chip ', '') + '/' + c.textContent).join('|')));
console.log('week', JSON.stringify(weekInfo));
await popup.screenshot({ path: `${OUT}/popup-zh.png`, fullPage: true });
// Today checklist: tick the first open item, confirm it moves to done, then untick it.
const todayBefore = await popup.$$eval('section[data-section="today"] li.check', (ls) => ls.map((l) => (l.classList.contains('done') ? 'done:' : '') + l.querySelector('.name').textContent));
console.log('today', JSON.stringify(todayBefore), 'title', await popup.$eval('section[data-section="today"] h3', (h) => h.textContent).catch(() => 'none'));
if (await popup.$('section[data-section="today"] input.tick')) {
  await popup.click('section[data-section="today"] li.check:not(.done) input.tick'); await popup.waitForTimeout(600);
  const afterTick = await popup.$$eval('section[data-section="today"] li.check', (ls) => ls.map((l) => (l.classList.contains('done') ? 'done:' : '') + l.querySelector('.name').textContent));
  console.log('after tick', JSON.stringify(afterTick));
  await popup.screenshot({ path: `${OUT}/popup-today.png`, fullPage: true });
  await popup.click('section[data-section="today"] li.check.done input.tick'); await popup.waitForTimeout(600);
  const restored = await popup.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  console.log('untick restored', JSON.stringify(restored.doneItems), JSON.stringify(restored.doneAt));
}
// Reminder settings render (permission prompt can't be answered headless).
await opts.reload(); await opts.waitForTimeout(500);
const remindUI = await opts.evaluate(() => ({ on: document.querySelector('#remindOn').checked, before: [...document.querySelectorAll('[data-before]')].filter((b) => b.checked).map((b) => b.dataset.before), at: document.querySelector('#morningAt').value }));
console.log('remind ui', JSON.stringify(remindUI));
await opts.screenshot({ path: `${OUT}/settings-zh2.png`, fullPage: true });
// ICS download from the week card
const [dl] = await Promise.all([popup.waitForEvent('download', { timeout: 5000 }).catch(() => null), popup.click('button.ics')]);
if (dl) { const fp = `${OUT}/deadlines.ics`; await dl.saveAs(fp); const txt = fs.readFileSync(fp, 'utf8'); console.log('ics events', (txt.match(/BEGIN:VEVENT/g) || []).length, 'bytes', txt.length); }
else console.log('ics download: none');
await dash.reload({ waitUntil: 'domcontentloaded' }); await dash.waitForTimeout(3000);
const panelZh = await dash.$('.lmc-panel');
if (panelZh) { await panelZh.screenshot({ path: `${OUT}/panel-zh.png` }); console.log('panel zh title', await dash.$eval('.lmc-title', (n) => n.textContent)); }

// Countdown text on items due within 24h, and the meter icon.
await popup.evaluate(async () => { const { snapshot } = await chrome.storage.local.get('snapshot'); const soon = { id: 'test:soon', name: 'Countdown probe', type: 'assign', code: 'MTH030', courseId: 'x', due: Date.now() + (5 * 60 + 12) * 60000, overdue: false, action: 'Add submission', actionable: true }; await chrome.storage.local.set({ snapshot: { ...snapshot, deadlines: [...snapshot.deadlines, soon] } }); });
await popup.waitForTimeout(500);
const cds = await popup.$$eval('.due', (ds) => ds.map((d) => d.textContent).filter((x) => /还剩|in \d/.test(x)));
console.log('countdowns', JSON.stringify(cds.slice(0, 3)));
await popup.screenshot({ path: `${OUT}/popup-countdown.png`, clip: { x: 0, y: 0, width: 380, height: 420 } });
await popup.evaluate(async () => { const { snapshot } = await chrome.storage.local.get('snapshot'); await chrome.storage.local.set({ snapshot: { ...snapshot, deadlines: snapshot.deadlines.filter((d) => d.id !== 'test:soon') } }); });
await sw.evaluate(() => chrome.runtime.sendMessage ? null : null);
await popup.evaluate(() => chrome.runtime.sendMessage({ cmd: 'badge' }));
// Render the icon the same way the worker does, to a PNG we can look at.
const iconPng = await popup.evaluate(async () => {
  const LEVEL = { soon: '#e59a1a' }; const size = 128; const c = new OffscreenCanvas(size, size); const g = c.getContext('2d');
  return null;
});
// Stale: backdate the snapshot 5 hours and confirm banner + grey badge.
await popup.evaluate(async () => { const { snapshot } = await chrome.storage.local.get('snapshot'); await chrome.storage.local.set({ snapshot: { ...snapshot, at: Date.now() - 5 * 3600000 } }); await chrome.runtime.sendMessage({ cmd: 'badge' }); });
await popup.reload(); await popup.waitForTimeout(700);
console.log('stale banner', await popup.$eval('.banner.stale', (b) => b.textContent).catch(() => 'none'), 'is-stale', await popup.$eval('#root', (r) => r.classList.contains('is-stale')));
const staleBadge = await sw.evaluate(async () => ({ title: await chrome.action.getTitle({}), color: await chrome.action.getBadgeBackgroundColor({}) }));
console.log('stale badge', JSON.stringify(staleBadge));
await popup.screenshot({ path: `${OUT}/popup-stale.png`, fullPage: false });
await popup.evaluate(async () => { const { snapshot } = await chrome.storage.local.get('snapshot'); await chrome.storage.local.set({ snapshot: { ...snapshot, at: Date.now() } }); await chrome.runtime.sendMessage({ cmd: 'badge' }); });

const badge = await sw.evaluate(async () => ({ text: await chrome.action.getBadgeText({}), title: await chrome.action.getTitle({}) }));
console.log('badge', JSON.stringify(badge));
console.log('errors', errs.length ? errs.slice(0, 5) : 'none');
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
