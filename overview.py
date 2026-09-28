# -*- coding: utf-8 -*-
import io, sys, collections
sys.path.insert(0, __file__.rsplit("\\", 1)[0])
from zotero_lib import open_db, get_items, get_collections

out = io.open(__file__.rsplit("\\", 1)[0] + "\\overview.txt", "w", encoding="utf-8")

def w(s=""):
    out.write(s + "\n")

conn = open_db()
items = get_items(conn, mode="top")
cols = get_collections(conn)

w("Zotero 库概览")
w("=" * 60)
w("顶层条目(含附件/笔记以外的条目): %d" % len(items))
w()
w("-- 按类型 --")
c = collections.Counter(i["itemType"] for i in items)
for t, n in c.most_common():
    w("  %-20s %d" % (t, n))
w()
w("-- 集合 --")
for col in cols:
    w("  %-45s %d 条" % (col["name"][:45], col["count"]))
w()
w("-- 最近添加的 15 条 --")
for it in items[:15]:
    au = ", ".join(x["name"] for x in it["creators"][:3])
    if len(it["creators"]) > 3:
        au += " 等"
    w("  [%s] %s" % (it["itemType"], (it["title"] or "(无标题)")[:70]))
    w("       作者: %s | %s | %s" % (au or "-", it["date"] or "-", it["publicationTitle"] or "-"))
    if it["tags"]:
        w("       标签: %s" % ", ".join(it["tags"][:6]))
    if it["collections"]:
        w("       集合: %s" % ", ".join(it["collections"][:3]))
w()
n_att = sum(1 for i in items if i["attachments"])
w("带 PDF/附件的条目: %d / %d" % (n_att, len(items)))
out.close()
print("done")
