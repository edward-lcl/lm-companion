// Optional "Due & missing" block on the Learning Mall dashboard (/my/ only). Off by default.
// Reads the stored snapshot; never fetches, never touches course, quiz or assignment pages.
(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings?.showPanel) return;
  const { render } = await import(chrome.runtime.getURL('src/lib/view.js'));
  const { getSettings } = await import(chrome.runtime.getURL('src/lib/sync.js'));
  const storage = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };

  const host = document.createElement('section');
  host.className = 'block card mb-3 lmc-panel';
  host.innerHTML = '<div class="card-body p-3"><h5 class="card-title d-flex justify-content-between">' +
    '<span>Due &amp; missing</span><button class="lmc-toggle btn btn-link p-0" type="button">Hide</button></h5>' +
    '<div class="lmc lmc-body"></div></div>';
  const target = document.querySelector('#block-region-content') || document.querySelector('#region-main');
  if (!target) return;  // dashboard layout changed: do nothing rather than break the page
  target.prepend(host);
  const body = host.querySelector('.lmc-body');
  const toggle = host.querySelector('.lmc-toggle');
  const { panelCollapsed } = await chrome.storage.local.get('panelCollapsed');
  const setCollapsed = (c) => { body.hidden = c; toggle.textContent = c ? 'Show' : 'Hide'; };
  setCollapsed(!!panelCollapsed);
  toggle.onclick = async () => { const c = !body.hidden; setCollapsed(c); await chrome.storage.local.set({ panelCollapsed: c }); };

  const draw = async () => {
    const data = await chrome.storage.local.get(['snapshot', 'status', 'changes', 'lastSeenAt']);
    render(body, { ...data, settings: await getSettings(storage) }, { compact: true });
  };
  await draw();
  chrome.storage.onChanged.addListener(draw);
})();
