"""Align the core learning order to the immutable equivalent course (stdlib only).

Keeps core entries, source groups and stable IDs intact. Writes a separate learning
order. Shared headwords are reserved for their exact equivalent day before any
filler is assigned, so a synonym on day one never steals a day-five headword.
"""
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
KINDS = ["same-word", "equivalent", "shared-equivalent", "same-meaning", "supplement"]


def normalize(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def meanings(entry):
    parts = set()
    for sense in entry["senses"]:
        for part in re.split(r"[，,；;、/]|\d+[.．、]", sense["zh"]):
            part = re.sub(r"\s|[。.!！?？]", "", part)
            if len(part) >= 2 and re.fullmatch(r"[\u3400-\u9fff]+", part):
                parts.add(part)
    return parts


def best_relation(entry, anchors):
    word = normalize(entry["w"])
    syns = {normalize(s) for s in entry["syn"]}
    zh = meanings(entry)
    best = (4, len(anchors), "")
    for i, anchor in enumerate(anchors):
        aw = normalize(anchor["w"])
        asyn = {normalize(s) for s in anchor["syn"]}
        if word == aw:
            candidate = (0, i, word)
        elif word in asyn or aw in syns:
            candidate = (1, i, f"{anchor['w']} / {entry['w']}")
        elif syns & asyn:
            candidate = (2, i, sorted(syns & asyn)[0])
        elif zh & meanings(anchor):
            candidate = (3, i, sorted(zh & meanings(anchor))[0])
        else:
            continue
        best = min(best, candidate)
    rank, i, evidence = best
    return dict(kind=KINDS[rank], anchorIndex=i,
                equivalentId=anchors[i]["id"] if i < len(anchors) else None,
                equivalentWord=anchors[i]["w"] if i < len(anchors) else None,
                evidence=evidence)


def minimum_assignment(cost):
    """Rectangular Hungarian assignment, one distinct column per row, n <= m."""
    n, m = len(cost), len(cost[0])
    assert n <= m
    u, v, p, way = [0] * (n + 1), [0] * (m + 1), [0] * (m + 1), [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv, used = [float("inf")] * (m + 1), [False] * (m + 1)
        while True:
            used[j0] = True
            i0, delta, j1 = p[j0], float("inf"), 0
            for j in range(1, m + 1):
                if used[j]:
                    continue
                cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                if cur < minv[j]:
                    minv[j], way[j] = cur, j0
                if minv[j] < delta:
                    delta, j1 = minv[j], j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while j0:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
    assignment = [-1] * n
    for j in range(1, m + 1):
        if p[j]:
            assignment[p[j] - 1] = j - 1
    assert all(j >= 0 for j in assignment)
    return assignment


def align_books(equivalent, core):
    ae = {e["id"]: e for e in equivalent["entries"]}
    ce = {normalize(e["w"]): e for e in core["entries"]}
    original_order = {e["id"]: i for i, e in enumerate(core["entries"])}
    anchors = [[ae[i] for i in g["ids"]] for g in equivalent["groups"]]
    days, assigned, matches = [], set(), {}
    for d, entries in enumerate(anchors, 1):
        ids = [ce[normalize(e["w"])]["id"] for e in entries if normalize(e["w"]) in ce]
        assigned.update(ids)
        days.append(dict(day=d, label=f"第 {d} 学习日", ids=ids))
    remaining = [e for e in core["entries"] if e["id"] not in assigned]
    relations = [[best_relation(e, group) for e in remaining] for group in anchors]
    # At most 169 filler slots: each documented equivalence outranks every lower
    # priority relation combined. Deterministic source-order tie breaking.
    weights = {"equivalent": 10**12, "shared-equivalent": 10**9, "same-meaning": 10**6, "supplement": 0}
    slots = [d for d, day in enumerate(days) for _ in range(200 - len(day["ids"]))]
    cost_by_day = [[-weights[r["kind"]] + i for i, r in enumerate(group)] for group in relations]
    assignment = minimum_assignment([cost_by_day[d] for d in slots])
    for d, j in zip(slots, assignment):
        entry = remaining[j]
        days[d]["ids"].append(entry["id"])
        assigned.add(entry["id"])
    by_id = {e["id"]: e for e in core["entries"]}
    for d, day in enumerate(days):
        for eid in day["ids"]:
            matches[eid] = best_relation(by_id[eid], anchors[d])
        day["ids"].sort(key=lambda eid: (matches[eid]["anchorIndex"], KINDS.index(matches[eid]["kind"]), original_order[eid]))
        day["exact"] = sum(matches[i]["kind"] == "same-word" for i in day["ids"])
        day["related"] = sum(matches[i]["kind"] in KINDS[1:4] for i in day["ids"])
        day["supplement"] = sum(matches[i]["kind"] == "supplement" for i in day["ids"])
    rest = [e["id"] for e in core["entries"] if e["id"] not in assigned]
    for start in range(0, len(rest), 200):
        d = len(days) + 1
        ids = rest[start:start + 200]
        days.append(dict(day=d, label=f"第 {d} 学习日", ids=ids, exact=0, related=0, supplement=len(ids)))
    order = [i for day in days for i in day["ids"]]
    assert len(order) == len(set(order)) == len(core["entries"])
    assert set(order) == set(by_id)
    assert [len(d["ids"]) for d in days] == [200] * 7 + [50]
    return dict(version=1, dailyTarget=200, order=order, days=days, matches=matches)


def write_alignment(root=ROOT):
    directory = root / "public/gre"
    equivalent_path = directory / "gre-equivalent.json"
    core_path = directory / "gre-core.json"
    equivalent = json.loads(equivalent_path.read_text(encoding="utf-8"))
    core = json.loads(core_path.read_text(encoding="utf-8"))
    core["learning"] = align_books(equivalent, core)
    equivalent_hash = hashlib.sha256(equivalent_path.read_bytes()).hexdigest()
    core["learning"]["equivalentSha256"] = equivalent_hash
    report = dict(equivalentSha256=equivalent_hash,
                  coreEntriesSha256=hashlib.sha256(json.dumps(core["entries"], ensure_ascii=False, separators=(",", ":")).encode()).hexdigest(),
                  days=[{k: v for k, v in d.items() if k != "ids"} | {"count": len(d["ids"])} for d in core["learning"]["days"]],
                  sameDayHeadwordMatches=sum(d["exact"] for d in core["learning"]["days"]),
                  rule="先锁定同一天的相同主词条，再对空位进行全局分配：原书等价关系 > 共同等价词 > 相同中文释义 > 原序补充；每日组内跟随等价词词序，后续剩余词保持原机经顺序。")
    core_path.write_text(json.dumps(core, ensure_ascii=False, indent=1), encoding="utf-8")
    (root / "data/gre-alignment-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(write_alignment(), ensure_ascii=False, indent=2))
