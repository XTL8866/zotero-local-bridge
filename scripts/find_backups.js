const fs = require('fs');
const path = require('path');
const os = require('os');
const out = [];
const w = (s) => { out.push(String(s)); console.log(s); };

const dirs = [
  path.join(os.homedir(), 'Zotero', 'backups'),
  path.join(os.homedir(), 'Zotero'),
];
for (const d of dirs) {
  w(`\n== ${d} ==`);
  if (!fs.existsSync(d)) { w('  不存在'); continue; }
  if (d.endsWith('backups')) {
    const files = fs.readdirSync(d).map((f) => {
      const st = fs.statSync(path.join(d, f));
      return { f, size: st.size, mtime: st.mtime };
    }).sort((a, b) => b.mtime - a.mtime);
    w(`  文件数: ${files.length}`);
    for (const x of files.slice(0, 20)) {
      w(`  ${x.mtime.toISOString().slice(0, 16).replace('T', ' ')}  ${String(Math.round(x.size / 1024)).padStart(7)} KB  ${x.f}`);
    }
  } else {
    const files = fs.readdirSync(d).filter((f) => /\.sqlite|\.bak|\.zip$/i.test(f));
    for (const f of files) {
      const st = fs.statSync(path.join(d, f));
      w(`  ${st.mtime.toISOString().slice(0, 16).replace('T', ' ')}  ${Math.round(st.size / 1024)} KB  ${f}`);
    }
  }
}
fs.writeFileSync(__dirname + '/backups.txt', out.join('\n'), 'utf8');
