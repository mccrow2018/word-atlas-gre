"""Import the two supplied GRE PDFs without mixing books, rows or day boundaries.

Usage: python scripts/gre/import_pdfs.py --pdf-dir tmp/pdfs
Requires pdfplumber. Sources must be named ro6t.pdf and nm7j.pdf.
Large diagonal watermarks are excluded from extraction; table borders define cells.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
URL = "https://aosspic10001.websiteonline.cn/pmoa7e5b3/doc/"


def clean(s):
    text = re.sub(r"(?<=[A-Za-z])-\s*\n\s*(?=[A-Za-z])", "-", s or "")
    text = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", text)
    return re.sub(r"\s+", " ", text).strip()


def tables(pdf_dir, name):
    cache = pdf_dir / f"{name}-tables.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    import pdfplumber
    result = []
    with pdfplumber.open(pdf_dir / f"{name}.pdf") as pdf:
        for n, page in enumerate(pdf.pages[4:], 5):
            filtered = page.filter(lambda obj: obj["object_type"] != "char" or obj["size"] < 25)
            result.append({"page": n, "tables": filtered.extract_tables()})
    cache.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def synonyms(s):
    return [part.strip(" ,;，；") for part in re.split(r"[,，;；]", clean(s)) if part.strip(" ,;，；")]


def base_entry(book, day, page, row, word):
    return dict(id=f"{book}-p{page}-r{row}", w=word, uk="", us="", senses=[], ex=[], col=[], fam=[],
                syn=[], ant=[], tip="", cefr="GRE", topic=f"day-{day}", m=0,
                source=dict(page=page, row=row, day=day))


def parse(pdf_dir, name, book, title):
    entries, groups, notes = [], {}, []
    day, last = 0, None
    for page in tables(pdf_dir, name):
        for table in page["tables"]:
            for row_no, row in enumerate(table, 1):
                head = clean(row[0])
                if name == "ro6t":
                    match = re.search(r"第([一二三四五])天任务", head)
                    if match:
                        day = "一二三四五".index(match[1]) + 1
                    if not row[0] or not row[1] or not row[2] or head == "单词":
                        continue
                    word = head.replace("\n", "")
                    if not re.fullmatch(r"[A-Za-z][A-Za-z’' -]*", word):
                        raise ValueError((page["page"], row))
                    e = base_entry(book, day, page["page"], row_no, word)
                    syn = clean(row[1])
                    # A comma in this cell is placed on the following PDF line.
                    if word == "nimble" and syn == "adroit dexterous, skillful":
                        syn = "adroit, dexterous, skillful"
                    e["syn"] = synonyms(syn)
                    e["senses"] = [dict(pos="", zh=clean(row[2]), en="")]
                    e["tip"] = "GRE 六选二等价词依赖题目语境，不一定是完全同义词。"
                else:
                    match = re.search(r"DAY\s+(\d+)", head)
                    if match:
                        day = int(match[1])
                        continue
                    if head == "词汇":
                        continue
                    if head == "例句":
                        if not last:
                            raise ValueError("Example without a headword")
                        sentence = clean(row[1])
                        if last["w"] == "reinvent" and sentence.startswith("Women who"):
                            notes.append(dict(page=page["page"], word="reinvent", issue="原 PDF 例句被表格截断，未导入残句"))
                            last["note"] = "原 PDF 此条例句排版截断，暂未收录。"
                        elif sentence:
                            last["ex"].append(dict(en=sentence, zh=""))
                        continue
                    word = (row[0] or "").replace("\n", "" if head != "keep abreast of" else " ").strip()
                    fixes = {"atapremium": "at a premium", "atoddswith": "at odds with"}
                    if word in fixes:
                        notes.append(dict(page=page["page"], word=word, issue=f"恢复短语空格：{fixes[word]}"))
                        word = fixes[word]
                    e = base_entry(book, day, page["page"], row_no, word)
                    ipa = clean(row[1])
                    if word == "reticent":
                        ipa = "[ˈretɪsnt]"
                    if ipa == "qq":
                        notes.append(dict(page=page["page"], word=word, issue="原 PDF 音标为 qq，留空并使用可用的同词音标或设备朗读"))
                        ipa = ""
                    e["uk"] = ipa
                    e["syn"] = synonyms(row[3])
                    meaning = clean(row[2])
                    for part in re.split(r"\(\d+\)", meaning):
                        if not part.strip():
                            continue
                        pos = re.match(r"\s*(adj\.|adv\.|n\.|v\.|phrase\.)\s*", part)
                        body = part[pos.end():] if pos else part
                        chinese = re.search(r"[\u3400-\u9fff]", body)
                        e["senses"].append(dict(pos=pos[1] if pos else "", zh=body[chinese.start():].strip() if chinese else body.strip(), en=body[:chinese.start()].strip() if chinese else ""))
                assert day, (page["page"], row)
                assert e["w"] and e["senses"] and all(s["zh"] for s in e["senses"]), e
                entries.append(e)
                last = e
                group = groups.setdefault(day, dict(day=day, label=f"第 {day} 天", ids=[], pages=[]))
                group["ids"].append(e["id"])
                if page["page"] not in group["pages"]:
                    group["pages"].append(page["page"])
    assert len(groups) == (5 if name == "ro6t" else 7)
    assert len({e["id"] for e in entries}) == len(entries)
    result = dict(id=book, name=title,
                  source=dict(title=title, url=URL + name + ".pdf", description="保留原书词条、释义、等价关系与每日分组；原书重复词条保留为独立学习项。"),
                  groups=list(groups.values()), entries=entries)
    report = dict(id=book, rows=len(entries), distinctHeadwords=len({e["w"].lower() for e in entries}),
                  examples=sum(len(e["ex"]) for e in entries), days={g["day"]: len(g["ids"]) for g in groups.values()}, notes=notes,
                  sha256=hashlib.sha256((pdf_dir / f"{name}.pdf").read_bytes()).hexdigest())
    return result, report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", type=Path, default=ROOT / "tmp/pdfs")
    args = ap.parse_args()
    out = ROOT / "public/gre"
    out.mkdir(exist_ok=True)
    reports = []
    for spec in [("ro6t", "gre-equivalent", "真经 GRE 等价词汇总"), ("nm7j", "gre-core", "GRE 镇考机经词 7.0（乱序版）")]:
        result, report = parse(args.pdf_dir, *spec)
        (out / f"{spec[1]}.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        reports.append(report)
    (ROOT / "data/gre-import-report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    from align_core import write_alignment
    write_alignment(ROOT)
    print(json.dumps(reports, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
