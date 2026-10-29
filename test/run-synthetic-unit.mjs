// Run all unit tests without ever opening private fixtures or cookies.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const dir=fs.mkdtempSync(path.join(process.env.LMC_SCRATCH || process.env.TMPDIR || os.tmpdir(),'lm-synthetic-unit-'));
try {
 for(const name of ['src','package.json'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
 fs.mkdirSync(path.join(dir,'test'));
 const tests=fs.readdirSync(path.join(root,'test')).filter(x=>x.endsWith('.test.mjs'));
 for(const name of tests)fs.copyFileSync(path.join(root,'test',name),path.join(dir,'test',name));
 fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
 const r=spawnSync(process.execPath,['--test',...tests.map(x=>path.join(dir,'test',x))],{stdio:'inherit'});
 process.exitCode=r.status ?? 1;
} finally {fs.rmSync(dir,{recursive:true,force:true});}
