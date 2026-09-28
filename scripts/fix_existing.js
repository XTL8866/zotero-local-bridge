// 补：把已存在于库中的 10 条文献挂到对应的 5.x 集合（批量 PATCH 不被支持，改为逐个）
const fs = require('fs');
const { patch, getJson, get, getAll } = require('./api.js');

const merged = JSON.parse(fs.readFileSync(__dirname + '/ris_parsed.json', 'utf8'));
const exists = merged.filter((m) => m.existingKey);
const SECS = ['5.1', '5.2', '5.3', '5.4'];
const out = [];
const w = (s) => { out.push(String(s)); console.log(s); };

(async () => {
  const cols = await getAll('/api/users/0/collections');
  const colKey = {};
  for (const s of SECS) {
    const hit = cols.find((c) => c.data.name === s);
    colKey[s] = hit ? hit.key : null;
    w(`集合 ${s} -> ${colKey[s]}`);
  }

  const keys = exists.map((m) => m.existingKey);
  const det = await getJson('/api/users/0/items?format=json&itemKey=' + keys.join(',') + '&limit=100');
  const byKey = new Map(det.map((d) => [d.key, d]));
  w(`取到版本信息: ${byKey.size} / ${keys.length}\n`);

  let ok = 0, fail = 0;
  for (const m of exists) {
    const d = byKey.get(m.existingKey);
    if (!d) { w(`[跳过] 无版本: ${(m.item.title || '').slice(0, 50)}`); fail++; continue; }
    const cur = new Set(d.data.collections || []);
    for (const s of m.secs) if (colKey[s]) cur.add(colKey[s]);
    const r = await patch('/api/users/0/items/' + d.key, {
      key: d.key, version: d.version, collections: [...cur],
    });
    const okFlag = r.status === 204 || r.status === 200;
    if (okFlag) ok++; else fail++;
    w(`${okFlag ? 'OK  ' : 'FAIL'} [${m.secs.join('/')}] ${(m.item.title || '').slice(0, 58)}  ${okFlag ? '' : r.status + ' ' + r.body.slice(0, 150)}`);
  }
  w(`\n成功 ${ok} / 失败 ${fail}`);

  // 验证
  w('\n== 最终验证 ==');
  const after = await getAll('/api/users/0/collections');
  for (const s of SECS) {
    const c = after.find((x) => x.key === colKey[s]);
    w(`  ${s} [${colKey[s]}]: ${c && c.meta ? c.meta.numItems : '?'} 条`);
  }
  const rk = await get('/api/users/0/items/top?format=keys&limit=100');
  const n = rk.body.trim().split(/\s+/).filter(Boolean).length;
  w(`  库顶层条目总数(首分页): ${n}`);

  fs.writeFileSync(__dirname + '/import_report.txt', out.join('\n'), 'utf8');
  console.log('\nDONE');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  fs.writeFileSync(__dirname + '/import_report.txt', out.join('\n') + '\n\nERROR: ' + e.message, 'utf8');
  process.exit(1);
});
