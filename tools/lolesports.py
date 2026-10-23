# Photos et logos officiels depuis l'API publique lolesports, pour les 80 joueurs des Worlds 2026
import json, os, time, urllib.request
H = {"x-api-key": "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z", "User-Agent": "Mozilla/5.0 CDS-fantasy"}
def get(url, binary=False):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40) as r:
                d = r.read(); return d if binary else json.loads(d)
        except Exception as e:
            print("retry", url[:120], e); time.sleep(4 * (i + 1))
    return None
want = json.load(open("tools/want.json"))
os.makedirs("out/le2/img", exist_ok=True)
log = open("out/le2/log.txt", "w")
teams = (get("https://esports-api.lolesports.com/persisted/gw/getTeams?hl=en-US") or {}).get("data", {}).get("teams", [])
idx = [{"name": t.get("name"), "code": t.get("code"), "status": t.get("status"), "image": t.get("image"), "players": [{"n": p.get("summonerName"), "r": p.get("role"), "i": p.get("image")} for p in t.get("players") or []]} for t in teams]
json.dump(idx, open("out/le2/all.json", "w"), ensure_ascii=False)
norm = lambda s: "".join(c for c in (s or "").lower() if c.isalnum())
CODE = {"TL": ["TL", "TLAW"], "LOS": ["LOS", "LØS"], "LYON": ["LYON", "LYN"]}
res = {}
def dl(key, url):
    b = get(url, binary=True)
    if b and len(b) > 300:
        name = "".join(c if c.isalnum() else "_" for c in key)[:60] + (os.path.splitext(url.split("?")[0])[1].lower() or ".png")
        open("out/le2/img/" + name, "wb").write(b); return name
    log.write("image ratée : " + key + " " + str(url) + "\n")
for code in want["teams"]:
    codes = [norm(x) for x in CODE.get(code, [code])]
    c = [t for t in idx if norm(t["code"]) in codes and "academy" not in (t["name"] or "").lower()]
    c.sort(key=lambda t: (t["status"] != "active",))
    if c and c[0]["image"]: res["TEAM:" + code] = {"file": dl("TEAM_" + code, c[0]["image"]), "from": c[0]["name"]}
    else: log.write("logo introuvable : " + code + "\n")
for p in want["players"]:
    codes = [norm(x) for x in CODE.get(p["team"], [p["team"]])]
    hits = [(t, q) for t in idx for q in t["players"] if norm(q["n"]) == norm(p["name"]) and q["i"]]
    hits.sort(key=lambda h: (norm(h[0]["code"]) not in codes, "academy" in (h[0]["name"] or "").lower(), h[0]["status"] != "active"))
    if hits:
        t, q = hits[0]; res[p["name"]] = {"file": dl(p["team"] + "_" + p["name"], q["i"]), "from": t["name"]}
    else: log.write("joueur introuvable : " + p["name"] + " (" + p["team"] + ")\n")
json.dump(res, open("out/le2/images.json", "w"), ensure_ascii=False, indent=1)
log.write(f"ok : {len(res)}\n"); log.close()
