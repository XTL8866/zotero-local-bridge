const fs = require('fs');
const { get } = require('./api.js');

const A = { key: 'QXNL48MP', name: '国外-制氢高动态-60' };
const B = { key: 'DDA7KXJ3', name: '国外-制氢数字化智能化-50' };

(async () => {
  // format=keys 返回纯文本（换行分隔），不是 JSON
  const ra = await get(`/api/users/0/collections/${A.key}/items/top?format=keys&limit=100`);
  const rb = await get(`/api/users/0/collections/${B.key}/items/top?format=keys&limit=100`);
  const ia = ra.body.trim().split(/\s+/).filter(Boolean);
  const ib = rb.body.trim().split(/\s+/).filter(Boolean);
  const sa = new Set(ia), sb = new Set(ib);
  const inter = [...sa].filter((k) => sb.has(k));
  let out = `${A.name}: ${sa.size} 条\n${B.name}: ${sb.size} 条\n交集(重复): ${inter.length} 条\n并集: ${new Set([...sa, ...sb]).size} 条\n`;
  out += '\n为避免拉全量数据，交集仅列出前 20 个 key:\n' + inter.slice(0, 20).join(' ') + '\n';
  fs.writeFileSync(__dirname + '/overlap.txt', out, 'utf8');
  console.log(out);
})().catch((e) => console.error('ERR', e.message));
