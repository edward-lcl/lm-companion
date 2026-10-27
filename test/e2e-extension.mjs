// Load the unpacked extension in Chrome for Testing (Playwright), seed the Learning Mall session
// cookies into a throwaway profile, trigger a sync and screenshot the popup + settings + dashboard panel.
// The school's SSO gateway is never visited (only core.xjtlu.edu.cn with existing cookies).
import fs from 'node:fs';
import { chromium } from '/Users/edward/.local/share/xjtlu-core-mcp/node_modules/xjtlu-core-mcp/node_modules/playwright-core/index.mjs';

const EXT = '/Users/edward/Projects/lm-companion';
const OUT = '/Users/edward/.hermes/cache/scratch/lmc-shots';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const profile = `${OUT}/profile`;
const s = JSON.parse(fs.readFileSync(`${process.env.HOME}/.xjtlu-session-mcp/session.json`, 'utf8'));

const ctx = await chromium.launchPersistentContext(profile, {
  headless: true, channel: 'chromium',
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

const popup = await ctx.newPage();
popup.on('console', (m) => { if (m.type() === 'error') errs.push('popup: ' + m.text()); });
popup.on('pageerror', (e) => errs.push('popup pageerror: ' + e.message));
await popup.setViewportSize({ width: 360, height: 600 });
await popup.goto(`chrome-extension://${id}/src/popup/popup.html`);
const t = Date.now();
const res = await popup.evaluate(() => chrome.runtime.sendMessage({ cmd: 'refresh' }));
console.log('refresh', JSON.stringify(res), `${Date.now() - t}ms`);
await popup.reload(); await popup.waitForTimeout(800);
const st = await popup.evaluate(() => chrome.storage.local.get(['status', 'snapshot']));
console.log('status', JSON.stringify(st.status), 'deadlines', st.snapshot?.deadlines?.length, 'courses', st.snapshot?.courses?.length);
const sections = await popup.$$eval('section h3', (hs) => hs.map((h) => h.textContent));
console.log('popup sections', sections);
await popup.screenshot({ path: `${OUT}/popup.png`, fullPage: true });

const opts = await ctx.newPage();
await opts.goto(`chrome-extension://${id}/src/options/options.html`);
await opts.waitForTimeout(500);
await opts.check('#showPanel');
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

const badge = await sw.evaluate(async () => ({ text: await chrome.action.getBadgeText({}), title: await chrome.action.getTitle({}) }));
console.log('badge', JSON.stringify(badge));
console.log('errors', errs.length ? errs.slice(0, 5) : 'none');
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
