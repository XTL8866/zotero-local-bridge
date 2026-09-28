// 补全：回收站数量 + 递归统计各顶层分支（含孙级集合）
const fs = require('fs');
const { getAll, req } = require('./api.js');

(async () => {
  const out = [];
  const w = (s) => { out.push(String(s)); console.log(s); };

  const cols = await getAll('/api/users/0/collections');
  const items = await getAll('/api/users/0/items?format=json');
  const live = items.filter((it) => it.data.deleted !== 1);
  const top = live.filter((it) => !['attachment', 'note'].includes(it.data.itemType));

  // 回收站
  let trashN = null;
  const t = await req('GET', '/api/users/0/items/trash?limit=100');
  if (t.status === 200) {
    try { trashN = JSON.parse(t.body).length; } catch (e) {}
  }
  w('== 回收站 ==');
  w(`API /items/trash: ${trashN === null ? `不可读(status ${t.status})` : trashN + ' 条(首100)'}`);

  const foreignRoot = cols.find((c) => c.data.name === '国外文献');
  const foreignKeys = new Set();
  if (foreignRoot) {
    foreignKeys.add(foreignRoot.key);
    for (const c of cols) if (c.data.parentCollection === foreignRoot.key) foreignKeys.add(c.key);
  }
  const rest = top.filter((it) => !(it.data.collections || []).some((k) => foreignKeys.has(k)));

  const roots = cols.filter((c) => !c.data.parentCollection).sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'));
  w('\n== 各顶层分支（递归含孙级，条目按分支去重，跨分支会重复计）==');
  let totalBranch = 0;
  for (const r of roots) {
    const keys = new Set([r.key]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of cols) if (c.data.parentCollection && keys.has(c.data.parentCollection) && !keys.has(c.key)) { keys.add(c.key); grew = true; }
    }
    const n = rest.filter((it) => (it.data.collections || []).some((k) => keys.has(k))).length;
    const allN = top.filter((it) => (it.data.collections || []).some((k) => keys.has(k))).length;
    w(`${r.data.name} [${r.key}]  ${n} 篇  (含国外等全库口径: ${allN})   子集合数 ${keys.size - 1}`);
    if (r.key !== (foreignRoot && foreignRoot.key)) totalBranch += n;
    // 打印分支内集合明细
    for (const c of cols.filter((x) => keys.has(x.key))) {
      const cn = rest.filter((it) => (it.data.collections || []).includes(c.key)).length;
      if (cn) w(`      ${c.data.name}: ${cn}`);
    }
  }
  w(`\n各分支合计(不含国外文献, 跨分支重复计数): ${totalBranch}`);
  const orphan = rest.filter((it) => !(it.data.collections || []).length);
  w(`未归入任何集合: ${orphan.length} 篇`);
  w(`排除国外文献后总计: ${rest.length} 篇`);

  fs.writeFileSync(__dirname + '/stats_extra.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
