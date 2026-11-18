# Statistiques LoL du Conseil : échantillon de parties classées Solo/Duo Master+ en EUW, agrégées par patch et par champion.
# Lancé chaque nuit par .github/workflows/stats.yml (secret RIOT_KEY). Écrit dans le dossier courant (branche « stats ») :
#   out/<patch>.json    : par champion et par poste : parties, victoires, bans, objets, bottes, runes, sorts, builds
#   out/patches.json    : liste des patchs disponibles
#   etat.json           : parties déjà comptées (pour ne jamais compter deux fois)
# La clé est partagée avec le robot du site : on reste lent (une requête toutes les ~2,5 s) pour ne pas le gêner.
import json, os, random, sys, time, urllib.request, urllib.error, urllib.parse
from collections import Counter

KEY = os.environ.get("RIOT_KEY", "").strip()
if not KEY: sys.exit("RIOT_KEY manquante (secret GitHub)")
PLAT, REG = "https://euw1.api.riotgames.com", "https://europe.api.riotgames.com"
MAX_MATCHES = int(os.environ.get("MAX_MATCHES", "900"))
PAUSE = float(os.environ.get("PAUSE", "2.5"))
DEADLINE = time.time() + float(os.environ.get("MAX_MINUTES", "150")) * 60
os.makedirs("out", exist_ok=True)

def get(url, tries=4):
    for t in range(tries):
        time.sleep(PAUSE)
        req = urllib.request.Request(url, headers={"X-Riot-Token": KEY, "User-Agent": "conseil-des-sages-stats"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(int(e.headers.get("Retry-After") or 30) + 5); continue
            if e.code in (500, 502, 503, 504): time.sleep(10); continue
            if e.code in (401, 403): sys.exit(f"Clé Riot refusée ({e.code}) : vérifie le secret RIOT_KEY")
            return None
        except Exception: time.sleep(5)
    return None

def load(p, d):
    try: return json.load(open(p, encoding="utf8"))
    except Exception: return d

# Data Dragon : objets « finis » (légendaires) et bottes, pour ne garder que les vrais objets de build
ver = json.load(urllib.request.urlopen("https://ddragon.leagueoflegends.com/api/versions.json"))[0]
items = json.load(urllib.request.urlopen(f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/fr_FR/item.json"))["data"]
BOOTS = {int(i) for i, it in items.items() if "Boots" in it.get("tags", []) and it.get("depth", 1) >= 2}
LEGEND = {int(i) for i, it in items.items() if it.get("gold", {}).get("total", 0) >= 2200 and not it.get("into") and it.get("gold", {}).get("purchasable", True)
          and int(i) not in BOOTS and it.get("maps", {}).get("11", True)}
print("Data Dragon", ver, "légendaires", len(LEGEND), "bottes", len(BOOTS))

etat = load("etat.json", {"vus": {}})
vus = etat["vus"]  # patch -> liste d'identifiants de parties déjà comptées

# 1) joueurs Master+ (les entrées de ligue donnent directement le puuid)
players = []
for tier in ("challengerleagues", "grandmasterleagues", "masterleagues"):
    d = get(f"{PLAT}/lol/league/v4/{tier}/by-queue/RANKED_SOLO_5x5")
    if d: players += [e["puuid"] for e in d.get("entries", []) if e.get("puuid")]
random.shuffle(players)
print("joueurs Master+", len(players))

# 2) parties récentes (2 jours) de ces joueurs
since = int(time.time()) - 2 * 86400
seen_all = {m for l in vus.values() for m in l}
queue_ids = []
for p in players[:220]:
    if time.time() > DEADLINE or len(queue_ids) >= MAX_MATCHES * 1.3: break
    ids = get(f"{REG}/lol/match/v5/matches/by-puuid/{p}/ids?queue=420&type=ranked&startTime={since}&count=8") or []
    for m in ids:
        if m not in seen_all and m not in queue_ids: queue_ids.append(m)
print("parties à lire", len(queue_ids))

# 3) lecture des parties et agrégation par patch
data = {}  # patch -> structure
def P(patch):
    if patch not in data:
        data[patch] = load(f"out/{patch}.json", {"patch": patch, "parties": 0, "champions": {}})
    return data[patch]

def bump(c, k, win):
    k = str(k); v = c.get(k) or [0, 0]; v[0] += 1; v[1] += 1 if win else 0; c[k] = v

done = 0
for mid in queue_ids[:MAX_MATCHES]:
    if time.time() > DEADLINE: break
    m = get(f"{REG}/lol/match/v5/matches/{mid}")
    if not m: continue
    info = m.get("info", {})
    if info.get("queueId") != 420 or info.get("gameDuration", 0) < 600: continue  # pas les remakes
    patch = ".".join(info.get("gameVersion", "0.0").split(".")[:2])
    S = P(patch); S["parties"] += 1; vus.setdefault(patch, []).append(mid); done += 1
    for team in info.get("teams", []):
        for b in team.get("bans", []):
            if b.get("championId", -1) > 0:
                ch = S["champions"].setdefault(str(b["championId"]), {"bans": 0, "postes": {}}); ch["bans"] = ch.get("bans", 0) + 1
    for pa in info.get("participants", []):
        pos = pa.get("teamPosition") or "AUTRE"; win = bool(pa.get("win"))
        ch = S["champions"].setdefault(str(pa["championId"]), {"bans": 0, "postes": {}})
        ch["nom"] = pa.get("championName")
        R = ch["postes"].setdefault(pos, {"n": 0, "w": 0, "objets": {}, "bottes": {}, "builds": {}, "cle": {}, "runes2": {}, "sorts": {}})
        R["n"] += 1; R["w"] += 1 if win else 0
        inv = [pa.get(f"item{i}", 0) for i in range(6)]
        leg = [i for i in inv if i in LEGEND]
        for i in set(leg): bump(R["objets"], i, win)
        bo = [i for i in inv if i in BOOTS]
        if bo: bump(R["bottes"], bo[0], win)
        if len(leg) >= 3: bump(R["builds"], "-".join(str(i) for i in sorted(leg[:3])), win)
        st = (pa.get("perks") or {}).get("styles") or []
        if st:
            bump(R["cle"], st[0]["selections"][0]["perk"], win)
            if len(st) > 1: bump(R["runes2"], st[1]["style"], win)
        bump(R["sorts"], "-".join(str(s) for s in sorted([pa.get("summoner1Id", 0), pa.get("summoner2Id", 0)])), win)
    if done % 100 == 0: print("parties lues", done)

# 4) on garde les 30 meilleures entrées de chaque liste (fichiers légers) et on écrit
def trim(c, n=30): return dict(sorted(c.items(), key=lambda kv: -kv[1][0])[:n])
for patch, S in data.items():
    for ch in S["champions"].values():
        for R in ch["postes"].values():
            for k in ("objets", "bottes", "builds", "cle", "runes2", "sorts"): R[k] = trim(R[k])
    S["maj"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()); S["source"] = "Classées Solo/Duo Master+ EUW"
    json.dump(S, open(f"out/{patch}.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("écrit", patch, S["parties"], "parties")
patches = sorted({f[:-5] for f in os.listdir("out") if f[0].isdigit() and f.endswith(".json")}, key=lambda p: [int(x) for x in p.split(".")], reverse=True)
json.dump({"patches": [{"patch": p, "parties": load(f"out/{p}.json", {}).get("parties", 0)} for p in patches], "ddragon": ver,
           "maj": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, open("out/patches.json", "w", encoding="utf8"), ensure_ascii=False)
# on ne garde la mémoire des parties que pour les 3 derniers patchs
etat["vus"] = {p: vus[p][-20000:] for p in sorted(vus, key=lambda p: [int(x) for x in p.split(".")], reverse=True)[:3]}
json.dump(etat, open("etat.json", "w"), separators=(",", ":"))
print("terminé :", done, "nouvelles parties")
