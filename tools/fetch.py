# Récupère (depuis GitHub Actions) : tier lists du Conseil, joueurs des Worlds 2026 et leurs photos Leaguepedia, logos d'équipes.
import json, os, time, urllib.parse, urllib.request

UA = {"User-Agent": "CDS-fantasy/1.0 (projet de fans)"}


def get(url, binary=False, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                d = r.read()
                return d if binary else json.loads(d)
        except Exception as e:
            print("retry", url[:140], e)
            time.sleep(5 * (i + 1))
    return None


os.makedirs("out/img", exist_ok=True)

# 1) tier lists et comptes récupérés (lecture publique)
KEY = "AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I"
FS = "https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/"
for col in ["tiers", "claims"]:
    docs, tok = [], ""
    while True:
        j = get(f"{FS}{col}?pageSize=300&key={KEY}" + (f"&pageToken={tok}" if tok else ""))
        if not j:
            break
        docs += j.get("documents", [])
        tok = j.get("nextPageToken")
        if not tok:
            break
    json.dump(docs, open(f"out/{col}.json", "w"))

# 2) Leaguepedia : joueurs inscrits aux Worlds 2026
API = "https://lol.fandom.com/api.php"


def cargo(tables, fields, where, join_on=""):
    out, off = [], 0
    while True:
        q = {"action": "cargoquery", "format": "json", "tables": tables, "fields": fields, "where": where, "limit": "500", "offset": str(off)}
        if join_on:
            q["join_on"] = join_on
        j = get(API + "?" + urllib.parse.urlencode(q))
        if not j or "cargoquery" not in j:
            print("cargo error", str(j)[:400])
            break
        rows = [r["title"] for r in j["cargoquery"]]
        out += rows
        if len(rows) < 500:
            break
        off += 500
        time.sleep(2)
    return out


tp = cargo("TournamentPlayers=TP,PlayerRedirects=PR,Players=P", "TP.Team=Team,TP.Link=Link,TP.Role=Role,P.Image=Image,P.ID=ID,P.Name=Name,P.Country=Country,TP.OverviewPage=OP",
           "TP.OverviewPage LIKE '2026 Season World Championship%'", "TP.Link=PR.AllName,PR.OverviewPage=P.OverviewPage")
json.dump(tp, open("out/players.json", "w"), ensure_ascii=False, indent=1)
time.sleep(2)
q = lambda xs: ",".join("'" + x.replace("'", "\\'") + "'" for x in xs)
links = sorted(set(r["Link"] for r in tp if r.get("Link")))
pi = []
for i in range(0, len(links), 40):
    pi += cargo("PlayerImages=PI", "PI.FileName=FileName,PI.Link=Link,PI.SortDate=SortDate,PI.Team=Team,PI.Tournament=Tournament", "PI.Link IN (" + q(links[i:i + 40]) + ")")
    time.sleep(2)
json.dump(pi, open("out/playerimages.json", "w"), ensure_ascii=False, indent=1)
teams = sorted(set(r["Team"] for r in tp if r.get("Team")))
tm = cargo("Teams", "Name,Short,Image", "Name IN (" + q(teams) + ")") if teams else []
json.dump(tm, open("out/teams.json", "w"), ensure_ascii=False, indent=1)

# 3) images : la photo la plus récente de chaque joueur, sinon celle de son profil ; logos des équipes
best = {}
for r in pi:
    l, d = r.get("Link"), r.get("SortDate") or ""
    if l and r.get("FileName") and (l not in best or d > best[l][0]):
        best[l] = (d, r["FileName"])
files = {}
for r in tp:
    f = best.get(r["Link"], (None, None))[1] or r.get("Image")
    if f:
        files[r["Link"]] = f
for t in tm:
    if t.get("Image"):
        files["TEAM:" + t["Name"]] = t["Image"]
got = {}
for k, f in files.items():
    url = "https://lol.fandom.com/wiki/Special:FilePath/" + urllib.parse.quote(f.replace(" ", "_")) + "?width=320"
    b = get(url, binary=True)
    if b and len(b) > 500:
        ext = os.path.splitext(f)[1].lower() or ".png"
        name = "".join(c if c.isalnum() else "_" for c in k)[:60] + ext
        open("out/img/" + name, "wb").write(b)
        got[k] = {"file": name, "src": f}
    time.sleep(0.6)
json.dump(got, open("out/images.json", "w"), ensure_ascii=False, indent=1)
print("joueurs", len(tp), "images", len(got))
