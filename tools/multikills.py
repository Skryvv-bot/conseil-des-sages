# Multikills, solokills et premier sang des games de la Fantasy, recalculés depuis le direct officiel (feed.lolesports.com).
# Le direct donne l'état de chaque joueur environ deux fois par seconde : on repère l'instant de chaque kill,
# puis on applique les règles de LoL (kill suivant en moins de 10 s, 30 s pour le pentakill).
import json, os, re, sys, time, datetime, urllib.request, concurrent.futures as cf
FS = "https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents"
LIVE = "https://feed.lolesports.com/livestats/v1"
OUT = "out/fx/multi.json"
def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "CDS-TV"}), timeout=30) as r:
                if r.status != 200: return None
                t = r.read().decode(); return json.loads(t) if t else None
        except Exception: time.sleep(1 + i)
    return None
def fsval(v):
    if v is None: return None
    for k in ("stringValue", "booleanValue", "doubleValue"):
        if k in v: return v[k]
    if "integerValue" in v: return int(v["integerValue"])
    if "mapValue" in v: return {k: fsval(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "arrayValue" in v: return [fsval(x) for x in v["arrayValue"].get("values", [])]
    return None
def games():
    out, tok = [], ""
    while True:
        j = get(f"{FS}/fantasyGames?pageSize=300" + (f"&pageToken={tok}" if tok else ""))
        if not j: break
        for d in j.get("documents", []): out.append({"id": d["name"].split("/")[-1], **{k: fsval(v) for k, v in d["fields"].items()}})
        tok = j.get("nextPageToken", "")
        if not tok: break
    return out
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
iso = lambda t: datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
pt = lambda s: datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
def analyse(g):
    gid = g.get("gameId"); w0 = get(f"{LIVE}/window/{gid}")
    if not w0 or not w0.get("frames"): return None
    t0 = pt(w0["frames"][0]["rfc460Timestamp"]); end = (g.get("at") or 0) / 1000 + 20
    meta = w0["gameMetadata"]; names = {}; team = {}
    known = {norm(n): n for n in (g.get("players") or {})}
    for side in ("blue", "red"):
        for p in meta[side + "TeamMetadata"]["participantMetadata"]:
            s = p["summonerName"]; raw = s.split(" ", 1)[1] if " " in s else s
            names[p["participantId"]] = known.get(norm(raw), raw); team[p["participantId"]] = side
    starts = [int(t0 // 10 * 10) + 10 * i for i in range(int((end - t0) // 10) + 2)]
    with cf.ThreadPoolExecutor(8) as ex: wins = list(ex.map(lambda s: get(f"{LIVE}/window/{gid}?startingTime={iso(s)}"), starts))
    frames = {}
    for w in wins:
        for f in (w or {}).get("frames", []):
            st = {}
            for side in ("blue", "red"):
                for p in f[side + "Team"]["participants"]: st[p["participantId"]] = (p["kills"], p["assists"])
            frames[f["rfc460Timestamp"]] = (pt(f["rfc460Timestamp"]), st)
    fl = sorted(frames.values())
    if len(fl) < 20: return None
    kills = []   # (temps, tueur, solo)
    for (ta, a), (tb, b) in zip(fl, fl[1:]):
        for pid, (k, _) in b.items():
            dk = k - a.get(pid, (k, 0))[0]
            if dk <= 0 or dk > 5: continue
            mates = [q for q in b if q != pid and team[q] == team[pid]]
            helped = any(b[q][1] > a.get(q, b[q])[1] for q in mates)
            for _ in range(dk): kills.append((tb, pid, not helped and dk == 1))
    kills.sort()
    res = {"players": {}, "fb": names[kills[0][1]] if kills else None, "kills": len(kills)}
    by = {}
    for t, pid, solo in kills:
        by.setdefault(pid, []).append(t)
        if solo: res["players"].setdefault(names[pid], {})["solo"] = res["players"].get(names[pid], {}).get("solo", 0) + 1
    for pid, ts in by.items():
        streak, best_list = [ts[0]], []
        def close(s):
            n = len(s)
            if n >= 3: best_list.append(min(n, 5))
        for t in ts[1:]:
            lim = 30 if len(streak) == 4 else 10
            if t - streak[-1] <= lim + .6 and len(streak) < 5: streak.append(t)
            else: close(streak); streak = [t]
        close(streak)
        for n in best_list:
            key = {3: "triple", 4: "quadra", 5: "penta"}[n]; d = res["players"].setdefault(names[pid], {}); d[key] = d.get(key, 0) + 1
    # contrôle : total des kills relevés contre le total officiel
    res["check"] = sum((g.get("players") or {}).get(n, {}).get("k", 0) for n in (g.get("players") or {}))
    return res
def main():
    os.makedirs("out/fx", exist_ok=True)
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    gs = [g for g in games() if g.get("src") == "lolesports" and g.get("gameId")]
    todo = [g for g in gs if g["id"] not in old or (old[g["id"]].get("kills") != old[g["id"]].get("check"))]
    print("games", len(gs), "à analyser", len(todo))
    for g in todo:
        r = analyse(g)
        if r: old[g["id"]] = r; print(g["id"], "-".join(g.get("teams") or []), "kills relevés", r["kills"], "/ officiel", r["check"], json.dumps(r["players"], ensure_ascii=False), "FB", r["fb"])
    json.dump(old, open(OUT, "w"), ensure_ascii=False, indent=0)
main()
