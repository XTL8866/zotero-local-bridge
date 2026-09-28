// 解析第 7 章 RIS -> 去重 -> 与现有库比对
const fs = require('fs');
const path = require('path');
const { getAll } = require('./api.js');

const DIR = 'D:/浏览器下载文件';
const FILES = ['savedrecs (3).ris', 'savedrecs (4).ris', 'savedrecs (5).ris'];

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
  if (s.includes(',')) { const [last, ...rest] = s.split(','); return { lastName: last.trim(), firstName: rest.join(' ').trim() }; }
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

  const all = [];
  w('== 解析 ==');
  for (const f of FILES) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) { w(`[缺失] ${f}`); continue; }
    const st = fs.statSync(p);
    const recs = parseRIS(fs.readFileSync(p, 'utf8'));
    w(`${f}  ${Math.round(st.size / 1024)}KB  ->  ${recs.length} 条`);
    for (const r of recs) { const z = toZotero(r); z._from = f; all.push(z); }
  }
  w(`合计: ${all.length} 条`);

  const groups = new Map();
  for (const z of all) {
    const k = z.DOI ? 'doi:' + z.DOI.toLowerCase() : 'ti:' + normTitle(z.title);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(z);
  }
  const merged = [];
  for (const [, list] of groups) {
    const base = list.find((x) => x.abstractNote) || list[0];
    merged.push({ item: base, froms: [...new Set(list.map((x) => x._from))], dup: list.length });
  }
  w(`\n== 去重 ==\n${all.length} 条 -> 独立文献 ${merged.length} 篇（合并 ${all.length - merged.length} 条）`);

  const existing = await getAll('/api/users/0/items?format=json');
  const exByDoi = new Map(), exByTi = new Map();
  for (const it of existing) {
    if (['attachment', 'note'].includes(it.data.itemType)) continue;
    if (it.data.DOI) exByDoi.set(it.data.DOI.toLowerCase(), it);
    if (it.data.title) exByTi.set(normTitle(it.data.title), it);
  }
  let nNew = 0, nExist = 0;
  for (const m of merged) {
    const hit = (m.item.DOI && exByDoi.get(m.item.DOI.toLowerCase())) || exByTi.get(normTitle(m.item.title));
    if (hit) { m.existingKey = hit.key; m.existingTitle = hit.data.title; nExist++; } else nNew++;
  }
  w(`\n== 与现有库比对 ==\n库中已有 ${nExist} 篇（只加集合） / 全新 ${nNew} 篇`);

  w('\n== 前 15 条标题预览 ==');
  for (const m of merged.slice(0, 15)) {
    w(`  [${(m.item.date || '').slice(0, 4)}] ${(m.item.title || '').slice(0, 78)}  ${m.existingKey ? '(已存在)' : ''}`);
  }
  const yrs = {};
  for (const m of merged) { const y = (m.item.date || '').slice(0, 4) || '?'; yrs[y] = (yrs[y] || 0) + 1; }
  w('\n年份分布: ' + JSON.stringify(yrs));

  fs.writeFileSync(__dirname + '/ris7_parsed.json', JSON.stringify(merged, null, 1), 'utf8');
  fs.writeFileSync(__dirname + '/ris7_parse_report.txt', out.join('\n'), 'utf8');
  console.log('\nOK');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
