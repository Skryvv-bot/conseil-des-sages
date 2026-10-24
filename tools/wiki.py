# Wiki LoL : données Data Dragon (fr_FR) + régions de l'univers LoL, images redimensionnées en webp
import json, os, io, re, urllib.request, concurrent.futures as cf
from PIL import Image
UA={"User-Agent":"Mozilla/5.0 CDS-TV wiki"}
def get(u, raw=False):
    r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read()
    return r if raw else json.loads(r)
OUT="out/wiki"; os.makedirs(OUT+"/c",exist_ok=True); os.makedirs(OUT+"/s",exist_ok=True); os.makedirs(OUT+"/r",exist_ok=True); os.makedirs(OUT+"/b",exist_ok=True)
ver=get("https://ddragon.leagueoflegends.com/api/versions.json")[0]
full=get(f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/fr_FR/championFull.json")["data"]
log={"version":ver,"n":len(full),"errors":[]}
# Régions (univers)
regions={}; champRegion={}
try:
    idx=get("https://universe-meeps.leagueoflegends.com/v1/fr_fr/search/index.json")
    log["idxkeys"]=list(idx.keys())
    for c in idx.get("champions",[]):
        champRegion[c.get("slug")]=c.get("associated-faction-slug")
    for f in idx.get("factions",[]):
        slug=f["slug"]
        try:
            d=get(f"https://universe-meeps.leagueoflegends.com/v1/fr_fr/factions/{slug}/index.json")
            fa=d.get("faction",{})
            img=(fa.get("image") or {}).get("uri")
            desc=(fa.get("overview") or {}).get("short","")
            regions[slug]={"name":fa.get("name",f.get("name")),"desc":re.sub(r"<[^>]+>","",desc),"img":None}
            if img:
                im=Image.open(io.BytesIO(get(img,True))).convert("RGB");im.thumbnail((1200,700));im.save(f"{OUT}/r/{slug}.webp","WEBP",quality=72);regions[slug]["img"]=f"r/{slug}.webp"
        except Exception as e: log["errors"].append(f"faction {slug}: {e}")
except Exception as e: log["errors"].append(f"univers: {e}")
def clean(t): return re.sub(r"<[^>]+>"," ",t or "").replace("  "," ").strip()
champs={}
def work(cid):
    c=full[cid]; key=c["id"]
    try:
        im=Image.open(io.BytesIO(get(f"https://ddragon.leagueoflegends.com/cdn/img/champion/loading/{key}_0.jpg",True))).convert("RGB")
        im=im.resize((240,437));im.save(f"{OUT}/c/{key}.webp","WEBP",quality=70)
        sp=Image.open(io.BytesIO(get(f"https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{key}_0.jpg",True))).convert("RGB")
        sp.thumbnail((960,566));sp.save(f"{OUT}/b/{key}.webp","WEBP",quality=62)
        icons=[c["passive"]["image"]["full"]]+[s["image"]["full"] for s in c["spells"]]
        strip=Image.new("RGB",(48*5+48,48))
        for i,f in enumerate(icons):
            u=f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/passive/{f}" if i==0 else f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/spell/{f}"
            ic=Image.open(io.BytesIO(get(u,True))).convert("RGB").resize((48,48));strip.paste(ic,(48*i,0))
        strip.save(f"{OUT}/s/{key}.webp","WEBP",quality=80)
    except Exception as e: log["errors"].append(f"{key}: {e}")
    slug=key.lower()
    champs[key]={"name":c["name"],"title":c["title"],"tags":c["tags"],"partype":c.get("partype"),"info":c["info"],"lore":c.get("lore",""),"blurb":c.get("blurb",""),
      "region":champRegion.get(slug) or champRegion.get(c["name"].lower().replace(" ","").replace("'","").replace(".","")),
      "stats":{k:c["stats"][k] for k in ["hp","hpperlevel","mp","mpperlevel","armor","spellblock","attackdamage","attackspeed","movespeed","attackrange"]},
      "passive":{"name":c["passive"]["name"],"desc":clean(c["passive"]["description"])},
      "spells":[{"key":"QWER"[i],"name":s["name"],"desc":clean(s["description"]),"cd":s.get("cooldownBurn"),"cost":s.get("costBurn"),"range":s.get("rangeBurn")} for i,s in enumerate(c["spells"])],
      "skins":[s["name"] for s in c.get("skins",[]) if s["num"]!=0 and not s.get("parentSkin")][:60],"nskins":len([s for s in c.get("skins",[]) if s["num"]!=0 and not s.get("parentSkin")]),"allytips":c.get("allytips",[])[:3]}
with cf.ThreadPoolExecutor(12) as ex: list(ex.map(work,list(full)))
json.dump({"version":ver,"champions":champs,"regions":regions},open(f"{OUT}/data.json","w"),ensure_ascii=False)
log["regions"]=len(regions);log["noRegion"]=[k for k,v in champs.items() if not v["region"]]
json.dump(log,open("out/wikilog.json","w"),ensure_ascii=False,indent=1)
