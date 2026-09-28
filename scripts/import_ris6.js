// 第 6 章导入：建「6.制氢场」+ 5 个子集合 -> 批量建条目 -> 已有条目挂集合
const fs = require('fs');
const { post, patch, getAll, getJson } = require('./api.js');

const merged = JSON.parse(fs.readFileSync(__dirname + '/ris6_parsed.json', 'utf8'));
const PARENT = '6.制氢场';
const SUBS = ['6.1', '6.2', '6.3.1', '6.3.2', '6.3.3'];
const NOSEC = '(无章节)';
const out = [];
const w = (s) => { out.push(String(s)); console.log(s); };

function parseKeys(res) {
  const j = JSON.parse(res);
  const map = {};
  if (j.success) for (const [i, k] of Object.entries(j.success)) map[i] = k;
  if (j.successful) for (const [i, o] of Object.entries(j.successful)) if (!map[i]) map[i] = (o && o.key) || (o && o.data && o.data.key);
  return { map, failed: j.failed || {} };
}

async function createCollections(list, parentKey) {
  // list: [{name}] ; 返回 name->key
  const payload = list.map((x) => (parentKey ? { name: x.name, parentCollection: parentKey } : { name: x.name }));
  const r = await post('/api/users/0/collections', payload);
  if (r.status !== 200) throw new Error(`创建集合失败 ${r.status}: ${r.body.slice(0, 300)}`);
  const { map, failed } = parseKeys(r.body);
  const res = {};
  list.forEach((x, i) => {
    const k = map[String(i)];
    if (!k) throw new Error(`集合「${x.name}」未返回 key; failed=${JSON.stringify(failed).slice(0, 200)}`);
    res[x.name] = k;
  });
  return res;
}

(async () => {
  let cols = await getAll('/api/users/0/collections');
  const colKey = {};

  // 1. 父集合
  w('== 1. 集合 ==');
  let p = cols.find((c) => c.data.name === PARENT);
  if (p) { colKey[PARENT] = p.key; w(`已存在: ${PARENT} (${p.key})`); }
  else {
    const r = await createCollections([{ name: PARENT }], null);
    colKey[PARENT] = r[PARENT];
    w(`已创建: ${PARENT} -> ${r[PARENT]}`);
  }
  const parentKey = colKey[PARENT];

  // 2. 子集合
  const needSub = SUBS.filter((s) => !cols.find((c) => c.data.name === s));
  for (const s of SUBS) {
    const hit = cols.find((c) => c.data.name === s);
    if (hit) { colKey[s] = hit.key; w(`已存在: ${s} (${hit.key})`); }
  }
  if (needSub.length) {
    const r = await createCollections(needSub.map((name) => ({ name })), parentKey);
    for (const s of needSub) { colKey[s] = r[s]; w(`已创建: ${s} -> ${r[s]}  (父: ${PARENT})`); }
  }
  colKey[NOSEC] = parentKey; // 无章节文献归入父集合本身

  // 3. 新条目
  const news = merged.filter((m) => !m.existingKey);
  const exists = merged.filter((m) => m.existingKey);
  for (const m of merged) {
    const item = Object.assign({}, m.item);
    delete item._sec; delete item._from;
    item.collections = [...new Set(m.secs.map((s) => colKey[s] || parentKey))];
    m._payload = item;
  }
  w(`\n== 2. 导入 ==\n新建 ${news.length} 篇 / 已存在 ${exists.length} 篇`);

  let created = 0;
  for (let i = 0; i < news.length; i += 50) {
    const batch = news.slice(i, i + 50);
    const r = await post('/api/users/0/items', batch.map((m) => m._payload));
    if (r.status !== 200) throw new Error(`导入失败 ${r.status}: ${r.body.slice(0, 400)}`);
    const { map, failed } = parseKeys(r.body);
    created += Object.keys(map).length;
    w(`  批次 ${Math.floor(i / 50) + 1}: ${batch.length} 条 -> 成功 ${Object.keys(map).length}${Object.keys(failed).length ? ' 失败 ' + JSON.stringify(failed).slice(0, 200) : ''}`);
  }
  w(`新建成功: ${created}`);

  // 4. 已存在条目挂集合
  w('\n== 3. 已有条目加入新集合 ==');
  if (exists.length) {
    const keys = exists.map((m) => m.existingKey);
    const det = await getJson('/api/users/0/items?format=json&itemKey=' + keys.join(',') + '&limit=100');
    const byKey = new Map(det.map((d) => [d.key, d]));
    let ok = 0;
    for (const m of exists) {
      const d = byKey.get(m.existingKey);
      if (!d) { w(`  [跳过] ${(m.item.title || '').slice(0, 50)}`); continue; }
      const cur = new Set(d.data.collections || []);
      for (const s of m.secs) cur.add(colKey[s] || parentKey);
      const r = await patch('/api/users/0/items/' + d.key, { key: d.key, version: d.version, collections: [...cur] });
      const good = r.status === 204 || r.status === 200;
      if (good) ok++;
      w(`  ${good ? 'OK  ' : 'FAIL'} [${m.secs.join('/')}] ${(m.item.title || '').slice(0, 55)}`);
    }
    w(`  成功 ${ok} / ${exists.length}`);
  } else w('  无');

  // 5. 验证
  w('\n== 4. 验证 ==');
  const after = await getAll('/api/users/0/collections');
  const p2 = after.find((c) => c.key === parentKey);
  w(`${PARENT} [${parentKey}]: ${p2 && p2.meta ? p2.meta.numItems : '?'} 条（直接归属，含无章节文献）`);
  for (const s of SUBS) {
    const c = after.find((x) => x.key === colKey[s]);
    w(`  ${s} [${colKey[s]}]: ${c && c.meta ? c.meta.numItems : '?'} 条`);
  }
  const roots = after.filter((c) => !c.data.parentCollection).sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'));
  w('\n顶层结构:');
  for (const c of roots) {
    w(`  ${c.data.name} [${c.key}]`);
    for (const s of after.filter((x) => x.data.parentCollection === c.key)) w(`      └ ${s.data.name}`);
  }

  fs.writeFileSync(__dirname + '/import6_report.txt', out.join('\n'), 'utf8');
  console.log('\nDONE');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  fs.writeFileSync(__dirname + '/import6_report.txt', out.join('\n') + '\n\nERROR: ' + e.message, 'utf8');
  process.exit(1);
});
