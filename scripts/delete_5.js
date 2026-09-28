// 在「5.多槽制氢」范围内，按名单匹配并删除文献（--apply 才真正删除；默认 dry-run）
const fs = require('fs');
const { getAll, getJson, del, req, serverId, getKey } = require('./api.js');

const PARENT_KEY = 'TRG4LX2Z'; // 5.多槽制氢
const SUBS = [
  { key: '5WDYTZQ6', name: '5.1' },
  { key: 'ILB5RPJA', name: '5.2' },
  { key: '7ASVQNPS', name: '5.3' },
  { key: 'FIMMVSMI', name: '5.4' },
];
const APPLY = process.argv.includes('--apply');

// ---- 删除名单（48 条）----
const LIST = [
  'A comparative investigation of four multi-channel flow field designs in PEM water electrolysis（Qiao / Applied Thermal Engineering 2026）',
  'A comprehensive study of parameters distribution in a short PEM water electrolyzer stack（Xu / Energy 2024）',
  'A fully off-grid green steel production（Rashidi / Energy 2026）',
  'A physics-structured latent dynamics model for ion contamination diagnosis in PEM（Wang / J Power Sources 2026）',
  'A performance prediction method based on data-driven for PEM（Luo / IJHE 2026）',
  'A Review of Diagnostic Tools for Evaluating PTL for PEM（Ghadbane / Electrochem Energy Reviews 2025）',
  'A review on PEM water electrolyzer: heat and mass transport（Zhou / RSER 2025）',
  'A solar-driven high-temperature electrolyzer using air as heat transfer medium（Liu / Applied Energy 2026）',
  'Analysis of anion exchange membrane electrolysis for hydrogen production（Yan / IJHE 2026）',
  'Analysis of Flow Channel Geometry and Flow Configuration on AEMWE（Rysavy / Energy Technology 2026）',
  'Assessment of hydrogen production using NaOH and KOH alkaline（Ramzy / Energy Reports 2025）',
  'Critical Factors Contributing to Thermally Induced Hotspots in PEM（Sheela / J Electrochem Soc 2025）',
  'Data-driven multi-stage DRO scheduling… electricity-hydrogen-refinery（Ning / Applied Energy 2025）',
  'Design and Performance of Alkaline Electrolyzers: HHO to Zero-Gap（Conka / Acta Polytechnica Hungarica 2025）',
  'Development of thermal control strategies for SOEC systems（Kim / Energy 2025）',
  'Distributionally robust scheduling… pipeline-road hydrogen transportation（Tan / Applied Energy 2026）',
  'Dynamic Electrical Circuit Modeling of PEM for Frequency Stability（Hossain / IEEE TIA 2023）',
  'Dynamic model-based HILS of PEMWE for fault diagnosis（Koo / IJHE 2026）',
  'Dynamic thermal management of PV, PT and electrolyzer（Ding / Applied Thermal Engineering 2026）',
  'Energy management strategy for multi-stack H2 storage system PEMEC+PEMFC（Lu / Applied Energy 2025）',
  'Evaporating water-cooled methanation reactor（SOEC P2M）（Aubin / Chem Eng J 2023）',
  'Experimental integration of FPV with AEM electrolyzer（Hayibo / IJHE 2025）',
  'Experimental investigation of water flow rates and wind speeds… PEM（Du / Energy 2025）',
  'Experimental investigation of ZnO/SiC and GO/CuO nanofluids… PEM（Yadkar / IJHE 2026）',
  'Feasibility assessment of H2-freshwater cogeneration… SOEC（Li / Applied Thermal Engineering 2025）',
  'Fuzzy electro-thermal coordinated overload control of PEM（Wu / ECM 2026）',
  'From Electrochemical Calibration to… 100 kW PEM Reversible Fuel Cell（Fragiacomo / Energies 2026）',
  'High-efficiency solar-to-hydrogen: CPV + SOEC（Kale / IJHE 2025）',
  'Hydrogen energy storage systems for grid resilience: review（Islam / Applied Energy 2026）',
  'Integrating multiphysics modeling and ML for PEM systems（Yang / Applied Energy 2025）',
  'Integration of phase change microcapsules in PV-EC（Li / Solar Energy 2025）',
  'Kinetic modeling… furfural hydrogenation to THFA（Beltrán-Borbor / IJHE 2026）',
  'Mass and charge transport in PTL for PEM: review（Lala / Energy Reports 2025）',
  'Multi-effect distillation… offshore PEM electrolyser（Haqiqi / Energy Reports 2025）',
  'Numerical analysis… PV-electrolyzer with nanofluid cooling PEMWE（Sheikholeslami / Renewable Energy 2026）',
  'Numerical investigation on steady and dynamic operation of PEM（Xu / IJHMT 2026）',
  'Open-Circuit Switch Fault Diagnosis… Buck Converter（Yodwong / Electronics 2023）',
  'Optimization control method of dual channel H2 system MOPSO-EEMD（Han / JRSE 2025）',
  'Optimization design of flow channel D/W ratio for AEMWE（Li / J Environ Chem Eng 2026）',
  'Optimization of a wet-cell electrolyzer for HHO gas（Fayez / Sci Rep 2026）',
  'Optimization of power allocation for multi-stack PEM EDCIBC（Lu / IJHE 2023）',
  'Optimal operation control strategy for off-grid PV H2（Pan / JRSE 2024）',
  'Optimizing the Impact of Flexible Resources on PFR（Kordkheili / IEEE TIA 2026）',
  'Power allocation strategy of multi-stack PEM… degradation（Qi / EPSR 2026）',
  'Solar Dish Collectors for Hydrogen Production: Review（Alsagri / IJER 2026）',
  'Sustained long-term efficiency in SOEC systems（Kim / ECM 2024）',
  'Transient modeling and control strategies for WT-PV… PEMEC（Zhang / IJHMT 2025）',
  'Two-dimensional, multiphase, multi-physics modeling of PEMWE（Neerob / IJHE 2025）',
];

// 自动匹配有歧义/误配的三条，人工核实后显式锁定
const OVERRIDE = {
  'Analysis of anion exchange membrane electrolysis for hydrogen production': 'SHY86DWC',
  'Distributionally robust scheduling… pipeline-road hydrogen transportation': '72VI6MFV',
  'Numerical analysis… PV-electrolyzer with nanofluid cooling PEMWE': 'FSGSXLNG',
  'Experimental integration of FPV with AEM electrolyzer': 'YYGKG75Z',
};

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').trim();
}
function parseEntry(raw) {
  const meta = (raw.match(/[（(]([^）)]*)[）)]/) || [])[1] || '';
  const core = raw.replace(/[（(].*$/, '').replace(/——.*$/, '').trim();
  const frags = core.split(/…|\.\.\./).map((x) => norm(x)).filter((x) => x.length >= 8);
  const author = (meta.split('/')[0] || '').trim();
  const journal = (meta.split('/')[1] || '').trim();
  return { raw, core, frags, author, journal };
}
function wordSim(a, b) {
  const sa = new Set(norm(a).split(' ').filter((w) => w.length > 2));
  const sb = new Set(norm(b).split(' ').filter((w) => w.length > 2));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

(async () => {
  const out = [];
  const w = (s) => { out.push(String(s)); console.log(s); };

  // 1. 收集 5.多槽制氢 范围内所有条目
  const byKey = new Map();
  for (const c of [{ key: PARENT_KEY, name: '5.多槽制氢' }, ...SUBS]) {
    const items = await getAll(`/api/users/0/collections/${c.key}/items/top?format=json`);
    for (const it of items) {
      if (!byKey.has(it.key)) byKey.set(it.key, { key: it.key, version: it.version, data: it.data, via: [] });
      byKey.get(it.key).via.push(c.name);
    }
    w(`集合 ${c.name}: ${items.length} 条`);
  }
  const items = [...byKey.values()];
  w(`范围内去重后条目: ${items.length} 条\n`);

  // 2. 匹配
  const hits = [];      // {entry, item, score, how}
  const misses = [];
  const ambiguous = [];
  for (const raw of LIST) {
    const e = parseEntry(raw);
    if (OVERRIDE[e.core]) {
      const it = items.find((x) => x.key === OVERRIDE[e.core]);
      if (!it) { misses.push(e); continue; }
      hits.push({ e, item: it, score: 999, how: 'locked', extra: [] });
      continue;
    }
    const cands = [];
    for (const it of items) {
      const nt = norm(it.data.title);
      let score = 0, how = '';
      for (const f of e.frags) {
        if (nt.includes(f)) { score += f.length; how = 'substr'; }
      }
      if (!score) {
        const sim = wordSim(e.core.replace(/…|\.\.\./g, ' '), it.data.title);
        if (sim >= 0.6) { score = Math.round(sim * 100); how = 'wordSim'; }
      }
      if (score > 0) cands.push({ it, score, how });
    }
    cands.sort((a, b) => b.score - a.score);
    if (!cands.length) { misses.push(e); continue; }
    const best = cands[0];
    const tied = cands.filter((c) => c.score === best.score);
    if (tied.length > 1) ambiguous.push({ e, tied });
    hits.push({ e, item: best.it, score: best.score, how: best.how, extra: tied.slice(1) });
  }

  w('== 匹配结果 ==');
  for (const h of hits) {
    const coll = h.item.via.join('/');
    w(`[${h.how}:${h.score}] ${h.item.key} (${coll})`);
    w(`    名单: ${h.e.core.slice(0, 80)}`);
    w(`    库内: ${(h.item.data.title || '').slice(0, 80)}  ${h.item.data.date || ''}`);
    if (h.extra.length) w(`    !! 另有 ${h.extra.length} 个同分候选: ${h.extra.map((x) => x.it.key + ' ' + x.it.data.title.slice(0, 45)).join(' | ')}`);
  }
  w(`\n名单 ${LIST.length} 条 -> 匹配成功 ${hits.length} / 未匹配 ${misses.length}`);
  if (misses.length) {
    w('\n== 未匹配 ==');
    for (const m of misses) w(`  - ${m.core}   (${m.author} / ${m.journal})`);
  }
  if (ambiguous.length) {
    w('\n== 存在同分候选(需人工确认) ==');
    for (const a of ambiguous) {
      w(`  * ${a.e.core.slice(0, 60)}`);
      for (const t of a.tied) w(`      ${t.it.key} | ${t.it.data.title.slice(0, 70)} | ${t.it.data.publicationTitle || ''}`);
    }
  }

  const keys = [...new Set(hits.map((h) => h.item.key))];
  w(`\n待删除条目 key (${keys.length} 个): ${keys.join(',')}`);
  const remain = items.filter((it) => !keys.includes(it.key));
  w(`删除后 5.多槽制氢 范围剩余: ${remain.length} 条`);

  // 3. 执行
  if (APPLY) {
    if (ambiguous.length) { w('\n[中止] 存在同分候选，未执行删除。'); fs.writeFileSync(__dirname + '/delete5_report.txt', out.join('\n'), 'utf8'); return; }
    w('\n== 执行删除（移入 Zotero 回收站）==');
    const sid = await serverId();
    const key = getKey(sid);
    for (let i = 0; i < keys.length; i += 50) {
      const batch = keys.slice(i, i + 50);
      // DELETE 必须带 If-Unmodified-Since-Version（库当前版本，取任意 GET 响应头）
      const probe = await req('GET', '/api/users/0/items?limit=1');
      const libVer = probe.headers['last-modified-version'];
      const r = await req('DELETE', '/api/users/0/items?itemKey=' + batch.join(','), null,
        { 'Zotero-Server-ID': sid, 'Zotero-API-Key': key, 'If-Unmodified-Since-Version': libVer });
      w(`  批次 ${Math.floor(i / 50) + 1}: ${batch.length} 条 (libVer=${libVer}) -> ${r.status} ${r.status === 204 || r.status === 200 ? 'OK' : r.body.slice(0, 250)}`);
    }
    // 验证
    const after = await getAll('/api/users/0/collections');
    w('\n== 删除后 ==');
    for (const c of [{ key: PARENT_KEY, name: '5.多槽制氢' }, ...SUBS]) {
      const cc = after.find((x) => x.key === c.key);
      w(`  ${c.name}: ${cc && cc.meta ? cc.meta.numItems : '?'} 条`);
    }
  } else {
    w('\n[dry-run] 未执行删除。确认无误后加 --apply 运行。');
  }

  fs.writeFileSync(__dirname + '/delete5_report.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
