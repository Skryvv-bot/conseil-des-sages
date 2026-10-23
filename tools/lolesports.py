# Photos et logos officiels depuis l'API publique lolesports (pas de limite stricte, images sur static.lolesports.com)
import json, os, subprocess, time, urllib.request
KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
H = {"x-api-key": KEY, "User-Agent": "Mozilla/5.0 CDS-fantasy"}
def get(url, binary=False):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40) as r:
                d = r.read(); return d if binary else json.loads(d)
        except Exception as e:
            print("retry", url[:120], e); time.sleep(4 * (i + 1))
    return None
os.makedirs("out/le", exist_ok=True)
log = open("out/le/log.txt", "w")
WANT = ["Gen.G", "Hanwha Life Esports", "T1", "Dplus KIA", "Anyone's Legend", "Bilibili Gaming", "Top Esports", "Invictus Gaming", "G2 Esports",
        "Movistar KOI", "Karmine Corp", "Team Liquid", "LYON", "Team Secret Whales", "CTBC Flying Oyster", "LOS"]
j = get("https://esports-api.lolesports.com/persisted/gw/getTeams?hl=en-US")
teams = (j or {}).get("data", {}).get("teams", [])
log.write(f"équipes reçues : {len(teams)}\n")
norm = lambda s: "".join(c for c in s.lower() if c.isalnum())
out = {}
for w in WANT:
    cands = [t for t in teams if norm(t.get("name", "")) == norm(w) or norm(t.get("code", "")) == norm(w)]
    cands = cands or [t for t in teams if norm(w) in norm(t.get("name", ""))]
    cands.sort(key=lambda t: (t.get("status") != "active", -len(t.get("players") or [])))
    if not cands:
        log.write("équipe introuvable : " + w + "\n"); continue
    t = cands[0]
    out[w] = {"name": t["name"], "code": t.get("code"), "image": t.get("image"), "players": [{"name": p.get("summonerName"), "role": p.get("role"), "image": p.get("image")} for p in t.get("players") or []]}
json.dump(out, open("out/le/teams.json", "w"), ensure_ascii=False, indent=1)
os.makedirs("out/le/img", exist_ok=True)
n = 0
for w, t in out.items():
    items = [("TEAM_" + (t["code"] or w), t["image"])] + [(t["code"] + "_" + (p["name"] or "x"), p["image"]) for p in t["players"]]
    for k, url in items:
        if not url: continue
        b = get(url, binary=True)
        if b and len(b) > 300:
            ext = os.path.splitext(url.split("?")[0])[1].lower() or ".png"
            name = "".join(c if c.isalnum() else "_" for c in k)[:60] + ext
            open("out/le/img/" + name, "wb").write(b); n += 1
        else:
            log.write("image ratée : " + k + " " + str(url) + "\n")
log.write(f"images : {n}\n"); log.close()
print("images", n)
