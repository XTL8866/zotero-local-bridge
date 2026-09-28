// 新建父集合「国外文献」，把两个国外集合挂进去（只改层级，不动条目）
const fs = require('fs');
const { post, patch, getJson, getAll } = require('./api.js');

const TARGETS = [
  { key: 'QXNL48MP', name: '国外-制氢高动态-60' },
  { key: 'DDA7KXJ3', name: '国外-制氢数字化智能化-50' },
];
const NEW_NAME = '国外文献';
const log = [];
const w = (s) => { log.push(s); console.log(s); };

(async () => {
  // 0. 前置校验：确认目标集合存在且名称匹配
  const all = await getAll('/api/users/0/collections');
  for (const t of TARGETS) {
    const c = all.find((x) => x.key === t.key);
    if (!c) throw new Error(`集合不存在: ${t.key} (${t.name})`);
    if (c.data.name !== t.name) throw new Error(`名称不匹配: ${t.key} 实际为 "${c.data.name}"`);
    w(`确认目标: ${c.data.name} (${c.key})  条目 ${c.meta ? c.meta.numItems : '?'}`);
  }
  const dupe = all.find((c) => c.data.name === NEW_NAME);
  if (dupe) throw new Error(`已存在同名集合「${NEW_NAME}」(${dupe.key})，请先改名或删除`);

  // 1. 创建顶层父集合
  w(`\n创建父集合「${NEW_NAME}」...`);
  const created = await post('/api/users/0/collections', [{ name: NEW_NAME, parentCollection: false }]);
  if (created.status !== 200) throw new Error(`创建失败 ${created.status}: ${created.body.slice(0, 300)}`);
  const res = JSON.parse(created.body);
  const newKey = res.success && res.success['0'] ? res.success['0'] : null;
  if (!newKey) throw new Error('未能从响应中取到新集合 key: ' + created.body.slice(0, 300));
  w(`已创建: ${newKey}`);

  // 2. 一次性批量挂载（只占 1 次写授权）
  const payload = [];
  for (const t of TARGETS) {
    const cur = await getJson(`/api/users/0/collections/${t.key}`);
    payload.push({ key: t.key, version: cur.version, parentCollection: newKey, name: t.name });
  }
  const r = await patch('/api/users/0/collections', payload);
  w(`批量挂载响应: ${r.status}`);
  if (r.status !== 204 && r.status !== 200) {
    w('响应体: ' + r.body.slice(0, 500));
    w('批量失败，回退为逐个挂载...');
    for (const t of payload) {
      const rr = await patch(`/api/users/0/collections/${t.key}`, { key: t.key, version: t.version, parentCollection: newKey });
      if (rr.status !== 204 && rr.status !== 200) throw new Error(`挂载失败 ${t.name}: ${rr.status} ${rr.body.slice(0, 300)}`);
      w(`已挂载: ${t.name} -> ${NEW_NAME} (${rr.status})`);
    }
  } else {
    for (const t of TARGETS) w(`已挂载: ${t.name} -> ${NEW_NAME}`);
  }

  // 3. 验证
  w('\n验证:');
  const after = await getAll('/api/users/0/collections');
  let out = '\n最终结构:\n';
  for (const c of after.sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'))) {
    const p = c.data.parentCollection || '(顶层)';
    const pn = p === '(顶层)' ? '' : (after.find((x) => x.key === p) || {}).data.name;
    out += `  ${c.data.name} [${c.key}] 条目${c.meta ? c.meta.numItems : '?'}  父: ${pn || p}\n`;
  }
  w(out);
  fs.writeFileSync(__dirname + '/merge_result.txt', log.join('\n'), 'utf8');
  console.log('\nDONE');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  fs.writeFileSync(__dirname + '/merge_result.txt', log.join('\n') + '\n\nERROR: ' + e.message, 'utf8');
  process.exit(1);
});
