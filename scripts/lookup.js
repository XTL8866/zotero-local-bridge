// 查证三个可疑匹配：按关键词全库搜索 + 打印指定 key 的完整信息
const fs = require('fs');
const { getAll, getJson } = require('./api.js');

const KEYS = ['YYGKG75Z', '72VI6MFV', 'KWNW3N6V', '865T8JZT', 'FSGSXLNG'];
const QUERIES = ['anion exchange membrane electrolysis for hydrogen production'];

function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').trim(); }

(async () => {
  const out = [];
  const w = (s) => { out.push(String(s)); console.log(s); };
  const all = await getAll('/api/users/0/items?format=json');
  const cols = await getAll('/api/users/0/collections');
  const colName = new Map(cols.map((c) => [c.key, c.data.name]));

  w('== 指定 key 的完整信息 ==');
  for (const k of KEYS) {
    const it = all.find((x) => x.key === k);
    if (!it) { w(`\n${k}: 不存在`); continue; }
    const d = it.data;
    const cs = (d.collections || []).map((c) => colName.get(c) || c).join(', ');
    w(`\n${k}`);
    w(`  标题: ${d.title}`);
    w(`  作者: ${(d.creators || []).slice(0, 3).map((c) => (c.lastName || '') + ' ' + (c.firstName || '')).join('; ')}`);
    w(`  期刊: ${d.publicationTitle || '-'}  ${d.date || ''}`);
    w(`  集合: ${cs || '(无)'}`);
  }

  w('\n\n== 关键词搜索（全库）==');
  for (const q of QUERIES) {
    const nq = norm(q);
    w(`\n查询: ${q}`);
    const hits = all.filter((it) => ['attachment', 'note'].includes(it.data.itemType) ? false : norm(it.data.title).includes(nq));
    if (!hits.length) {
      w('  精确包含: 无。相似候选:');
      const words = new Set(nq.split(' ').filter((x) => x.length > 3));
      const sim = all.filter((it) => !['attachment', 'note'].includes(it.data.itemType))
        .map((it) => {
          const ws = new Set(norm(it.data.title).split(' ').filter((x) => x.length > 3));
          let inter = 0; for (const x of words) if (ws.has(x)) inter++;
          return { it, s: inter / Math.max(words.size, 1) };
        })
        .filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 8);
      for (const x of sim) {
        const d = x.it.data;
        const cs = (d.collections || []).map((c) => colName.get(c) || c).join(', ');
        w(`  [${x.s.toFixed(2)}] ${x.it.key} | ${d.title.slice(0, 75)} | ${d.publicationTitle || ''} ${d.date || ''} | ${cs}`);
      }
    } else {
      for (const it of hits) {
        const d = it.data;
        const cs = (d.collections || []).map((c) => colName.get(c) || c).join(', ');
        w(`  ${it.key} | ${d.title.slice(0, 80)} | ${d.publicationTitle || ''} ${d.date || ''} | ${cs}`);
      }
    }
  }

  // 另外：找作者 Yan 且 2026、AEM 相关的条目
  w('\n\n== 作者含 Yan 且标题含 anion exchange 的条目 ==');
  for (const it of all) {
    const d = it.data;
    if (['attachment', 'note'].includes(d.itemType)) continue;
    const t = norm(d.title);
    if (t.includes('anion exchange') && (d.creators || []).some((c) => (c.lastName || '').toLowerCase() === 'yan')) {
      const cs = (d.collections || []).map((c) => colName.get(c) || c).join(', ');
      w(`  ${it.key} | ${d.title.slice(0, 85)} | ${d.publicationTitle || ''} ${d.date || ''} | ${cs}`);
    }
  }

  fs.writeFileSync(__dirname + '/lookup.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
