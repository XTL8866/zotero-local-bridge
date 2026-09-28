// 抽查今天删除过的条目 key，确认它们当前状态（是否在回收站 / 已永久删除）
const fs = require('fs');
const { req, getAll } = require('./api.js');

const KEYS = [
  ['GWJH593B', '5章删: A comparative investigation of four multi-channel flow field'],
  ['PV9W7MTZ', '6章删: A comprehensive review on the interfacial design'],
  ['F748D3YC', '6章删: Water Electrolysis toward Elevated Temperature'],
  ['IEZLYDMJ', '6章删: Advances in Anion Exchange Membrane Water Electrolysis'],
];

(async () => {
  const out = [];
  const w = (s) => { out.push(String(s)); console.log(s); };

  for (const [k, desc] of KEYS) {
    const r = await req('GET', '/api/users/0/items/' + k);
    let info = `status=${r.status}`;
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        info += ` deleted=${j.data && j.data.deleted} title=${(j.data && j.data.title || '').slice(0, 40)}`;
      } catch (e) { info += ' (解析失败)'; }
    } else {
      info += ` body=${r.body.slice(0, 120)}`;
    }
    w(`${k}  ${desc}\n    -> ${info}`);
  }

  // 回收站内容核对
  const t = await req('GET', '/api/users/0/items/trash?limit=100&format=json');
  w(`\n/items/trash status=${t.status}`);
  if (t.status === 200) {
    try {
      const arr = JSON.parse(t.body);
      w(`回收站条目数: ${arr.length}`);
      for (const it of arr.slice(0, 15)) w(`   ${it.key} | ${(it.data.title || '').slice(0, 55)} | deleted=${it.data.deleted}`);
    } catch (e) { w('解析失败 ' + t.body.slice(0, 200)); }
  }
  fs.writeFileSync(__dirname + '/check_keys.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
