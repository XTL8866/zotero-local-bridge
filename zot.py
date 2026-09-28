# -*- coding: utf-8 -*-
"""Zotero 本地库命令行工具 (Zotero 7, 只读)
用法:
  python zot.py stats
  python zot.py search "electrolyzer dynamic" [--collection X] [--limit 20]
  python zot.py list --collection "3.3-2" [--year 2024] [--limit 50]
  python zot.py show 123
  python zot.py dup
  python zot.py export --format bib|ris|csv|md [--collection X] [--search kw] --out out.bib
  python zot.py refs --format gbt|apa [--collection X] [--search kw] --out refs.txt
"""
import argparse
import collections
import csv
import io
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from zotero_lib import open_db, get_items, get_collections, search  # noqa: E402


def year_of(s):
    s = (s or "").strip()
    for tok in s.replace("/", "-").split("-"):
        tok = tok.strip()
        if len(tok) == 4 and tok.isdigit():
            y = int(tok)
            if 1900 <= y <= 2100:
                return y
    return None


def authors_of(it, style="gbt"):
    cr = it.get("creators", [])
    if style == "gbt":
        names = []
        for c in cr:
            parts = c["name"].split()
            if len(parts) >= 2:
                last, first = parts[0], " ".join(parts[1:])
                initials = "".join(p[0].upper() for p in first.split() if p)
                names.append("%s %s" % (last.upper(), initials))
            else:
                names.append(c["name"].upper())
        return names
    return [c["name"] for c in cr]


SMALL = {"a", "an", "the", "of", "in", "on", "and", "or", "for", "to", "with", "by", "at", "from"}
ABBREV = {"IEEE", "ACS", "RSC", "AIP", "AIChE", "ASME", "PEM", "AEM", "SOEC", "PEMWE", "PLC",
          "DCS", "PID", "USA", "UK", "EU", "AI", "ML", "PV", "CCS", "LCA", "II", "III", "IV", "VI"}


def titlecase(s):
    """把 WOS 全大写刊名转成 Title Case，缩写词(IEEE/PEM等)保持大写。"""
    out = []
    for w in (s or "").split():
        core = "".join(ch for ch in w if ch.isalpha())
        if w.isupper() and (w in ABBREV or (len(core) <= 2 and w.lower() not in SMALL)):
            out.append(w)  # 缩写
            continue
        core = "".join(ch for ch in w if ch.isalpha())
        if not core:
            out.append(w)
            continue
        parts = []
        for seg in w.split("-"):
            parts.append(seg[:1].upper() + seg[1:].lower() if seg else seg)
        out.append("-".join(parts))
    res = " ".join(out)
    # 虚词小写（非首词）
    words = res.split()
    words = [w if i == 0 or w.lower() not in SMALL else w.lower() for i, w in enumerate(words)]
    return " ".join(words)


def gbt7714(it, keep_case=False):
    au = authors_of(it, "gbt")
    if len(au) > 3:
        au = au[:3] + ["等" if any("\u4e00" <= ch <= "\u9fff" for n in au[:3] for ch in n) else "et al."]
    a = (", ".join(au) if au else "Anon").rstrip(".")
    y = year_of(it.get("date")) or "n.d."
    j = it.get("publicationTitle") or ""
    if not keep_case:
        j = titlecase(j)
    vol = it.get("volume") or ""
    pg = it.get("pages") or ""
    t = (it.get("title") or "").rstrip(".")
    mark = "[J]"
    s = "%s. %s%s. %s" % (a, t, mark, j)
    if y != "n.d.":
        s += ", %s" % y
    if vol:
        s += ", %s" % vol
    if pg:
        s += ": %s" % pg
    if it.get("DOI"):
        s += ". DOI:%s" % it["DOI"]
    return s.rstrip(".") + "."


def apa(it):
    au = authors_of(it, "apa")
    if len(au) > 20:
        au = au[:19] + ["... " + au[-1]]
    elif len(au) > 1:
        au = au[:-1] + ["& " + au[-1]]
    y = year_of(it.get("date")) or "n.d."
    j = it.get("publicationTitle") or ""
    vol = it.get("volume") or ""
    pg = it.get("pages") or ""
    s = "%s (%s). %s. *%s*" % (", ".join(au) if au else "Anon", y, (it.get("title") or "").rstrip("."), j)
    if vol:
        s += ", %s" % vol
    if pg:
        s += ", %s" % pg
    if it.get("DOI"):
        s += ". https://doi.org/%s" % it["DOI"]
    return s + "."


def to_bibtex(it):
    key = (it.get("creators") or [{}])[0].get("name", "anon").split()[-1].lower() if it.get("creators") else "anon"
    key = "".join(ch for ch in key if ch.isalnum())
    y = year_of(it.get("date")) or "nd"
    t = (it.get("title") or "").replace("{", "").replace("}", "")
    lines = ["@article{%s%s," % (key, y)]
    lines.append("  title     = {%s}," % t)
    if it.get("creators"):
        lines.append("  author    = {%s}," % " and ".join(c["name"] for c in it["creators"]))
    if it.get("publicationTitle"):
        lines.append("  journal   = {%s}," % it["publicationTitle"])
    if y != "nd":
        lines.append("  year      = {%s}," % y)
    for f, k in (("volume", "volume"), ("pages", "pages"), ("DOI", "doi"), ("url", "url"), ("abstract", "abstract")):
        if it.get(f):
            lines.append("  %-9s = {%s}," % (k, it[f].replace("\n", " ")))
    lines.append("}")
    return "\n".join(lines)


def to_ris(it):
    L = ["TY  - JOUR"]
    for c in it.get("creators", []):
        L.append("AU  - %s" % c["name"])
    if it.get("title"):
        L.append("TI  - %s" % it["title"])
    if it.get("publicationTitle"):
        L.append("JO  - %s" % it["publicationTitle"])
        L.append("T2  - %s" % it["publicationTitle"])
    y = year_of(it.get("date"))
    if y:
        L.append("PY  - %s" % y)
        L.append("Y1  - %s" % it["date"])
    for f, k in (("volume", "VL"), ("pages", "SP"), ("DOI", "DO"), ("abstract", "AB"), ("url", "UR")):
        if it.get(f):
            L.append("%s  - %s" % (k, it[f].replace("\n", " ")))
    for t in it.get("tags", []):
        L.append("KW  - %s" % t)
    for c in it.get("collections", []):
        L.append("KW  - %s" % c)
    L.append("ER  - ")
    return "\n".join(L)


def select(items, a):
    res = items
    if getattr(a, "collection", None):
        res = [i for i in res if a.collection in i.get("collections", [])]
    if getattr(a, "year", None):
        res = [i for i in res if year_of(i.get("date")) == a.year]
    if getattr(a, "q", None):
        res = search(res, a.q)
    return res


def main():
    p = argparse.ArgumentParser(description="Zotero 本地库只读工具")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("stats")
    sc = sub.add_parser("search"); sc.add_argument("q"); sc.add_argument("--collection"); sc.add_argument("--limit", type=int, default=20)
    lc = sub.add_parser("list"); lc.add_argument("--collection"); lc.add_argument("--year", type=int); lc.add_argument("--q"); lc.add_argument("--limit", type=int, default=30)
    sh = sub.add_parser("show"); sh.add_argument("id")
    sub.add_parser("dup")
    ex = sub.add_parser("export"); ex.add_argument("--format", default="md", choices=["bib", "ris", "csv", "md"]); ex.add_argument("--collection"); ex.add_argument("--year", type=int); ex.add_argument("--q"); ex.add_argument("--out", required=True)
    rf = sub.add_parser("refs"); rf.add_argument("--format", default="gbt", choices=["gbt", "apa"]); rf.add_argument("--collection"); rf.add_argument("--q"); rf.add_argument("--year", type=int); rf.add_argument("--out"); rf.add_argument("--keep-case", action="store_true", help="保留 Zotero 中的原始刊名大小写(默认转为 Title Case)")

    a = p.parse_args()
    conn = open_db()
    items = get_items(conn, mode="top")
    cols = get_collections(conn)

    if a.cmd == "stats":
        print("条目总数: %d (顶层)" % len(items))
        print("类型分布:")
        for t, n in collections.Counter(i["itemType"] for i in items).most_common():
            print("  %-18s %d" % (t, n))
        ys = [year_of(i.get("date")) for i in items]
        ys = [y for y in ys if y]
        print("年份范围: %s - %s" % (min(ys), max(ys)) if ys else "无年份")
        print("年份分布:", dict(sorted(collections.Counter(ys).items())))
        print("\n集合 (%d):" % len(cols))
        for c in cols:
            print("  %-40s %3d" % (c["name"][:40], c["count"]))
        print("\n高频期刊 Top 15:")
        for j, n in collections.Counter(i.get("publicationTitle", "") for i in items if i.get("publicationTitle")).most_common(15):
            print("  %-45s %d" % (j[:45], n))
        print("\n附件(PDF)统计:")
        conn2 = conn
        try:
            n_att = conn2.execute("SELECT COUNT(*) FROM itemAttachments").fetchone()[0]
            n_link = conn2.execute("SELECT COUNT(*) FROM itemAttachments WHERE linkMode IS NOT NULL").fetchone()[0]
            print("  itemAttachments 记录数: %d" % n_att)
        except Exception as e:
            print("  (读取附件表失败: %s)" % e)
        print("  有附件的顶层条目: %d" % sum(1 for i in items if i.get("attachments")))
        return

    if a.cmd == "search":
        res = search(items, a.q)
        if getattr(a, "collection", None):
            res = [i for i in res if a.collection in i.get("collections", [])]
        print("命中 %d 条，显示前 %d:\n" % (len(res), a.limit))
        for it in res[:a.limit]:
            au = ", ".join(c["name"] for c in it["creators"][:3]) or "-"
            print("[%d] %s" % (it["itemID"], it["title"][:90]))
            print("     %s | %s | %s | %s" % (au, it.get("date", "")[:10], it.get("publicationTitle", "")[:50], "/".join(it.get("collections", [])[:2])))
        return

    if a.cmd == "list":
        res = select(items, a)
        print("共 %d 条，显示前 %d:\n" % (len(res), a.limit))
        for it in res[:a.limit]:
            au = ", ".join(c["name"] for c in it["creators"][:2]) or "-"
            print("[%d] (%s) %s -- %s | %s" % (it["itemID"], year_of(it.get("date")), it["title"][:70], au, it.get("publicationTitle", "")[:40]))
        return

    if a.cmd == "show":
        it = next((x for x in items if str(x["itemID"]) == str(a.id) or x["key"] == a.id), None)
        if not it:
            print("未找到: %s" % a.id); return
        for k in ("itemID", "key", "itemType", "title", "date", "publicationTitle", "volume", "pages", "DOI", "url", "publisher", "collections", "tags", "dateAdded", "dateModified"):
            print("%-16s: %s" % (k, it.get(k)))
        print("%-16s: %s" % ("creators", "; ".join("%s(%s)" % (c["name"], c["type"]) for c in it.get("creators", []))))
        if it.get("attachments"):
            print("%-16s: %s" % ("attachments", it["attachments"]))
        if it.get("abstract"):
            print("\n摘要:\n%s" % it["abstract"][:3000])
        if it.get("extra"):
            print("\nExtra:\n%s" % it["extra"][:800])
        return

    if a.cmd == "dup":
        seen = collections.defaultdict(list)
        for it in items:
            t = "".join(ch for ch in (it.get("title") or "").lower() if ch.isalnum())
            if t:
                seen[t].append(it)
            if it.get("DOI"):
                seen["doi:" + it["DOI"].lower()].append(it)
        groups, printed = [], set()
        for v in seen.values():
            ids = frozenset(i["itemID"] for i in v)
            if len(ids) > 1 and ids not in printed:
                printed.add(ids)
                groups.append(sorted(v, key=lambda i: i["itemID"]))
        if not groups:
            print("未发现重复条目。")
            return
        print("发现 %d 组重复/疑似重复:\n" % len(groups))
        for n, v in enumerate(groups, 1):
            print("组 %d (%d 条): %s" % (n, len({i['itemID'] for i in v}), v[0]["title"][:70]))
            for i in v:
                print("   [%d] %s | %s | %s" % (i["itemID"], year_of(i.get("date")), i.get("publicationTitle", "")[:40], "/".join(i.get("collections", [])[:2])))
        print("\n提示: 可在 Zotero 中用「重复的条目」视图合并，保留 itemID 较小的那个。")
        return

    if a.cmd == "export":
        res = select(items, a)
        out = a.out
        if a.format == "bib":
            txt = "\n\n".join(to_bibtex(i) for i in res)
        elif a.format == "ris":
            txt = "\n".join(to_ris(i) for i in res)
        elif a.format == "csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["itemID", "title", "authors", "year", "journal", "volume", "pages", "DOI", "collections", "tags", "abstract"])
            for i in res:
                w.writerow([i["itemID"], i["title"], "; ".join(c["name"] for c in i["creators"]), year_of(i.get("date")),
                            i.get("publicationTitle", ""), i.get("volume", ""), i.get("pages", ""), i.get("DOI", ""),
                            "; ".join(i.get("collections", [])), "; ".join(i.get("tags", [])), (i.get("abstract") or "")[:2000]])
            txt = buf.getvalue()
        else:
            lines = []
            for i in res:
                lines.append("## %s" % i["title"])
                lines.append("- 作者: %s" % ", ".join(c["name"] for c in i["creators"]))
                lines.append("- 期刊: %s (%s) %s %s" % (i.get("publicationTitle", ""), year_of(i.get("date")), i.get("volume", ""), i.get("pages", "")))
                if i.get("DOI"):
                    lines.append("- DOI: %s" % i["DOI"])
                if i.get("collections"):
                    lines.append("- 集合: %s" % ", ".join(i["collections"]))
                if i.get("abstract"):
                    lines.append("- 摘要: %s" % i["abstract"][:1200])
                lines.append("")
            txt = "\n".join(lines)
        io.open(out, "w", encoding="utf-8").write(txt)
        print("已导出 %d 条 -> %s" % (len(res), out))
        return

    if a.cmd == "refs":
        res = select(items, a)
        res = sorted(res, key=lambda i: (year_of(i.get("date")) or 9999, i.get("title", "")))
        fn = (apa if a.format == "apa" else gbt7714)
        txt = "\n".join("[%d] %s" % (n, fn(i, keep_case=getattr(a, "keep_case", False)) if a.format == "gbt" else fn(i)) for n, i in enumerate(res, 1))
        if getattr(a, "out", None):
            io.open(a.out, "w", encoding="utf-8").write(txt)
            print("已生成 %d 条参考文献 -> %s" % (len(res), a.out))
        else:
            print(txt)
        return


if __name__ == "__main__":
    main()
