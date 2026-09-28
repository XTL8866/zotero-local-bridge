const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const cands = [
  path.join(home, 'Zotero'),
  path.join(home, 'Documents', 'Zotero'),
  path.join(home, 'OneDrive', 'Documents', 'Zotero'),
  path.join(home, 'OneDrive', '文档', 'Zotero'),
  path.join(home, 'Documents and Settings', 'Zotero'),
  'D:/Zotero',
  'C:/Zotero',
];

console.log('== data dir candidates ==');
for (const c of cands) {
  const sqlite = path.join(c, 'zotero.sqlite');
  let ok = false, size = 0;
  try { const st = fs.statSync(sqlite); ok = true; size = st.size; } catch (e) {}
  if (fs.existsSync(c)) console.log(`${ok ? '[SQLITE]' : '[dir]   '} ${c}${ok ? '  (' + (size / 1048576).toFixed(1) + ' MB)' : ''}`);
}
console.log('== zotero install ==');
for (const c of ['C:/Program Files/Zotero/Zotero.exe', 'C:/Program Files (x86)/Zotero/Zotero.exe', path.join(home, 'AppData/Local/Zotero/Zotero.exe')]) {
  if (fs.existsSync(c)) console.log('[exe] ' + c);
}

console.log('== local API ==');
const url = 'http://localhost:23119/api/users/0/items?limit=1';
const req = require('http').get(url, (res) => {
  let body = '';
  res.on('data', (d) => (body += d));
  res.on('end', () => {
    console.log('status:', res.statusCode);
    console.log('body:', body.slice(0, 400));
  });
});
req.on('error', (e) => console.log('ERROR:', e.message, '=> Zotero 未运行，或本地接口未开启'));
req.setTimeout(4000, () => { console.log('TIMEOUT: 23119 无响应'); req.destroy(); });
