// 新建顶层集合「5.多槽制氢」，把 5.1~5.4 挂进去（只改层级，不动条目）
const fs = require('fs');
const { post, patch, getJson, getAll } = require('./api.js');

const NEW_NAME = '5.多槽制氢';
const TARGETS = [
  { key: '5WDYTZQ6', name: '5.1' },
  { key: 'ILB5RPJA', name: '5.2' },
  { key: '7ASVQNPS', name: '5.3' },
  { key: 'FIMMVSMI', name: '5.4' },
];
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
  const cols = await getAll('/api/users/0/collections');
  for (const t of TARGETS) {
    const c = cols.find((x) => x.key === t.key);
    if (!c) throw new Error(`集合不存在: ${t.key} (${t.name})`);
    if (c.data.name !== t.name) throw new Error(`名称不匹配: ${t.key} 实际 "${c.data.name}"`);
    w(`确认: ${c.data.name} [${c.key}] ${c.meta ? c.meta.numItems : '?'} 条`);
  }
  if (cols.find((c) => c.data.name === NEW_NAME)) throw new Error(`已存在同名集合「${NEW_NAME}」`);

  w(`\n创建父集合「${NEW_NAME}」...`);
  const r = await post('/api/users/0/collections', [{ name: NEW_NAME, parentCollection: false }]);
  if (r.status !== 200) throw new Error(`创建失败 ${r.status}: ${r.body.slice(0, 300)}`);
  const { map } = parseKeys(r.body);
  const newKey = map['0'];
  if (!newKey) throw new Error('未取到新集合 key: ' + r.body.slice(0, 300));
  w(`已创建: ${newKey}`);

  for (const t of TARGETS) {
    const cur = await getJson(`/api/users/0/collections/${t.key}`);
    const rr = await patch(`/api/users/0/collections/${t.key}`, { key: t.key, version: cur.version, parentCollection: newKey });
    if (rr.status !== 204 && rr.status !== 200) throw new Error(`挂载失败 ${t.name}: ${rr.status} ${rr.body.slice(0, 300)}`);
    w(`已挂载: ${t.name} -> ${NEW_NAME} (${rr.status})`);
  }

  w('\n== 最终结构 ==');
  const after = await getAll('/api/users/0/collections');
  const root = after.filter((c) => !c.data.parentCollection).sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'));
  for (const c of root) {
    w(`${c.data.name} [${c.key}] ${c.meta ? c.meta.numItems : 0} 条`);
    for (const s of after.filter((x) => x.data.parentCollection === c.key).sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'))) {
      w(`    └ ${s.data.name} [${s.key}] ${s.meta ? s.meta.numItems : 0} 条`);
    }
  }
  fs.writeFileSync(__dirname + '/nest5_report.txt', out.join('\n'), 'utf8');
  console.log('\nDONE');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  fs.writeFileSync(__dirname + '/nest5_report.txt', out.join('\n') + '\n\nERROR: ' + e.message, 'utf8');
  process.exit(1);
});
