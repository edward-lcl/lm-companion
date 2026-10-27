// Package the extension for each browser family. Only runtime files.
//   dist/<name>-<version>-chrome.zip   Chrome, Edge, Brave, Arc, Opera, Vivaldi (Chromium, service worker)
//   dist/<name>-<version>-firefox.zip  Firefox, Zen, LibreWolf, Floorp (Gecko, event page)
// The repo's manifest.json is the Chromium one, so "Load unpacked" on the repo folder keeps working.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const base = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const NAME = 'xjtlu-learning-mall-companion';
fs.mkdirSync('dist', { recursive: true });

export function firefoxManifest(m) {
  const f = structuredClone(m);
  delete f.key;                                   // Chrome-only (fixed extension id)
  f.permissions = f.permissions.filter((p) => p !== 'offscreen');
  f.background = { scripts: ['src/background.js'], type: 'module' };
  f.options_ui = { page: m.options_page, open_in_tab: true };
  delete f.options_page;
  f.browser_specific_settings = { gecko: { id: 'xjtlu-lm-companion@edward-lcl.github.io', strict_min_version: '140.0',
    data_collection_permissions: { required: ['none'] } } };
  return f;
}

function pack(target, manifest) {
  const dir = `dist/${target}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const p of ['icons', 'src']) fs.cpSync(p, path.join(dir, p), { recursive: true, filter: (s) => !s.endsWith('.DS_Store') });
  if (target === 'firefox') { fs.rmSync(`${dir}/src/offscreen.html`); fs.rmSync(`${dir}/src/offscreen.js`); }
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  const out = `dist/${NAME}-${manifest.version}-${target}.zip`;
  fs.rmSync(out, { force: true });
  execFileSync('zip', ['-qr', path.resolve(out), '.'], { cwd: dir });
  console.log(out, fs.statSync(out).size, 'bytes');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pack('chrome', base);
  pack('firefox', firefoxManifest(base));
}
