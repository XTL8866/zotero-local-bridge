// 在「6.制氢场」范围内按名单匹配并删除（默认 dry-run，加 --apply 执行）
const fs = require('fs');
const { getAll, req, serverId, getKey } = require('./api.js');

const PARENT_KEY = 'V6VDLYAS'; // 6.制氢场
const SUBS = [
  { key: 'QKETIEYV', name: '6.1' },
  { key: 'ZSP4L28H', name: '6.2' },
  { key: '27BIXUGR', name: '6.3.1' },
  { key: 'DW7WJHMP', name: '6.3.2' },
  { key: '64EBY2EM', name: '6.3.3' },
];
const APPLY = process.argv.includes('--apply');

// 人工核实后显式锁定：自动匹配撞车/误配的条目（按作者姓氏+期刊核对库内真身）
const OVERRIDE = {
  'Advances in Anion Exchange Membrane Water Electrolysis': 'IEZLYDMJ',          // Li/ChemCatChem 2026
  'Advancements in non-renewable and hybrid hydrogen production': 'TDK8TSPM',    // Avargani/Fuel 2025
  'Assessment of green hydrogen production in Morocco': '7UDNZ2DM',              // Ourya/IJHE 2023（原误配到 Australia 那篇 9E29UUD7）
  'Catalysts for Direct Seawater Electrolysis': 'HS8IQC44',                      // Kasani/ChemElectroChem 2024
  'Electrocatalytic hydrogen generation from seawater': 'WTZBJE9F',              // Chetry/JMCA 2026
  'Greener hydrogen production and storage revolution': 'CUM3WR7R',              // Rasheed/Fuel 2026
  'Large scale of green hydrogen storage: Opportunities': '6JFPVH9U',            // Ma/IJHE 2024（原误配到 strategic roadmap BYJTTCAN）
  'Mass transport in PEM water electrolysers: A review': '5CGSGSGV',             // Maier/IJHE 2022
  'Multiphysics and Multiscale Modeling of PEM': '43I5MC5E',                     // Yu/Energies 2026
  'Recent advances in hydrogen compressors': '4TTK8AEY',                         // Tahan/IJHE 2022
  'Water Electrolysis toward Elevated Temperature': 'F748D3YC',                  // Zhang/Chem Rev 2023
  'Review of recent advances in alkaline electrolyzer': 'B6BYBYQN',              // Sharshir/IJHE 2024（原误配到 Sebbahi 的 8Z5I6L8L）
  'Materials Design and System Innovation for Seawater Electrolysis': '9AF3NEMM', // He/ACS Nano 2023（防与 Kasani 条撞车）
};

const LIST = [
  'A comprehensive review on the interfacial design for PEMWE（Wan / RSER 2026）',
  'A review of pinch analysis techniques（Yuan / RSER 2024）',
  'A Review of Projected Power-to-Gas Deployment Scenarios（Eveloy / Energies 2018）',
  'Advanced Development of Diverse Photovoltaic-Driven Water Electrolysis（Yu / Nanomaterials 2026）',
  'Advances in Alkaline Water Electrolysis—In Situ Ionic Activation（Nikolic / Catalysts 2026）',
  'Advances in Anion Exchange Membrane Water Electrolysis（Li / ChemCatChem 2026）',
  'Advances in offshore wind-power coupled seawater electrolysis（Guo / Green Chem 2026）',
  'An ultra-low Pt metal nitride electrocatalyst for seawater（Hu / EES 2023）',
  'Advancements in non-renewable and hybrid hydrogen production（Avargani / Fuel 2025）',
  'Advancements, strategies, and prospects of SOECs（Lahrichi / J Energy Chem 2024）',
  'Alkaline Water Electrolysis Catalysts: Mechanisms, Design Strategies（Wu / ChemNanoMat 2026）',
  'Applications of low-temperature non-equilibrium plasmas in catalysts（Li / Acta Phys Sin 2025）',
  'Assessment of green hydrogen production in Morocco（Ourya / IJHE 2023）',
  'Atomic Insights into Catalyst-Substrate Interfaces（Parvin / ACS Catal 2025）',
  'Blockchain-based parking sharing service for smart city（Ibrahim / Comput Electr Eng 2022）',
  'Cascade electrocatalysis via Ru clusters and Y single atoms（Zhang / EES 2025）',
  'Catalysts for Direct Seawater Electrolysis（Kasani / ChemElectroChem 2024）',
  'Challenges and solutions in suppressing chlorine evolution（Raza / JPS 2025）',
  'Cobalt-based Co3Mo3N/Co4N/Co Metallic Heterostructure（Liu / Angew 2024）',
  'Corrosion mechanism and stabilization for RuO2/IrO2（Hess / Curr Opin Electrochem 2023）',
  'Deciphering Cationic and Anionic Overoxidation（Zheng / AEM 2024）',
  'Defect-balanced Co3O4-x for PEM electrolysis（Rong / EES 2024）',
  'Design of anti-corrosion and anti-poisoning in high salinity（Liu / Nano Res 2025）',
  'Design strategies… nickel-based bifunctional electrocatalysts（Zhao / Chin Chem Lett 2026）',
  'Design, manufacturing, and testing of a prototype green H2 plant（Mas / ECM 2025）',
  'Development of Efficient Catalyst Layers for PEMWE（Park / Adv Energy Mater 2025）',
  'Development of a Digital Twin Model for H2 Plant（Palacios / IEEE Access 2026）',
  'Development of a Hydrogen Valley in Central Italy（Ficco / Energies 2022）',
  'Effect of nanomaterials on microbial metabolism… fermentative hydrogen（Li / Biotech Adv 2025）',
  'Enhancing green hydrogen via double flash geothermal cycle（Li / Case Stud Therm Eng 2024）',
  'Electrocatalytic hydrogen generation from seawater（Chetry / JMCA 2026）',
  'Electrodeposited Ni-Co Electrocatalysts for HER（Silveira / Electrocatalysis 2025）',
  'Emerging high-entropy alloy electrocatalysts for water splitting（Liu / Catal Sci Technol 2026）',
  'Engineered PW12-polyoxometalate docked Fe sites… seawater（He / Nat Commun 2025）',
  'Engineering Defects, Strain, and Janus Structures in TMDCs（Zhou / ACS AMI 2025）',
  'Engineering Metallic Heterostructure Ni3N and 2M-MoS2（Wu / Adv Mater 2022）',
  'Exergetic evaluation of nanofluid solar driven hydrogen（Ju / IJHE 2024）',
  'Green hydrogen for a sustainable future: production methods review（Anand / IJHE 2025）',
  'Greener hydrogen production and storage revolution（Rasheed / Fuel 2026）',
  'Heteroatom engineering in NiFe-based electrocatalysts（Qu / Prog Nat Sci 2026）',
  'High-performance porous transport layers for PEMWE（Tao / SusMat 2024）',
  'Key criteria for next-generation dimensionally stable electrodes（Hoisang / Curr Opin Electrochem 2022）',
  'Lamella-heterostructured nanoporous bimetallic Fe-Co（Zeng / Nat Commun 2023）',
  'Large scale of green hydrogen storage: Opportunities（Ma / IJHE 2024）',
  'Mass transport in PEM water electrolysers: A review（Maier / IJHE 2022）',
  'Materials Design and System Innovation for Seawater Electrolysis（He / ACS Nano 2023）',
  'Membranes for hydrogen rainbow toward decarbonization（Yuan / CEJ 2023）',
  'Multi-criteria thermoeconomic optimization… geothermal… alkaline（Zuo / PSEP 2024）',
  'Multiphysics and Multiscale Modeling of PEM（Yu / Energies 2026）',
  'N, O-doped carbon foam as metal-free electrocatalyst… seawater（Liu / Nano Res 2022）',
  'Non-Iridium-Based Electrocatalysts for Acidic OER（Jin / ACS AMI 2026）',
  'Operational simulation of wind power plants for electrolytic hydrogen（Valdés / Renewable Energy 2013）',
  'Pathways to Low-Iridium Loading in PEMWE（Pak / ACS AEM 2025）',
  'Performance enhancement of PEM through Ti-PTLs（Ismael / JPS 2026）',
  'POM-Intercalated NiFe-LDH as OER Catalyst（Zhang / ACS Catal 2025）',
  'Procedure for optimal design… stand-alone photovoltaic（Valdés / IJHE 2012）',
  'Rare-earth-based materials for PEMWE/AEMWE（Zhu / Coord Chem Rev 2026）',
  'Regulating Interfacial H2O Activity and H2 Bubbles… seawater（Yang / Adv Mater 2025）',
  'Recent advances in cerium oxide redox cycle solar thermochemical（Feng / Fuel 2026）',
  'Recent advances in hydrogen compressors（Tahan / IJHE 2022）',
  'Recent Advances in Thermochemical Water Splitting MIEC Membrane（Li / Membranes 2025）',
  'Renewable energy for hydrogen production and urban mobility（Briguglio / IJHE 2010）',
  'Resolving the iridium dilemma in PEM water electrolysis（Li / Chem Soc Rev 2026）',
  'Review of biohydrogen production technology（Ferraren / RSER 2021）',
  'Review of Nanocatalysts Comprising Single Atoms（Zhang / ACS ANM 2025）',
  'Review of Offshore Superconducting Wind Power for Hydrogen（Zhang / Energies 2025）',
  'Review of recent advances in alkaline electrolyzer（Sharshir / IJHE 2024）',
  'Stabilizing NiFe sites by… Cr species… seawater oxidation（Cai / Nat Commun 2024）',
  'Superaerophobic/Superhydrophilic Multidimensional Electrode（Jeong / ACS Nano 2024）',
  'Suppressing deactivation in alkaline seawater OER（Zhu / J Energy Chem 2025）',
  'System Evaluation and Economic Analysis of Nuclear Reactor HTE（Harvego / JERT 2010）',
  'Toward sustainable hydrogen production: MEA durability PEMWE（Liu / Coord Chem Rev 2026）',
  'Water Electrolysis toward Elevated Temperature（Zhang / Chem Rev 2023）',
];

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

  const byKey = new Map();
  for (const c of [{ key: PARENT_KEY, name: '6.制氢场' }, ...SUBS]) {
    const items = await getAll(`/api/users/0/collections/${c.key}/items/top?format=json`);
    for (const it of items) {
      if (!byKey.has(it.key)) byKey.set(it.key, { key: it.key, version: it.version, data: it.data, via: [] });
      byKey.get(it.key).via.push(c.name);
    }
    w(`集合 ${c.name}: ${items.length} 条`);
  }
  const items = [...byKey.values()];
  w(`范围内去重后条目: ${items.length} 条\n`);

  const hits = [], misses = [], ambiguous = [];
  for (const raw of LIST) {
    const e = parseEntry(raw);
    if (OVERRIDE[e.core]) {
      const it = items.find((x) => x.key === OVERRIDE[e.core]);
      if (!it) { misses.push(e); continue; }
      hits.push({ e, item: it, score: 999, how: 'lock', extra: [] });
      continue;
    }
    const cands = [];
    for (const it of items) {
      const nt = norm(it.data.title);
      let score = 0, how = '';
      for (const f of e.frags) if (nt.includes(f)) { score += f.length; how = 'sub'; }
      if (!score) {
        const sim = wordSim(e.core.replace(/…|\.\.\./g, ' '), it.data.title);
        if (sim >= 0.6) { score = Math.round(sim * 100); how = 'sim'; }
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

  w('== 匹配明细 ==');
  for (const h of hits) {
    const d = h.item.data;
    w(`[${h.how}:${String(h.score).padStart(3)}] ${h.item.key} (${h.item.via.join('/')}) ${(d.publicationTitle || '').slice(0, 28)} ${d.date || ''}`);
    w(`     名单: ${h.e.core.slice(0, 72)}   <${h.e.author}>`);
    w(`     库内: ${(d.title || '').slice(0, 72)}`);
    if (h.extra.length) w(`     !! 同分候选: ${h.extra.map((x) => x.it.key + ' | ' + x.it.data.title.slice(0, 50) + ' | ' + (x.it.data.publicationTitle || '')).join('  ///  ')}`);
  }
  w(`\n名单 ${LIST.length} 条 -> 匹配 ${hits.length} / 未匹配 ${misses.length} / 同分待定 ${ambiguous.length}`);
  if (misses.length) {
    w('\n== 未匹配 ==');
    for (const m of misses) w(`  - ${m.core}   <${m.author} / ${m.journal}>`);
  }
  if (ambiguous.length) {
    w('\n== 同分候选(需人工确认) ==');
    for (const a of ambiguous) {
      w(`  * ${a.e.core.slice(0, 70)}  <${a.e.author} / ${a.e.journal}>`);
      for (const t of a.tied) w(`      ${t.it.key} | ${t.it.data.title.slice(0, 70)} | ${t.it.data.publicationTitle || ''} | ${(t.it.data.creators || []).slice(0, 2).map((c) => c.lastName).join('/')}`);
    }
  }

  // 冲突检测：同一个 key 被多条名单项占用 => 说明有匹配错误
  const usedBy = new Map();
  const conflicts = [];
  for (const h of hits) {
    if (usedBy.has(h.item.key)) conflicts.push({ key: h.item.key, a: usedBy.get(h.item.key), b: h.e.core });
    else usedBy.set(h.item.key, h.e.core);
  }
  if (conflicts.length) {
    w('\n== 冲突：同一条目被多条名单占用 ==');
    for (const c of conflicts) w(`  ${c.key}: 「${c.a.slice(0, 55)}」 与 「${c.b.slice(0, 55)}」`);
  }

  const keys = [...new Set(hits.map((h) => h.item.key))];
  w(`\n待删除 key (${keys.length}): ${keys.join(',')}`);
  w(`删除后剩余: ${items.length - keys.length} 条`);

  if (APPLY) {
    if (ambiguous.length || misses.length || conflicts.length) { w('\n[中止] 存在未匹配/同分候选/冲突，未删除。'); fs.writeFileSync(__dirname + '/delete6_report.txt', out.join('\n'), 'utf8'); return; }
    w('\n== 执行删除（移入回收站）==');
    const sid = await serverId();
    const key = getKey(sid);
    for (let i = 0; i < keys.length; i += 50) {
      const batch = keys.slice(i, i + 50);
      const probe = await req('GET', '/api/users/0/items?limit=1');
      const libVer = probe.headers['last-modified-version'];
      const r = await req('DELETE', '/api/users/0/items?itemKey=' + batch.join(','), null,
        { 'Zotero-Server-ID': sid, 'Zotero-API-Key': key, 'If-Unmodified-Since-Version': libVer });
      w(`  批次 ${Math.floor(i / 50) + 1}: ${batch.length} 条 (libVer=${libVer}) -> ${r.status} ${r.status === 204 || r.status === 200 ? 'OK' : r.body.slice(0, 250)}`);
    }
    const after = await getAll('/api/users/0/collections');
    w('\n== 删除后 ==');
    for (const c of [{ key: PARENT_KEY, name: '6.制氢场' }, ...SUBS]) {
      const cc = after.find((x) => x.key === c.key);
      w(`  ${c.name}: ${cc && cc.meta ? cc.meta.numItems : '?'} 条`);
    }
  } else {
    w('\n[dry-run] 未删除。确认后加 --apply。');
  }
  fs.writeFileSync(__dirname + '/delete6_report.txt', out.join('\n'), 'utf8');
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
