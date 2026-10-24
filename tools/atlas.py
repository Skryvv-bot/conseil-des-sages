import json, io, urllib.request, concurrent.futures as cf
from PIL import Image
UA={"User-Agent":"Mozilla/5.0 CDS-TV wiki"}
def get(u, raw=False):
    r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read();return r if raw else json.loads(r)
ver=get("https://ddragon.leagueoflegends.com/api/versions.json")[0]
full=get(f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/fr_FR/championFull.json")["data"]
keys=sorted(full);S=64;cols=30;rows=(len(keys)*5+cols-1)//cols
def icons(key):
    c=full[key];fs=[("passive",c["passive"]["image"]["full"])]+[("spell",s["image"]["full"]) for s in c["spells"]]
    return [Image.open(io.BytesIO(get(f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/{t}/{f}",True))).convert("RGB").resize((S,S)) for t,f in fs]
with cf.ThreadPoolExecutor(16) as ex: res=dict(zip(keys,ex.map(icons,keys)))
atlas=Image.new("RGB",(cols*S,rows*S));idx={};i=0
for k in keys:
    idx[k]=i
    for im in res[k]: atlas.paste(im,((i%cols)*S,(i//cols)*S));i+=1
atlas.save("out/wiki/atlas.webp","WEBP",quality=85)
sk=json.load(open("out/wiki/skins.json"));sk["atlas"]={"cols":cols,"size":S,"w":cols*S,"h":rows*S,"idx":idx};json.dump(sk,open("out/wiki/skins.json","w"),ensure_ascii=False)
