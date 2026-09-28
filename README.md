# zotero-local-bridge

一套 **不依赖 Zotero 官方 API Key、直接操作本机 Zotero 7 文献库** 的小工具集：既能只读检索/统计/查重/导出参考文献，也能通过 Zotero 本地 API 批量导入 RIS、重建集合树、批量移动和删除条目。

最初为解决「一篇综述要整理 700+ 篇文献、按章节重分类」的场景而写，实测可完成：全库体检 → 薄弱章节补文献 → 批量导入 → 按大纲重分类 → 去重校正。

> ⚠️ **写操作有风险**：Zotero 本地 API 的 `DELETE` 是**永久删除，不进回收站**。任何批量写库前请先导出全库备份。

---

## 一、两条通道

| 通道 | 实现 | 需要 Zotero 运行 | 能力 | 安全性 |
|---|---|---|---|---|
| **只读 sqlite** | `zotero_lib.py` + `zot.py` | 否（自动复制库文件，避开写锁） | 检索、统计、查重、导出 Bib/RIS/CSV/MD、生成 GB/T 7714 与 APA 参考文献 | 只读，不会改库 |
| **本地 API 写** | `scripts/*.js` | 是（需开启「允许其他应用通信」） | 建集合、导入 RIS、挂集合、移动条目、合并集合、删除条目 | **可写，需谨慎** |

---

## 二、环境要求

- Zotero 7（默认数据目录 `~/Zotero/zotero.sqlite`；Windows 常见路径 `C:\Users\<你>\Zotero\zotero.sqlite`）
- Python 3.9+（仅用标准库：`sqlite3` / `argparse` / `csv`，无需 pip 安装）
- Node.js 16+（仅用内置 `http` 模块，无需 `npm install`）
- 写操作需在 Zotero 中开启：**设置 → 高级 → 允许其他应用通过 API 访问**（即 Local API，端口 `127.0.0.1:23119`）

---

## 三、快速开始

### 1）只读：统计与检索

```bash
python zot.py stats                                   # 全库统计：条目数、年份分布、集合分布
python zot.py search "electrolyzer dynamic"           # 全字段检索
python zot.py search "HTO" --collection "4.3" --limit 20
python zot.py list --collection "3.3-2" --year 2024   # 按集合/年份列条目
python zot.py show 123                                # 查看单条详情
python zot.py dup                                     # 查重（同 DOI / 同标题）
```

### 2）只读：导出与参考文献

```bash
python zot.py export --format bib --collection "5.多槽制氢" --out refs.bib
python zot.py export --format ris --search "digital twin" --out dt.ris
python zot.py export --format csv --out all.csv
python zot.py export --format md  --collection "4.3" --out ch43.md
python zot.py refs --format gbt --collection "5.多槽制氢" --out refs_gbt.txt   # GB/T 7714
python zot.py refs --format apa --search "MPC" --out refs_apa.txt              # APA
```

`refs` 会自动把 WOS 导入的全大写刊名转成 Title Case，并保留 IEEE / PEM / AEM / SOEC 等缩写词大写。

### 3）写：授权

```bash
cd scripts
node authorize.js          # Zotero 会弹窗，务必点「始终允许」（否则 key 一次性失效）
node api_check.js          # 验证写权限是否可用
```

### 4）写：批量导入 RIS

```bash
cd scripts
# 目录/文件从命令行传入；不给文件则自动扫描目录下所有 .ris
node parse_ris.js "D:/浏览器下载文件" "savedrecs (18)5.1.ris" "savedrecs (18)5.2.ris"
# 或 RIS_DIR="D:/浏览器下载文件" node parse_ris.js

node import_ris.js    # 建集合并导入（已存在的条目只挂集合，不重复创建）
node fix_existing.js  # 补挂库内已存在条目到新集合
```

`parse_ris6.js` / `import_ris6.js` / `parse_ris7.js` / `import_ris7.js` 是后续章节导入时按同样流程复制出来的版本，改里面的 `DIR` / `FILES` 与集合名即可复用（新版 `parse_ris.js` 已支持命令行传参，推荐直接用它）。

### 5）写：集合与条目维护

```bash
node list_collections.js     # 列出集合树（注意看 parentCollection）
node overlap.js              # 集合间交集分析
node merge_collections.js    # 合并集合
node nest_5.js               # 把子集合挂到父集合下
node stats_now.js            # 当前库统计（含回收站）
```

---

## 四、本地 API 写操作的硬性规则（踩过坑，务必照做）

1. **请求头三要素**
   - `Zotero-Server-ID`：任意 GET 响应头里取，**每次 Zotero 启动都会变**，不能硬编码。
   - `Zotero-API-Key`：`POST /api/local/authorize` 获得，弹窗要选「始终允许」。
   - JSON body 里的 `appName`。
   单次授权的 key 用完即失效（401），`api.js` 已实现自动重新申请并重放。

2. **批量接口的限制**
   - `POST /items`、`POST /collections` 支持批量。
   - `PATCH /items`、`PATCH /collections` **不支持批量**（返回 400 Endpoint does not support method），必须逐条 PATCH，且要带 `If-Unmodified-Since-Version`。

3. **创建集合必须传数组**
   ```js
   // ✅ 正确
   POST /api/users/0/collections  body: [{"name": "5.1", "parentCollection": "<父key>"}]
   // ❌ 传单个对象会报 "must be a JSON array"
   ```
   取新建集合的 key：响应里的 `successful["0"].key`。

4. **`DELETE` 是永久删除，不进回收站**
   - `DELETE /items?itemKey=K1,K2` 需带 `If-Unmodified-Since-Version`（取库的 last-modified-version），返回 204。
   - 删完 key 立刻 404，回收站里也找不到 —— 无法撤销。
   - **批量删除前务必先导出全库 RIS 备份。**

5. **删集合会级联**：`DELETE /collections/<key>` 删父集合会连带删子集合（子集合随后再删返回 404 属正常）。

6. **校验库状态要连 `-wal` / `-shm` 一起复制** sqlite 文件，否则读到陈旧快照会误判（`zotero_lib.open_db` 已处理）。

7. **统计章节条目必须先建立集合树**：`4.1/4.2/4.3` 名下直接条目可能是 0，但各自挂着子集合。

---

## 五、目录结构

```
zotero-local-bridge/
├── zotero_lib.py          # 只读访问层：复制 sqlite（含 -wal/-shm）后查询
├── zot.py                 # 只读 CLI：stats / search / list / show / dup / export / refs
├── overview.py            # 库整体概览
├── trash_count.py         # 回收站统计
└── scripts/
    ├── api.js             # 本地 API 客户端（自动续期授权 + 401 重放）
    ├── authorize.js       # 申请写授权
    ├── api_check.js       # 写权限自检
    ├── check_keys.js      # 检查已存 key
    ├── probe*.js          # 调试探针（探测响应头/授权流程）
    ├── list_collections.js / merge_collections.js / overlap.js / nest_5.js
    ├── parse_ris*.js / import_ris*.js / fix_existing.js   # RIS 解析与导入
    ├── delete_5.js / delete_6.js                          # 按名单删除（支持 dry-run）
    ├── lookup.js / lookup6.js                             # 按标题/DOI 查条目
    └── stats_now.js / stats_extra.js                      # 统计
```

---

## 六、典型工作流（综述文献整理）

1. `python zot.py stats` → 摸清家底（多少篇、哪些集合、年份分布）
2. `python zot.py dup` → 先去重
3. 缺文献的小节：外部检索补题录 → `parse_ris.js` + `import_ris.js` 导入并按章节建集合
4. `node list_collections.js` → 对照大纲检查集合树
5. 分类错位：**必须人工二次核对**（关键词自动分类会系统性错位，例如材料类文献被塞进"基础"章）
6. `python zot.py export --format bib --collection <章>` → 导出写作用的题录
7. 成稿时 `python zot.py refs --format gbt --collection <章> --out refs.txt`

---

## 七、常见问题

**Q：只读通道需要关掉 Zotero 吗？**
不需要。`zotero_lib.open_db` 会把 `zotero.sqlite`（连同 `-wal`、`-shm`）复制到临时目录再查，避开写锁。

**Q：本地 API 返回 403 "Local API is not enabled"？**
设置 → 高级 → 勾选允许其他应用通过 API 访问，重启 Zotero。

**Q：写请求一直 401？**
授权弹窗点了「允许」而不是「始终允许」，key 一次性失效。重跑 `node authorize.js` 并选「始终允许」。

**Q：导入时条目静默消失？**
`POST /items` 时若 `collections: [null]`（集合名对不上 → key 为 null），Zotero 会返回 200 但条目不入库。检查响应里的 `failed` 字段，确保集合名与库内完全一致。

---

## 八、许可

MIT
