// 把解析结果导入 Zotero：建 5.1/5.2/5.3/5.4 集合 -> 新建条目 -> 已有条目挂集合
const fs = require('fs');
const { post, patch, getAll, getJson } = require('./api.js');

const merged = JSON.parse(fs.readFileSync(__dirname + '/ris_parsed.json', 'utf8'));
const SECS = ['5.1', '5.2', '5.3', '5.4'];
const out = [];
const w = (s) => { out.push(String(s)); console.log(s); };

function parseKeys(res) {
  // Zotero 写响应: {"success":{"0":"KEY"}, "successful":{"0":{...}}, "failed":{}}
  const map = {};
  try {
    const j = JSON.parse(res);
    if (j.success) for (const [i, k] of Object.entries(j.success)) map[i] = k;
    if (j.successful) for (const [i, o] of Object.entries(j.successful)) {
      if (!map[i]) map[i] = (o && o.key) || (o && o.data && o.data.key);
    }
    return { map, failed: j.failed || {} };
  } catch (e) { return { map, failed: { err: res.slice(0, 200) } }; }
}

(async () => {
  // ---- 1. 集合 ----
  w('== 1. 集合 ==');
  const cols = await getAll('/api/users/0/collections');
  const colKey = {};
  for (const s of SECS) {
    const hit = cols.find((c) => c.data.name === s);
    if (hit) { colKey[s] = hit.key; w(`已存在: ${s} (${hit.key})`); }
  }
  const missing = SECS.filter((s) => !colKey[s]);
  if (missing.length) {
    w(`创建集合: ${missing.join(', ')}`);
    const r = await post('/api/users/0/collections', missing.map((name) => ({ name })));
    if (r.status !== 200) throw new Error(`创建集合失败 ${r.status}: ${r.body.slice(0, 300)}`);
    const { map, failed } = parseKeys(r.body);
    missing.forEach((name, i) => {
      const k = map[String(i)];
      if (!k) throw new Error(`集合 ${name} 未返回 key; failed=${JSON.stringify(failed)}`);
      colKey[name] = k;
      w(`  已创建: ${name} -> ${k}`);
    });
  }

  // ---- 2. 拆分：新条目 / 已存在条目 ----
  const news = merged.filter((m) => !m.existingKey);
  const exists = merged.filter((m) => m.existingKey);
  for (const m of merged) {
    const item = Object.assign({}, m.item);
    delete item._sec; delete item._from;
    item.collections = m.secs.map((s) => colKey[s]);
    m._payload = item;
  }
  w(`\n== 2. 待处理 ==`);
  w(`新建条目: ${news.length} / 库中已存在: ${exists.length}`);

  // ---- 3. 批量新建（≤50/批）----
  w('\n== 3. 新建条目 ==');
  const created = [];
  for (let i = 0; i < news.length; i += 50) {
    const batch = news.slice(i, i + 50);
    const r = await post('/api/users/0/items', batch.map((m) => m._payload));
    if (r.status !== 200) throw new Error(`导入失败 ${r.status}: ${r.body.slice(0, 400)}`);
    const { map, failed } = parseKeys(r.body);
    w(`  批次 ${Math.floor(i / 50) + 1}: 请求 ${batch.length}, 成功 ${Object.keys(map).length}${Object.keys(failed).length ? ', 失败 ' + JSON.stringify(failed).slice(0, 200) : ''}`);
    for (const k of Object.values(map)) created.push(k);
  }
  w(`新建成功合计: ${created.length}`);

  // ---- 4. 已存在条目：合并 collections ----
  w('\n== 4. 已存在条目加入新集合 ==');
  if (exists.length) {
    const keys = exists.map((m) => m.existingKey);
    const det = await getJson('/api/users/0/items?format=json&itemKey=' + keys.join(',') + '&limit=100');
    const byKey = new Map(det.map((d) => [d.key, d]));
    const payload = [];
    for (const m of exists) {
      const d = byKey.get(m.existingKey);
      if (!d) { w(`  [跳过] 取不到版本: ${m.existingKey} ${(m.item.title || '').slice(0, 50)}`); continue; }
      const cur = new Set(d.data.collections || []);
      for (const s of m.secs) cur.add(colKey[s]);
      payload.push({ key: d.key, version: d.version, collections: [...cur] });
      w(`  + ${m.secs.join('/')}  ${(m.item.title || '').slice(0, 60)}`);
    }
    if (payload.length) {
      const r = await patch('/api/users/0/items', payload);
      w(`  PATCH 响应: ${r.status} ${r.status === 200 ? '' : r.body.slice(0, 300)}`);
    }
  } else {
    w('  无');
  }

  // ---- 5. 验证：各集合条目数 ----
  w('\n== 5. 验证 ==');
  const after = await getAll('/api/users/0/collections');
  for (const s of SECS) {
    const c = after.find((x) => x.key === colKey[s]);
    if (c) w(`  ${s} [${colKey[s]}]: ${c.meta ? c.meta.numItems : '?'} 条`);
  }
  const total = await getAll('/api/users/0/items/top?format=keys&limit=100');
  w(`  库顶层条目总数: ${total.length}`);

  fs.writeFileSync(__dirname + '/import_report.txt', out.join('\n'), 'utf8');
  console.log('\nDONE');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  fs.writeFileSync(__dirname + '/import_report.txt', out.join('\n') + '\n\nERROR: ' + e.message, 'utf8');
  process.exit(1);
});
