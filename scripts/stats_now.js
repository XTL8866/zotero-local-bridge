// 当前文献统计（含排除「国外文献」文件夹后的数量）
const fs = require('fs');
const { getAll } = require('./api.js');

(async () => {
  const out = [];
  const w = (s) => { out.push(String(s)); console.log(s); };

  const cols = await getAll('/api/users/0/collections');
  const items = await getAll('/api/users/0/items?format=json');
  const colName = new Map(cols.map((c) => [c.key, c.data.name]));
  const parentOf = new Map(cols.map((c) => [c.key, c.data.parentCollection]));

  const trashed = items.filter((it) => it.data.deleted === 1);
  const live = items.filter((it) => it.data.deleted !== 1);
  const top = live.filter((it) => !['attachment', 'note'].includes(it.data.itemType));
  const attach = live.filter((it) => it.data.itemType === 'attachment');

  w('== 总体 ==');
  w(`库中条目(不含回收站): ${live.length}`);
  w(`  顶层文献条目: ${top.length}`);
  w(`  附件: ${attach.length}`);
  w(`回收站: ${trashed.length}`);
  w(`集合数: ${cols.length}`);

  // 国外文献文件夹
  const foreignRoot = cols.find((c) => c.data.name === '国外文献');
  const foreignKeys = new Set();
  if (foreignRoot) {
    foreignKeys.add(foreignRoot.key);
    for (const c of cols) if (c.data.parentCollection === foreignRoot.key) foreignKeys.add(c.key);
  }
  const isForeign = (it) => (it.data.collections || []).some((k) => foreignKeys.has(k));
  const foreignItems = top.filter(isForeign);
  const restItems = top.filter((it) => !isForeign(it));

  w('\n== 国外文献文件夹 ==');
  if (foreignRoot) {
    w(`父集合: ${foreignRoot.data.name} [${foreignRoot.key}] 直接条目 ${foreignRoot.meta ? foreignRoot.meta.numItems : 0}`);
    for (const c of cols.filter((x) => x.data.parentCollection === foreignRoot.key)) {
      w(`  └ ${c.data.name} [${c.key}] ${c.meta ? c.meta.numItems : 0} 条`);
    }
    w(`去重后该文件夹文献数: ${foreignItems.length}`);
  } else w('未找到「国外文献」');

  w('\n== 排除国外文献后 ==');
  w(`剩余文献: ${restItems.length} 篇`);

  // 层级树（排除国外文献）
  w('\n== 各顶层文件夹（已排除国外文献）==');
  const roots = cols.filter((c) => !c.data.parentCollection && c.key !== (foreignRoot && foreignRoot.key))
    .sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'));
  let sumInTree = 0;
  for (const r of roots) {
    const subs = cols.filter((x) => x.data.parentCollection === r.key).sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'));
    const direct = restItems.filter((it) => (it.data.collections || []).includes(r.key)).length;
    w(`${r.data.name} [${r.key}] 直接 ${direct} 条`);
    for (const s of subs) {
      const n = restItems.filter((it) => (it.data.collections || []).includes(s.key)).length;
      w(`   └ ${s.data.name}: ${n} 条`);
      sumInTree += n;
    }
    sumInTree += direct;
  }
  w(`\n上述文件夹条目计数之和(含跨集合重复计数): ${sumInTree}`);

  // 未归入任何集合
  const orphan = restItems.filter((it) => !(it.data.collections || []).length);
  w(`未归入任何集合的文献: ${orphan.length} 篇`);

  // 按年份
  const byYear = {};
  for (const it of restItems) {
    const d = (it.data.date || '').match(/(19|20)\d{2}/);
    const y = d ? d[0] : '未知';
    byYear[y] = (byYear[y] || 0) + 1;
  }
  w('\n== 排除国外文献后的年份分布 ==');
  for (const y of Object.keys(byYear).sort()) w(`  ${y}: ${byYear[y]}`);

  fs.writeFileSync(__dirname + '/stats_now.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
