# Statistiques LoL du Conseil : échantillon de parties classées Solo/Duo Master+ dans les grandes régions (EUW, Corée, Amérique du Nord),
# agrégées par région, par patch et par champion. Lancé chaque nuit par .github/workflows/stats.yml (secret RIOT_KEY).
# Écrit dans le dossier courant (branche « stats ») :
#   out/<région>/<patch>.json : par champion et par poste : parties, victoires, bans, objets, bottes, runes, sorts, builds
#   out/patches.json          : patchs disponibles par région
#   etat.json                 : parties déjà comptées (pour ne jamais compter deux fois)
# Les limites de Riot sont comptées par région : les trois régions tournent en parallèle. En EUW on reste lent (~2,5 s
# par requête) car le robot du site utilise la même clé ; en Corée et en Amérique du Nord on va un peu plus vite.
import json, os, random, sys, time, threading, urllib.request, urllib.error
from collections import Counter

KEY = os.environ.get("RIOT_KEY", "").strip()
if not KEY: sys.exit("RIOT_KEY manquante (secret GitHub)")
REGIONS = {  # code : (plateforme, routage des parties, pause entre deux requêtes)
    "euw": ("https://euw1.api.riotgames.com", "https://europe.api.riotgames.com", 2.5),
    "kr": ("https://kr.api.riotgames.com", "https://asia.api.riotgames.com", 1.4),
    "na": ("https://na1.api.riotgames.com", "https://americas.api.riotgames.com", 1.4),
}
MAX_MATCHES = int(os.environ.get("MAX_MATCHES", "900"))
DEADLINE = time.time() + float(os.environ.get("MAX_MINUTES", "150")) * 60
os.makedirs("out", exist_ok=True)
STOP = threading.Event()

def load(p, d):
    try: return json.load(open(p, encoding="utf8"))
    except Exception: return d
def pnum(p): return [int(x) for x in p.split(".")]

# ancien format (EUW seulement, fichiers à la racine de out/) : on le range dans out/euw/
os.makedirs("out/euw", exist_ok=True)
for f in os.listdir("out"):
    if f[0].isdigit() and f.endswith(".json"): os.replace(f"out/{f}", f"out/euw/{f}")
etat = load("etat.json", {})
if "vus" in etat and "euw" not in etat: etat = {"euw": etat["vus"]}

# Data Dragon : objets « finis » (légendaires) et bottes, pour ne garder que les vrais objets de build
ver = json.load(urllib.request.urlopen("https://ddragon.leagueoflegends.com/api/versions.json"))[0]
items = json.load(urllib.request.urlopen(f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/fr_FR/item.json"))["data"]
BOOTS = {int(i) for i, it in items.items() if "Boots" in it.get("tags", []) and it.get("depth", 1) >= 2}
LEGEND = {int(i) for i, it in items.items() if it.get("gold", {}).get("total", 0) >= 2200 and not it.get("into") and it.get("gold", {}).get("purchasable", True)
          and int(i) not in BOOTS and it.get("maps", {}).get("11", True)}
print("Data Dragon", ver, "légendaires", len(LEGEND), "bottes", len(BOOTS), flush=True)

def bump(c, k, win):
    k = str(k); v = c.get(k) or [0, 0]; v[0] += 1; v[1] += 1 if win else 0; c[k] = v
def trim(c, n=30): return dict(sorted(c.items(), key=lambda kv: -kv[1][0])[:n])

def collect(code):
    plat, reg, pause = REGIONS[code]
    def get(url, tries=4):
        for _ in range(tries):
            if STOP.is_set(): return None
            time.sleep(pause)
            req = urllib.request.Request(url, headers={"X-Riot-Token": KEY, "User-Agent": "conseil-des-sages-stats"})
            try:
                with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code == 429: time.sleep(int(e.headers.get("Retry-After") or 30) + 5); continue
                if e.code in (500, 502, 503, 504): time.sleep(10); continue
                if e.code in (401, 403): print(f"[{code}] clé Riot refusée ({e.code})", flush=True); STOP.set(); return None
                return None
            except Exception: time.sleep(5)
        return None
    vus = etat.get(code, {})
    players = []
    for tier in ("challengerleagues", "grandmasterleagues", "masterleagues"):
        d = get(f"{plat}/lol/league/v4/{tier}/by-queue/RANKED_SOLO_5x5")
        if d: players += [e["puuid"] for e in d.get("entries", []) if e.get("puuid")]
    random.shuffle(players)
    print(f"[{code}] joueurs Master+", len(players), flush=True)
    since = int(time.time()) - 2 * 86400
    seen = {m for l in vus.values() for m in l}
    todo = []
    for p in players[:220]:
        if time.time() > DEADLINE or len(todo) >= MAX_MATCHES * 1.3: break
        for m in get(f"{reg}/lol/match/v5/matches/by-puuid/{p}/ids?queue=420&type=ranked&startTime={since}&count=8") or []:
            if m not in seen and m not in todo: todo.append(m)
    print(f"[{code}] parties à lire", len(todo), flush=True)
    data, done = {}, 0
    def P(patch):
        if patch not in data: data[patch] = load(f"out/{code}/{patch}.json", {"patch": patch, "region": code, "parties": 0, "champions": {}})
        return data[patch]
    for mid in todo[:MAX_MATCHES]:
        if time.time() > DEADLINE or STOP.is_set(): break
        m = get(f"{reg}/lol/match/v5/matches/{mid}")
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
        if done % 100 == 0: print(f"[{code}] parties lues", done, flush=True)
    os.makedirs(f"out/{code}", exist_ok=True)
    for patch, S in data.items():
        for ch in S["champions"].values():
            for R in ch["postes"].values():
                for k in ("objets", "bottes", "builds", "cle", "runes2", "sorts"): R[k] = trim(R[k])
        S["maj"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()); S["source"] = f"Classées Solo/Duo Master+ {code.upper()}"
        json.dump(S, open(f"out/{code}/{patch}.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
        print(f"[{code}] écrit", patch, S["parties"], "parties", flush=True)
    # mémoire des parties : seulement les 3 derniers patchs
    etat[code] = {p: vus[p][-20000:] for p in sorted(vus, key=pnum, reverse=True)[:3]}
    print(f"[{code}] terminé :", done, "nouvelles parties", flush=True)

th = [threading.Thread(target=collect, args=(c,)) for c in REGIONS]
for t in th: t.start()
for t in th: t.join()

regions = {}
for code in REGIONS:
    d = f"out/{code}"
    if not os.path.isdir(d): continue
    ps = sorted({f[:-5] for f in os.listdir(d) if f[0].isdigit() and f.endswith(".json")}, key=pnum, reverse=True)
    regions[code] = [{"patch": p, "parties": load(f"{d}/{p}.json", {}).get("parties", 0)} for p in ps]
json.dump({"regions": regions, "ddragon": ver, "maj": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
          open("out/patches.json", "w", encoding="utf8"), ensure_ascii=False)
json.dump(etat, open("etat.json", "w"), separators=(",", ":"))
if STOP.is_set(): print("ATTENTION : clé Riot refusée pendant la collecte, vérifie le secret RIOT_KEY")
