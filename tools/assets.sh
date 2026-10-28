#!/bin/bash
# Icônes des sorts des champions d'Icathia et des objets du marchand (Data Dragon, version française)
set -u
mkdir -p out/lol/spells out/lol/items; cd out/lol
V=$(curl -s https://ddragon.leagueoflegends.com/api/versions.json | python3 -c "import sys,json;print(json.load(sys.stdin)[0])")
for c in Ashe Diana Azir Gangplank Kled Galio Mordekaiser Tryndamere Graves; do curl -s -o "spells/$c.json" "https://ddragon.leagueoflegends.com/cdn/$V/data/fr_FR/champion/$c.json"; done
curl -s -o items/item.json "https://ddragon.leagueoflegends.com/cdn/$V/data/fr_FR/item.json"
python3 - "$V" <<'PY'
import json,subprocess,sys
V=sys.argv[1]
for c in "Ashe Diana Azir Gangplank Kled Galio Mordekaiser Tryndamere Graves".split():
  d=json.load(open(f"spells/{c}.json"))["data"][c]
  for i,s in enumerate(d["spells"]):
    k="QWER"[i];subprocess.run(["curl","-s","-o",f"spells/{c}_{k}.png",f"https://ddragon.leagueoflegends.com/cdn/{V}/img/spell/{s['image']['full']}"])
  subprocess.run(["curl","-s","-o",f"spells/{c}_P.png",f"https://ddragon.leagueoflegends.com/cdn/{V}/img/passive/{d['passive']['image']['full']}"])
want=["Potion de soin","Élixir de fer","Élixir de sorcellerie","Élixir de colère","Bottes de célérité","Cotte épineuse","Gage de Sterak","Sablier de Zhonya","Force de la Trinité","Ange gardien","Armure de Warmog","Soif-de-sang","Coiffe de Rabadon","Lame d'infini","Bottes de vitesse","Elixir de fer"]
it=json.load(open("items/item.json"))["data"];found={}
for iid,x in it.items():
  if x["name"] in want and x["name"] not in found: found[x["name"]]=iid
json.dump(found,open("items/found.json","w"),ensure_ascii=False)
for n,iid in found.items(): subprocess.run(["curl","-s","-o",f"items/{iid}.png",f"https://ddragon.leagueoflegends.com/cdn/{V}/img/item/{iid}.png"])
PY
rm -f items/item.json; ls spells | wc -l; cat items/found.json
exit 0
