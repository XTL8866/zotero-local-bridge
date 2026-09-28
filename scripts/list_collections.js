const fs = require('fs');
const { getAll } = require('./api.js');

(async () => {
  const cols = await getAll('/api/users/0/collections');
  cols.sort((a, b) => a.data.name.localeCompare(b.data.name, 'zh'));
  let out = `集合总数: ${cols.length}\n\n`;
  out += 'KEY         | 条目数 | 名称\n';
  out += '-'.repeat(60) + '\n';
  for (const c of cols) {
    const n = (c.meta && c.meta.numItems) !== undefined ? c.meta.numItems : '?';
    out += `${c.key} | ${String(n).padStart(6)} | ${c.data.name}\n`;
    if (c.data.parentCollection) out += `            parent: ${c.data.parentCollection}\n`;
  }
  fs.writeFileSync(__dirname + '/collections.txt', out, 'utf8');
  console.log('written');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
