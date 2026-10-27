import { render } from '../lib/view.js';
import { getSettings } from '../lib/sync.js';

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
async function draw() {
  const data = await chrome.storage.local.get(['snapshot', 'status', 'changes', 'lastSeenAt']);
  render(root, { ...data, settings: await getSettings(storage) }, { actions });
}

await draw();
// Opening the popup marks changes as seen (after drawing, so they still show as new this time).
await chrome.storage.local.set({ lastSeenAt: Date.now() });
chrome.runtime.sendMessage({ cmd: 'badge' });

document.getElementById('refresh').onclick = async (e) => {
  e.target.disabled = true;
  await chrome.runtime.sendMessage({ cmd: 'refresh' });
  await draw();
  e.target.disabled = false;
};
chrome.storage.onChanged.addListener(draw);
