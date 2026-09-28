// 对自动匹配存疑的名单项，按「作者姓氏 + 标题关键词」在库内重新定位
const fs = require('fs');
const { getAll } = require('./api.js');

const QUERIES = [
  { id: 1, author: 'Li', core: 'Advances in Anion Exchange Membrane Water Electrolysis', journal: 'ChemCatChem' },
  { id: 2, author: 'Avargani', core: 'Advancements in non-renewable and hybrid hydrogen production', journal: 'Fuel' },
  { id: 4, author: 'Kasani', core: 'Catalysts for Direct Seawater Electrolysis', journal: 'ChemElectroChem' },
  { id: 5, author: 'Chetry', core: 'Electrocatalytic hydrogen generation from seawater', journal: 'JMCA' },
  { id: 6, author: 'Rasheed', core: 'Greener hydrogen production and storage revolution', journal: 'Fuel' },
  { id: 7, author: 'Ma', core: 'Large scale of green hydrogen storage: Opportunities', journal: 'IJHE' },
  { id: 8, author: 'Maier', core: 'Mass transport in PEM water electrolysers: A review', journal: 'IJHE' },
  { id: 9, author: 'Yu', core: 'Multiphysics and Multiscale Modeling of PEM', journal: 'Energies' },
  { id: 10, author: 'Tahan', core: 'Recent advances in hydrogen compressors', journal: 'IJHE' },
  { id: 11, author: 'Zhang', core: 'Water Electrolysis toward Elevated Temperature', journal: 'Chem Rev' },
];

const STOP = new Set(['the', 'of', 'for', 'and', 'in', 'on', 'a', 'an', 'to', 'from', 'with', 'by', 'review', 'advances', 'recent', 'toward', 'via']);
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').trim(); }
function words(s) { return norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)); }

(async () => {
  const out = [];
  const w = (s) => { out.push(String(s)); console.log(s); };
  const all = await getAll('/api/users/0/items?format=json');
  const cols = await getAll('/api/users/0/collections');
  const colName = new Map(cols.map((c) => [c.key, c.data.name]));
  const pool = all.filter((it) => !['attachment', 'note'].includes(it.data.itemType));
  w(`库内非附件条目: ${pool.length}\n`);

  for (const q of QUERIES) {
    const qw = new Set(words(q.core));
    const scored = pool.map((it) => {
      const d = it.data;
      const tw = new Set(words(d.title));
      let inter = 0;
      for (const x of qw) if (tw.has(x)) inter++;
      const titleSim = inter / Math.max(qw.size, 1);
      const authors = (d.creators || []).map((c) => (c.lastName || '').toLowerCase());
      const aMatch = authors.includes(q.author.toLowerCase());
      return { it, titleSim, aMatch, score: (aMatch ? 1 : 0) + titleSim };
    }).filter((x) => x.aMatch || x.titleSim >= 0.4)
      .sort((a, b) => b.score - a.score).slice(0, 6);

    w(`\n[${q.id}] ${q.core}   <${q.author} / ${q.journal}>`);
    if (!scored.length) { w('    (无候选)'); continue; }
    for (const s of scored) {
      const d = s.it.data;
      const cs = (d.collections || []).map((c) => colName.get(c) || c).join(',');
      const au = (d.creators || []).slice(0, 2).map((c) => c.lastName).join('/');
      w(`    ${s.aMatch ? '[作者✓]' : '[      ]'} sim=${s.titleSim.toFixed(2)} ${s.it.key}`);
      w(`       ${d.title.slice(0, 88)}`);
      w(`       ${au} | ${d.publicationTitle || ''} | ${d.date || ''} | 集合: ${cs || '无'}`);
    }
  }
  fs.writeFileSync(__dirname + '/lookup6.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
