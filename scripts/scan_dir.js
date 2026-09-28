const fs = require('fs');
const path = require('path');
const DIR = 'D:/浏览器下载文件';
const rows = fs.readdirSync(DIR)
  .filter((f) => /\.ris$/i.test(f))
  .map((f) => {
    const st = fs.statSync(path.join(DIR, f));
    return { f, size: st.size, mtime: st.mtime };
  })
  .sort((a, b) => b.mtime - a.mtime);
let out = `目录: ${DIR}\n共 ${rows.length} 个 .ris（按修改时间倒序）\n\n`;
out += '修改时间              | 大小KB | 文件名\n';
out += '-'.repeat(70) + '\n';
for (const r of rows) {
  const t = r.mtime.toISOString().replace('T', ' ').slice(0, 16);
  out += `${t} | ${String(Math.round(r.size / 1024)).padStart(6)} | ${r.f}\n`;
}
fs.writeFileSync(__dirname + '/dir_scan.txt', out, 'utf8');
console.log(out);
