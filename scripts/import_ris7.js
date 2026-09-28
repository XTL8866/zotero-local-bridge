// 第 7 章导入：建集合「7.」-> 批量建条目 -> 已有条目挂集合
const fs = require('fs');
const { post, patch, getAll, getJson } = require('./api.js');

const merged = JSON.parse(fs.readFileSync(__dirname + '/ris7_parsed.json', 'utf8'));
const NEW_NAME = '7.';
const out = [];
const w = (s) => { out.push(String(s)); console.log(s); };

function parseKeys(res) {
  const j = JSON.parse(res);
  const map = {};
  if (j.success) for (const [i, k] of Object.entries(j.success)) map[i] = k;
  if (j.successful) for (const [i, o] of Object.entries(j.successful)) if (!map[i]) map[i] = (o && o.key) || (o && o.data && o.data.key);
  return { map, failed: j.failed || {} };
}

(async () => {
  // 1. 集合
  w('== 1. 集合 ==');
  let cols = await getAll('/api/users/0/collections');
  let c = cols.find((x) => x.data.name === NEW_NAME);
  let colKey;
  if (c) { colKey = c.key; w(`已存在: ${NEW_NAME} (${c.key})`); }
  else {
    const r = await post('/api/users/0/collections', [{ name: NEW_NAME, parentCollection: false }]);
    if (r.status !== 200) throw new Error(`创建失败 ${r.status}: ${r.body.slice(0, 300)}`);
    const { map, failed } = parseKeys(r.body);
    colKey = map['0'];
    if (!colKey) throw new Error('未取到 key: ' + r.body.slice(0, 200) + ' failed=' + JSON.stringify(failed));
    w(`已创建: 「${NEW_NAME}」-> ${colKey}`);
  }

  // 2. 拆分
  const news = merged.filter((m) => !m.existingKey);
  const exists = merged.filter((m) => m.existingKey);
  for (const m of merged) {
    const item = Object.assign({}, m.item);
    delete item._from;
    item.collections = [colKey];
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

  // 3. 已有条目挂集合
  w('\n== 3. 已有条目加入新集合 ==');
  if (exists.length) {
    const det = await getJson('/api/users/0/items?format=json&itemKey=' + exists.map((m) => m.existingKey).join(',') + '&limit=100');
    const byKey = new Map(det.map((d) => [d.key, d]));
    let ok = 0;
    for (const m of exists) {
      const d = byKey.get(m.existingKey);
      if (!d) { w(`  [跳过] ${(m.item.title || '').slice(0, 50)}`); continue; }
      const cur = new Set(d.data.collections || []);
      cur.add(colKey);
      const r = await patch('/api/users/0/items/' + d.key, { key: d.key, version: d.version, collections: [...cur] });
      const good = r.status === 204 || r.status === 200;
      if (good) ok++;
      w(`  ${good ? 'OK  ' : 'FAIL'} ${(m.item.title || '').slice(0, 58)}`);
    }
    w(`  成功 ${ok} / ${exists.length}`);
  } else w('  无');

  // 4. 验证
  w('\n== 4. 验证 ==');
  const after = await getAll('/api/users/0/collections');
  const cc = after.find((x) => x.key === colKey);
  w(`「${NEW_NAME}」[${colKey}]: ${cc && cc.meta ? cc.meta.numItems : '?'} 条`);
  const roots = after.filter((x) => !x.data.parentCollection).sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'));
  w('\n顶层结构:');
  for (const r of roots) w(`  ${r.data.name} [${r.key}] ${r.meta ? r.meta.numItems : 0} 条`);

  fs.writeFileSync(__dirname + '/import7_report.txt', out.join('\n'), 'utf8');
  console.log('\nDONE');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  fs.writeFileSync(__dirname + '/import7_report.txt', out.join('\n') + '\n\nERROR: ' + e.message, 'utf8');
  process.exit(1);
});
