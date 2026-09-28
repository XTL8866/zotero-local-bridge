# -*- coding: utf-8 -*-
import sqlite3, shutil, tempfile, os, io

SRC = os.path.join(os.path.expanduser("~"), "Zotero", "zotero.sqlite")
tmp = tempfile.mkdtemp(prefix="ztrash_")
dst = os.path.join(tmp, "zotero.sqlite")
shutil.copy2(SRC, dst)
for ext in ("-wal", "-shm"):
    p = SRC + ext
    if os.path.exists(p):
        try:
            shutil.copy2(p, dst + ext)
        except Exception:
            pass
conn = sqlite3.connect(dst)
conn.row_factory = sqlite3.Row

lines = []
def w(s=""):
    lines.append(str(s))

w("deletedItems 表记录数(回收站): %d" % conn.execute("SELECT COUNT(*) FROM deletedItems").fetchone()[0])
w("items 表总行数: %d" % conn.execute("SELECT COUNT(*) FROM items").fetchone()[0])

# deleted 表：Zotero 的 deleted 表记录的是待同步删除
try:
    w("deleted 表(待同步删除)行数: %d" % conn.execute("SELECT COUNT(*) FROM deleted").fetchone()[0])
except Exception as e:
    w("deleted 表: %s" % e)

# 回收站条目的删除时间分布
try:
    rows = conn.execute("SELECT strftime('%Y-%m-%d %H', dateDeleted) AS d, COUNT(*) n FROM deletedItems GROUP BY d ORDER BY d").fetchall()
    w("\n回收站条目按删除时间:")
    for r in rows:
        w("   %s : %d" % (r["d"], r["n"]))
except Exception as e:
    w("按时间统计失败: %s" % e)

# 抽样看几条回收站条目标题
try:
    rows = conn.execute("""
        SELECT i.itemID, idv.value AS title, di.dateDeleted
        FROM deletedItems di
        JOIN items i ON i.itemID = di.itemID
        LEFT JOIN itemData id ON id.itemID = i.itemID
        LEFT JOIN itemDataValues idv ON idv.valueID = id.valueID
        LEFT JOIN fields f ON f.fieldID = id.fieldID AND f.fieldName = 'title'
        WHERE f.fieldName IS NOT NULL
        ORDER BY di.dateDeleted DESC LIMIT 12
    """).fetchall()
    w("\n回收站最近条目(抽样):")
    for r in rows:
        w("   [%s] %s | %s" % (r["itemID"], (r["title"] or "")[:60], r["dateDeleted"]))
except Exception as e:
    w("抽样失败: %s" % e)

io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "trash_count.txt"), "w", encoding="utf-8").write("\n".join(lines))
print("\n".join(lines))
