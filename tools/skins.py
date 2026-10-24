# Skins : rareté et description (CommunityDragon, fr_fr), illustrations de chargement (Data Dragon) -> une planche par champion
import json, os, io, re, urllib.request, concurrent.futures as cf
from PIL import Image
UA={"User-Agent":"Mozilla/5.0 CDS-TV wiki"}
def get(u, raw=False):
    r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read()
    return r if raw else json.loads(r)
OUT="out/wiki"; os.makedirs(OUT+"/k",exist_ok=True)
ver=get("https://ddragon.leagueoflegends.com/api/versions.json")[0]
full=get(f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/fr_FR/championFull.json")["data"]
log={"errors":[]}
try: cd=get("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/fr_fr/v1/skins.json")
except Exception as e: cd={}; log["errors"].append("cdragon "+str(e))
W,H=160,224
skins={}
def work(cid):
    c=full[cid]; key=c["id"]; cnum=int(c["key"])
    lst=[s for s in c.get("skins",[]) if not s.get("parentSkin")]
    out=[];thumbs=[]
    for s in lst:
        sid=cnum*1000+s["num"]; info=cd.get(str(sid),{})
        if info.get("isBase") is False and info.get("parentSkinId"): continue
        try:
            im=Image.open(io.BytesIO(get(f"https://ddragon.leagueoflegends.com/cdn/img/champion/loading/{key}_{s['num']}.jpg",True))).convert("RGB")
            w,h=im.size;ch=int(w*7/5);im=im.crop((0,0,w,min(h,ch))).resize((W,H))
            thumbs.append(im)
            out.append({"num":s["num"],"name":c["name"] if s["num"]==0 else s["name"],"rarity":info.get("rarity","kNoRarity"),"legacy":bool(info.get("isLegacy")),"desc":re.sub(r"<[^>]+>","",info.get("description") or "")})
        except Exception as e: log["errors"].append(f"{key}_{s['num']}: {e}")
    if thumbs:
        sheet=Image.new("RGB",(W*len(thumbs),H))
        for i,t in enumerate(thumbs): sheet.paste(t,(W*i,0))
        sheet.save(f"{OUT}/k/{key}.webp","WEBP",quality=60)
    skins[key]=out
with cf.ThreadPoolExecutor(16) as ex: list(ex.map(work,list(full)))
# planche de toutes les icônes de compétences (passif + A Z E R), 48 px
keys=sorted(full); S=48; cols=30; n=len(keys)*5; rows=(n+cols-1)//cols
atlas=Image.new("RGB",(cols*S,rows*S)); idx={}
def icons(key):
    c=full[key]; fs=[("passive",c["passive"]["image"]["full"])]+[("spell",s["image"]["full"]) for s in c["spells"]]
    return [Image.open(io.BytesIO(get(f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/{t}/{f}",True))).convert("RGB").resize((S,S)) for t,f in fs]
with cf.ThreadPoolExecutor(16) as ex: res=dict(zip(keys,ex.map(icons,keys)))
i=0
for k in keys:
    idx[k]=i
    for im in res[k]: atlas.paste(im,((i%cols)*S,(i//cols)*S)); i+=1
atlas.save(f"{OUT}/atlas.webp","WEBP",quality=82)
json.dump({"skins":skins,"atlas":{"cols":cols,"size":S,"w":cols*S,"h":rows*S,"idx":idx}},open(f"{OUT}/skins.json","w"),ensure_ascii=False)
from collections import Counter
log["n"]=sum(len(v) for v in skins.values());log["rar"]=Counter(s["rarity"] for v in skins.values() for s in v)
json.dump(log,open("out/skinslog.json","w"),ensure_ascii=False,indent=1)
