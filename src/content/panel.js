// Optional "Due & missing" block on the Learning Mall dashboard (/my/ only). Off by default.
// Reads the stored snapshot; never fetches, never touches course, quiz or assignment pages.
(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings?.showPanel) return;
  const { render } = await import(chrome.runtime.getURL('src/lib/view.js'));
  const { getSettings } = await import(chrome.runtime.getURL('src/lib/sync.js'));
  const { setLang, t } = await import(chrome.runtime.getURL('src/lib/i18n.js'));
  const storage = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };
  setLang(settings.lang);

  const host = document.createElement('section');
  host.className = 'block card mb-3 lmc-panel';
  host.innerHTML = '<div class="card-body p-3"><h5 class="card-title d-flex justify-content-between">' +
    '<span class="lmc-title"></span><button class="lmc-toggle btn btn-link p-0" type="button"></button></h5>' +
    '<div class="lmc lmc-body"></div></div>';
  const target = document.querySelector('#block-region-content') || document.querySelector('#region-main');
  if (!target) return;  // dashboard layout changed: do nothing rather than break the page
  target.prepend(host);
  const body = host.querySelector('.lmc-body');
  const toggle = host.querySelector('.lmc-toggle');
  const title = host.querySelector('.lmc-title');
  let collapsed = !!(await chrome.storage.local.get('panelCollapsed')).panelCollapsed;
  const setCollapsed = (c) => { collapsed = c; body.hidden = c; toggle.textContent = c ? t('panel_show') : t('panel_hide'); };
  toggle.onclick = async () => { setCollapsed(!collapsed); await chrome.storage.local.set({ panelCollapsed: collapsed }); };

  const draw = async () => {
    const data = await chrome.storage.local.get(['snapshot', 'status', 'changes', 'lastSeenAt']);
    const s = await getSettings(storage);
    setLang(s.lang);
    title.textContent = t('panel_title');
    setCollapsed(collapsed);
    const actions = { async tick(id, on) {
      const x = await getSettings(storage); const doneAt = { ...(x.doneAt || {}) };
      if (on) { doneAt[id] = Date.now(); x.doneItems = [...new Set([...(x.doneItems || []), id])]; }
      else { delete doneAt[id]; x.doneItems = (x.doneItems || []).filter((y) => y !== id); }
      x.doneAt = doneAt; await chrome.storage.local.set({ settings: x }); chrome.runtime.sendMessage({ cmd: 'settings_changed' });
    } };
    render(body, { ...data, settings: s }, { compact: true, surface: 'panel', actions });
  };
  await draw();
  chrome.storage.onChanged.addListener(draw);
})();
