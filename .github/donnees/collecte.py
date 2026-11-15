# Collecte des données externes affichées sur le site (boutique Fortnite, jeux gratuits Epic, matchs LEC/LCK/LPL, vidéos YouTube).
# Lancé par GitHub Actions ; le résultat va dans la branche « donnees » (out/*.json), lue par le site.
import json, os, re, sys, time, urllib.request, urllib.error, xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
os.makedirs("out", exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (CDS.TV, site de fan)", "Accept-Language": "fr-FR,fr;q=0.9"}
def get(url, headers=None, raw=False):
    r = urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=40)
    b = r.read(); return b if raw else json.loads(b)
def save(name, data):
    json.dump({"at": int(time.time() * 1000), **data}, open("out/" + name, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("écrit", name, len(json.dumps(data)))
def safe(f):
    try: f()
    except Exception as e: print("ÉCHEC", f.__name__, repr(e)[:300])

def boutique():
    h = {"Authorization": os.environ["FORTNITE_KEY"]} if os.environ.get("FORTNITE_KEY") else {}
    d = get("https://fortnite-api.com/v2/shop?language=fr", h)["data"]
    items = []
    for e in d.get("entries", []):
        br = e.get("brItems") or []; tr = e.get("tracks") or []; inst = e.get("instruments") or []; cars = e.get("cars") or []
        first = (br + inst + cars + tr + [{}])[0]
        name = (e.get("bundle") or {}).get("name") or first.get("name") or first.get("title") or ""
        if not name: continue
        nai = e.get("newDisplayAsset") or {}; ri = (nai.get("renderImages") or [{}])[0]
        img = (e.get("bundle") or {}).get("image") or ri.get("image") or (first.get("images") or {}).get("featured") or (first.get("images") or {}).get("icon") or (first.get("images") or {}).get("large") or first.get("albumArt") or ""
        kind = "Pack" if e.get("bundle") else ((first.get("type") or {}).get("displayValue") or ("Musique" if tr else ""))
        rar = (first.get("rarity") or {}).get("displayValue") or ""; series = (first.get("series") or {}).get("value") or ""
        items.append({"n": name, "p": e.get("finalPrice"), "r": e.get("regularPrice"), "i": img, "k": kind, "rar": series or rar,
                      "sec": (e.get("layout") or {}).get("name") or "", "until": e.get("outDate") or "", "c": ((e.get("colors") or {}).get("color1") or "")[:6]})
    seen, out = set(), []
    for it in items:
        k = (it["n"], it["p"])
        if k in seen or not it["i"]: continue
        seen.add(k); out.append(it)
    save("boutique.json", {"date": d.get("date"), "items": out})

def jeux_gratuits():
    d = get("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR")
    now = datetime.now(timezone.utc); cur, nxt = [], []
    for g in d["data"]["Catalog"]["searchStore"]["elements"]:
        pr = g.get("promotions") or {}
        def offers(key): return [o for grp in (pr.get(key) or []) for o in grp.get("promotionalOffers", []) if (o.get("discountSetting") or {}).get("discountPercentage") == 0]
        img = next((k["url"] for t in ("OfferImageWide", "DieselStoreFrontWide", "Thumbnail", "OfferImageTall") for k in g.get("keyImages", []) if k.get("type") == t), "")
        slug = (g.get("catalogNs") or {}).get("mappings") or g.get("offerMappings") or []
        slug = (slug[0].get("pageSlug") if slug else None) or g.get("productSlug") or g.get("urlSlug") or ""
        base = {"n": g.get("title"), "i": img, "u": ("https://store.epicgames.com/fr/p/" + slug.split("/")[0]) if slug else "https://store.epicgames.com/fr/free-games", "prix": ((g.get("price") or {}).get("totalPrice") or {}).get("fmtPrice", {}).get("originalPrice", "")}
        for o in offers("promotionalOffers"):
            if o["startDate"] <= now.isoformat() <= o["endDate"]: cur.append({**base, "fin": o["endDate"]})
        for o in offers("upcomingPromotionalOffers"): nxt.append({**base, "debut": o["startDate"], "fin": o["endDate"]})
    save("jeux-gratuits.json", {"now": cur, "next": nxt})

def matchs():
    K = {"x-api-key": "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"}
    lg = {l["slug"]: l for l in get("https://esports-api.lolesports.com/persisted/gw/getLeagues?hl=fr-FR", K)["data"]["leagues"]}
    ids = ",".join(lg[s]["id"] for s in ("lec", "lck", "lpl") if s in lg)
    ev = get("https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=fr-FR&leagueId=" + ids, K)["data"]["schedule"]["events"]
    now = datetime.now(timezone.utc); out = []
    for e in ev:
        if e.get("type") != "match": continue
        t = datetime.fromisoformat(e["startTime"].replace("Z", "+00:00"))
        if t < now - timedelta(days=3) or t > now + timedelta(days=21): continue
        m = e["match"]; tm = m["teams"]
        out.append({"t": e["startTime"], "st": e["state"], "lg": e["league"]["name"], "bk": e.get("blockName", ""), "bo": (m.get("strategy") or {}).get("count", 1),
                    "a": {"n": tm[0]["name"], "c": tm[0]["code"], "i": tm[0]["image"], "w": (tm[0].get("result") or {}).get("gameWins", 0)},
                    "b": {"n": tm[1]["name"], "c": tm[1]["code"], "i": tm[1]["image"], "w": (tm[1].get("result") or {}).get("gameWins", 0)}})
    live = []
    try:
        for e in get("https://esports-api.lolesports.com/persisted/gw/getLive?hl=fr-FR", K)["data"]["schedule"].get("events") or []:
            if e.get("league", {}).get("slug") in ("lec", "lck", "lpl") and e.get("state") == "inProgress": live.append(e.get("id"))
    except Exception as x: print("live", x)
    # prochaine date de reprise si rien dans les 3 semaines
    reprise = {}
    if not out:
        for s in ("lec", "lck", "lpl"):
            try:
                tl = get("https://esports-api.lolesports.com/persisted/gw/getTournamentsForLeague?hl=fr-FR&leagueId=" + lg[s]["id"], K)["data"]["leagues"][0]["tournaments"]
                fut = sorted(x["startDate"] for x in tl if x["startDate"] >= now.date().isoformat())
                if fut: reprise[s.upper()] = fut[0]
            except Exception as x: print("reprise", s, x)
    save("matchs.json", {"matches": out, "live": live, "reprise": reprise, "logos": {s.upper(): lg[s]["image"] for s in ("lec", "lck", "lpl") if s in lg}})

def videos():
    CH = {"lol": ["@LeagueOfLegendsFR", "@leagueoflegends"], "wow": ["@WorldofWarcraftFR", "@Warcraft"], "fortnite": ["@FortniteFR", "@Fortnite"]}
    res = {}
    for jeu, handles in CH.items():
        vids = []
        for h in handles:
            try:
                html = get("https://www.youtube.com/" + h, raw=True).decode("utf8", "ignore")
                cid = (re.search(r'"externalId":"(UC[\w-]{22})"', html) or re.search(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"', html) or re.search(r'"channelId":"(UC[\w-]{22})"', html)).group(1)
                x = ET.fromstring(get("https://www.youtube.com/feeds/videos.xml?channel_id=" + cid, raw=True))
                ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "m": "http://search.yahoo.com/mrss/"}
                chn = x.findtext("a:title", "", ns)
                for en in x.findall("a:entry", ns):
                    vid = en.findtext("yt:videoId", "", ns); link = (en.find("a:link", ns).get("href") if en.find("a:link", ns) is not None else "")
                    if "/shorts/" in link: continue
                    vids.append({"id": vid, "t": en.findtext("a:title", "", ns), "d": en.findtext("a:published", "", ns), "ch": chn})
                print(jeu, h, cid, chn, len(vids))
            except Exception as e: print("ÉCHEC vidéos", jeu, h, repr(e)[:200])
        vids.sort(key=lambda v: v["d"], reverse=True)
        res[jeu] = vids[:8]
    save("videos.json", res)

for f in (boutique, jeux_gratuits, matchs, videos): safe(f)
