// Package the extension as a zip for "Load unpacked" or store upload. Only runtime files.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const { version } = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
fs.mkdirSync('dist', { recursive: true });
const out = `dist/lm-companion-${version}.zip`;
fs.rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, 'manifest.json', 'icons', 'src', '-x', '*.DS_Store']);
console.log(out, fs.statSync(out).size, 'bytes');
