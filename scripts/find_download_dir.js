const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const out = [];
const w = (s) => out.push(String(s));

// 1. 从浏览器 Preferences 里读下载目录
const prefs = [
  ['Chrome', path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/Preferences')],
  ['Chrome(Profile1)', path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Profile 1/Preferences')],
  ['Edge', path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Default/Preferences')],
  ['Edge(Profile1)', path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Profile 1/Preferences')],
  ['360/QQ类', path.join(HOME, 'AppData/Local/360Chrome/Chrome/User Data/Default/Preferences')],
];

w('== 浏览器下载目录设置 ==');
const dlDirs = new Set();
for (const [name, p] of prefs) {
  if (!fs.existsSync(p)) continue;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const dd = (j.download && j.download.default_directory) || '(未设置, 用系统默认)';
    w(`${name}: ${dd}`);
    if (dd && dd !== '(未设置, 用系统默认)') dlDirs.add(dd);
  } catch (e) {
    w(`${name}: 读取失败 ${e.message}`);
  }
}

// 2. 候选目录
const cands = [
  ...dlDirs,
  path.join(HOME, 'Downloads'),
  path.join(HOME, 'Desktop'),
  'D:/浏览器下载文件地址',
  'D:/下载',
  'D:/Downloads',
];
w('\n== 候选目录中的 .ris ==');
for (const d of cands) {
  if (!fs.existsSync(d)) { w(`[不存在] ${d}`); continue; }
  let files = [];
  try { files = fs.readdirSync(d).filter((f) => /\.ris$/i.test(f)); } catch (e) {}
  w(`[存在] ${d}  ->  ${files.length} 个 .ris`);
  for (const f of files) w('        ' + f);
}

// 3. 扫 D 盘一级/二级目录名，找疑似下载夹
w('\n== D:\\ 一级目录 ==');
try {
  for (const e of fs.readdirSync('D:/', { withFileTypes: true })) {
    if (e.isDirectory()) w('  ' + e.name);
  }
} catch (err) { w('  读取失败: ' + err.message); }

fs.writeFileSync(__dirname + '/find_dl.txt', out.join('\n'), 'utf8');
console.log('written');
