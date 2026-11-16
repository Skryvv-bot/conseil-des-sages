# Heures de jeu du Conseil : toutes les 10 min, lit le widget Discord du serveur et ajoute le temps écoulé à chaque jeu en cours.
# Seuls des totaux par jeu sont gardés (et un identifiant haché par joueur, pour compter combien de sages ont joué). Fichier : out/heures.json
import json, os, re, time, hashlib, urllib.request
from datetime import datetime, timezone, timedelta
F = "out/heures.json"; os.makedirs("out", exist_ok=True)
NOT_GAME = re.compile(r"^[/!.]|\bhelp\b|curseforge|spotify|medal|visual studio|youtube|twitch|crunchyroll|netflix|custom status|discord|obs studio|wallpaper engine|steam$|battle\.net$|epic games launcher|riot client", re.I)
d = json.load(open(F)) if os.path.exists(F) else {"since": None, "last": None, "days": {}}
now = time.time()
w = json.loads(urllib.request.urlopen(urllib.request.Request("https://discord.com/api/guilds/781876426571251743/widget.json", headers={"User-Agent": "CDS.TV"}), timeout=30).read())
# temps compté pour ce relevé : depuis le relevé précédent, 20 min au plus (GitHub peut sauter des passages)
mins = 10 if not d["last"] else max(0, min(20, (now - d["last"]) / 60))
day = datetime.now(timezone(timedelta(hours=1))).strftime("%Y-%m-%d")
D = d["days"].setdefault(day, {})
n = 0
for m in w.get("members", []):
    g = (m.get("game") or {}).get("name")
    if not g or NOT_GAME.search(g): continue
    g = re.sub(r"\s+", " ", g).strip()[:60]
    e = D.setdefault(g, {"m": 0, "p": []})
    e["m"] = round(e["m"] + mins, 1)
    h = hashlib.sha1(("cds:" + str(m.get("username", ""))).encode()).hexdigest()[:8]
    if h not in e["p"]: e["p"].append(h)
    n += 1
d["last"] = now; d["since"] = d["since"] or day
for k in sorted(d["days"])[:-400]: del d["days"][k]
json.dump(d, open(F, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print(day, "joueurs en jeu:", n, "minutes ajoutées:", round(mins, 1), "jeux du jour:", len(D))
