# -*- coding: utf-8 -*-
"""Zotero 本地库只读访问层（不依赖 Zotero 本地 API）。
原理：把 zotero.sqlite 复制一份到临时文件再查询，避免与运行中的 Zotero 争锁。
"""
import os
import shutil
import sqlite3
import tempfile

DEFAULT_DB = os.path.join(os.path.expanduser("~"), "Zotero", "zotero.sqlite")


def open_db(db_path=DEFAULT_DB):
    tmpdir = tempfile.mkdtemp(prefix="zotero_ro_")
    dst = os.path.join(tmpdir, "zotero.sqlite")
    shutil.copy2(db_path, dst)
    for ext in ("-wal", "-shm"):
        src = db_path + ext
        if os.path.exists(src):
            try:
                shutil.copy2(src, dst + ext)
            except Exception:
                pass
    conn = sqlite3.connect(dst)
    conn.row_factory = sqlite3.Row
    return conn


FIELDS = ["title", "publicationTitle", "date", "DOI", "abstractNote", "itemType",
          "publisher", "journalAbbreviation", "volume", "pages", "ISBN", "url",
          "bookTitle", "university", "thesisType", "conferenceName", "extra",
          "accessDate", "language", "place", "edition", "series", "reportNumber"]

TYPES = ["journalArticle", "book", "bookSection", "conferencePaper", "thesis",
         "preprint", "report", "webpage", "document", "standard", "patent",
         "journalArticle", "magazineArticle", "newspaperArticle", "blogPost"]


def _field_maps(conn):
    fmap, rmap, tmap = {}, {}, {}
    for r in conn.execute("SELECT fieldID, fieldName FROM fields"):
        fmap[r["fieldName"]] = r["fieldID"]
        rmap[r["fieldID"]] = r["fieldName"]
    for r in conn.execute("SELECT itemTypeID, typeName FROM itemTypes"):
        tmap[r["itemTypeID"]] = r["typeName"]
    return fmap, rmap, tmap


def get_items(conn, mode="all"):
    """mode: all=全部条目; top=仅顶层条目(非附件/非笔记)"""
    fmap, rmap, tmap = _field_maps(conn)
    q = """
    SELECT i.itemID, i.key, i.itemTypeID, i.dateAdded, i.dateModified, i.version
    FROM items i
    WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
    """
    if mode == "top":
        q += """ AND i.itemID NOT IN (SELECT itemID FROM itemAttachments)
                 AND i.itemID NOT IN (SELECT itemID FROM itemNotes) """
    q += " ORDER BY i.dateAdded DESC"

    # attachment path / parent
    att = {}
    for r in conn.execute("SELECT itemID, parentItemID, path, contentType FROM itemAttachments"):
        att[r["itemID"]] = dict(parent=r["parentItemID"], path=r["path"], contentType=r["contentType"])

    # collections
    colmap = {}
    for r in conn.execute("""SELECT ci.itemID, c.collectionID, c.collectionName
                             FROM collectionItems ci JOIN collections c ON c.collectionID=ci.collectionID"""):
        colmap.setdefault(r["itemID"], []).append(r["collectionName"])

    # tags
    tagmap = {}
    for r in conn.execute("""SELECT it.itemID, t.name FROM itemTags it JOIN tags t ON t.tagID=it.tagID"""):
        tagmap.setdefault(r["itemID"], []).append(r["name"])

    # creators
    crew = {}
    for r in conn.execute("""SELECT ic.itemID, ic.orderIndex, ct.creatorType,
                                    c.firstName, c.lastName, c.fieldMode
                             FROM itemCreators ic
                             JOIN creators c ON c.creatorID=ic.creatorID
                             JOIN creatorTypes ct ON ct.creatorTypeID=ic.creatorTypeID
                             ORDER BY ic.itemID, ic.orderIndex"""):
        # fieldMode: 0=双字段(姓/名), 1=单字段(机构名存在 lastName)
        if r["fieldMode"] == 1:
            nm = (r["lastName"] or "").strip()
        else:
            nm = ("%s %s" % (r["lastName"] or "", r["firstName"] or "")).strip()
        crew.setdefault(r["itemID"], []).append({"type": r["creatorType"], "name": nm})

    # data values
    want = set(fmap[f] for f in FIELDS if f in fmap)
    vals = {}
    qmarks = ",".join("?" * len(want))
    for r in conn.execute(
        """SELECT id.itemID, id.fieldID, idv.value
           FROM itemData id JOIN itemDataValues idv ON idv.valueID=id.valueID
           WHERE id.fieldID IN (%s)""" % qmarks, list(want)):
        vals.setdefault(r["itemID"], {})[rmap[r["fieldID"]]] = r["value"]

    out = []
    for r in conn.execute(q):
        iid = r["itemID"]
        d = vals.get(iid, {})
        item = {
            "itemID": iid,
            "key": r["key"],
            "itemType": tmap.get(r["itemTypeID"], "?"),
            "title": d.get("title", ""),
            "creators": crew.get(iid, []),
            "date": d.get("date", ""),
            "publicationTitle": d.get("publicationTitle", "") or d.get("bookTitle", "") or d.get("conferenceName", ""),
            "DOI": d.get("DOI", ""),
            "abstract": d.get("abstractNote", ""),
            "url": d.get("url", ""),
            "extra": d.get("extra", ""),
            "publisher": d.get("publisher", "") or d.get("university", ""),
            "volume": d.get("volume", ""),
            "pages": d.get("pages", ""),
            "collections": colmap.get(iid, []),
            "tags": tagmap.get(iid, []),
            "dateAdded": r["dateAdded"],
            "dateModified": r["dateModified"],
        }
        a = att.get(iid)
        if a:
            item["attachment"] = a
        out.append(item)

    # attach children (attachments/notes) to parents
    child = {}
    for iid, a in att.items():
        if a["parent"]:
            child.setdefault(a["parent"], []).append({"path": a["path"], "contentType": a["contentType"]})
    for it in out:
        it["attachments"] = child.get(it["itemID"], [])
    return out


def get_collections(conn):
    rows = []
    for r in conn.execute("""SELECT c.collectionID, c.collectionName, c.key,
                             (SELECT COUNT(*) FROM collectionItems ci WHERE ci.collectionID=c.collectionID) AS n
                             FROM collections c ORDER BY c.collectionName"""):
        rows.append({"id": r["collectionID"], "name": r["collectionName"], "key": r["key"], "count": r["n"]})
    return rows


def search(items, keyword, fields=("title", "abstract", "publicationTitle", "creators", "tags", "collections")):
    kw = keyword.lower()
    res = []
    for it in items:
        hay = []
        if "title" in fields:
            hay.append(it.get("title", ""))
        if "abstract" in fields:
            hay.append(it.get("abstract", ""))
        if "publicationTitle" in fields:
            hay.append(it.get("publicationTitle", ""))
        if "creators" in fields:
            hay.append(" ".join(c["name"] for c in it.get("creators", [])))
        if "tags" in fields:
            hay.append(" ".join(it.get("tags", [])))
        if "collections" in fields:
            hay.append(" ".join(it.get("collections", [])))
        if kw in " ".join(hay).lower():
            res.append(it)
    return res
