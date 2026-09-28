// 解析 RIS 文件 -> Zotero item JSON，跨文件去重，并与现有库比对
const fs = require('fs');
const path = require('path');
const { getAll } = require('./api.js');

// 用法: node parse_ris.js <RIS目录> [文件1 文件2 ...]
// 目录也可由环境变量 RIS_DIR 提供；文件缺省时自动扫描目录下所有 .ris
const DIR = process.argv[2] || process.env.RIS_DIR || '.';
const FILES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.ris')).sort();

const MONTH = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

function parseRIS(text) {
  text = text.replace(/^\uFEFF/, '');
  const records = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/.exec(raw);
    if (!m) continue;
    const [, tag, val] = m;
    if (tag === 'TY') { cur = { TY: val.trim(), _tags: [] }; records.push(cur); continue; }
    if (!cur) continue;
    if (tag === 'ER') { cur = null; continue; }
    if (tag === 'AU' || tag === 'A1') (cur.AU = cur.AU || []).push(val.trim());
    else if (tag === 'KW') cur._tags.push(val.trim());
    else if (tag === 'SN') (cur.SN = cur.SN || []).push(val.trim());
    else cur[tag] = val.trim();
  }
  return records;
}

function splitName(s) {
  s = s.trim().replace(/\s+/g, ' ');
  if (s.includes(',')) {
    const [last, ...rest] = s.split(',');
    return { lastName: last.trim(), firstName: rest.join(' ').trim() };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { lastName: s, firstName: '' };
  return { lastName: parts.slice(0, -1).join(' '), firstName: parts[parts.length - 1] };
}

const TYPE_MAP = { JOUR: 'journalArticle', CPAPER: 'conferencePaper', CONF: 'conferencePaper', BOOK: 'book', CHAP: 'bookSection', THES: 'thesis', RPRT: 'report', ELEC: 'webpage', GEN: 'document' };

function toZotero(r) {
  const itemType = TYPE_MAP[r.TY] || 'journalArticle';
  const creators = (r.AU || []).map((a) => Object.assign({ creatorType: 'author' }, splitName(a)));
  const item = { itemType };
  if (r.TI) item.title = r.TI;
  if (creators.length) item.creators = creators;
  const journal = r.T2 || r.JO || r.JF || '';
  if (itemType === 'journalArticle' && journal) item.publicationTitle = journal;
  if (itemType === 'conferencePaper' && journal) item.conferenceName = journal;
  if (itemType === 'bookSection' && journal) item.bookTitle = journal;
  if (r.PY) item.date = r.DA && MONTH[String(r.DA).toUpperCase()] ? `${r.PY}-${MONTH[String(r.DA).toUpperCase()]}` : String(r.PY);
  if (!item.date && r.DA) item.date = r.DA;
  if (r.VL) item.volume = r.VL;
  if (r.IS) item.issue = r.IS;
  if (r.SP || r.EP) item.pages = [r.SP, r.EP].filter(Boolean).join('-');
  if (r.DO) item.DOI = r.DO;
  if (r.SN && r.SN.length) item.ISSN = r.SN.join(', ');
  if (r.AB) item.abstractNote = r.AB;
  if (r.PB) item.publisher = r.PB;
  if (r.UR) item.url = r.UR;
  if (r.AN) item.extra = 'WOS:' + String(r.AN).replace(/^WOS:/, '');
  const tags = (r._tags || []).map((t) => ({ tag: t }));
  if (tags.length) item.tags = tags;
  return item;
}

function normTitle(t) { return (t || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ''); }

(async () => {
  const out = [];
  const w = (s) => { out.push(String(s)); console.log(s); };

  // 1. 解析
  const all = [];
  w('== 解析 RIS ==');
  for (const f of FILES) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) { w(`[缺失] ${f}`); continue; }
    const text = fs.readFileSync(p, 'utf8');
    const recs = parseRIS(text);
    const sec = (/(\d+\.\d+)\.ris$/.exec(f) || [])[1];
    w(`${f}  ->  ${sec}  ${recs.length} 条`);
    for (const r of recs) {
      const z = toZotero(r);
      z._sec = sec;
      z._from = f;
      all.push(z);
    }
  }
  w(`合计解析: ${all.length} 条`);

  // 2. 跨文件去重（DOI 优先，其次归一化标题）；同一文献归入其出现的所有章节
  const groups = new Map();
  for (const z of all) {
    const k = z.DOI ? 'doi:' + z.DOI.toLowerCase() : 'ti:' + normTitle(z.title);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(z);
  }
  const merged = [];
  for (const [k, list] of groups) {
    const base = list.find((x) => x.abstractNote) || list[0];
    const secs = [...new Set(list.map((x) => x._sec))].sort();
    const froms = [...new Set(list.map((x) => x._from))];
    merged.push({ item: base, secs, froms, dupInFile: list.length });
  }
  const dupCount = all.length - merged.length;
  w(`\n== 跨文件去重 ==`);
  w(`去重后独立文献: ${merged.length} 条 (合并掉 ${dupCount} 条重复)`);
  const bySec = {};
  for (const m of merged) for (const s of m.secs) bySec[s] = (bySec[s] || 0) + 1;
  w('各章节归属(可重叠): ' + JSON.stringify(bySec, null, 0));

  // 3. 与现有库比对
  w('\n== 与现有 Zotero 库比对 ==');
  const existing = await getAll('/api/users/0/items?format=json');
  const exByDoi = new Map(), exByTi = new Map();
  for (const it of existing) {
    if (it.data.itemType === 'attachment' || it.data.itemType === 'note') continue;
    if (it.data.DOI) exByDoi.set(it.data.DOI.toLowerCase(), it);
    if (it.data.title) exByTi.set(normTitle(it.data.title), it);
  }
  w(`现有库条目(非附件): 已索引 ${exByDoi.size} 个 DOI / ${exByTi.size} 个标题`);
  let nNew = 0, nExist = 0;
  for (const m of merged) {
    const hit = (m.item.DOI && exByDoi.get(m.item.DOI.toLowerCase())) || exByTi.get(normTitle(m.item.title));
    if (hit) { m.existingKey = hit.key; m.existingTitle = hit.data.title; nExist++; }
    else nNew++;
  }
  w(`其中: 库中已存在 ${nExist} 条(只加入新集合, 不重复创建) / 全新 ${nNew} 条`);

  fs.writeFileSync(__dirname + '/ris_parsed.json', JSON.stringify(merged, null, 1), 'utf8');
  w('\n已写出 ris_parsed.json');
  fs.writeFileSync(__dirname + '/ris_parse_report.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
