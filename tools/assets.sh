#!/bin/bash
# Icônes officielles des runes (Data Dragon + CommunityDragon) et illustrations des champions d'Icathia
set -u
mkdir -p out/lol/runes out/lol/splash out/lol/loading; cd out/lol
V=$(curl -s https://ddragon.leagueoflegends.com/api/versions.json | python3 -c "import sys,json;print(json.load(sys.stdin)[0])"); echo "$V" > version.txt
curl -s -o runesReforged.json "https://ddragon.leagueoflegends.com/cdn/$V/data/fr_FR/runesReforged.json"
curl -s -o perks.json "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/fr_fr/v1/perks.json"
curl -s -o perkstyles.json "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/fr_fr/v1/perkstyles.json"
python3 - <<'PY'
import json,subprocess,os
icons=set()
for st in json.load(open("runesReforged.json")):
  icons.add(st["icon"])
  for sl in st["slots"]:
    for r in sl["runes"]: icons.add(r["icon"])
for i in icons:
  out="runes/"+i.replace("/","__")
  subprocess.run(["curl","-s","-o",out,"https://ddragon.leagueoflegends.com/cdn/img/"+i])
for p in json.load(open("perks.json")):
  ip=p.get("iconPath","")
  if "StatMods" in ip:
    rel=ip.split("/v1/")[1].lower()
    subprocess.run(["curl","-s","-o","runes/statmods__"+os.path.basename(rel),"https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/"+rel])
PY
for c in Ashe Diana Azir Gangplank Kled Galio Mordekaiser Tryndamere Graves; do
  curl -s -o "splash/$c.jpg" "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c}_0.jpg"
  curl -s -o "loading/$c.jpg" "https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${c}_0.jpg"
done
ls -la runes | head; ls runes | wc -l
exit 0
