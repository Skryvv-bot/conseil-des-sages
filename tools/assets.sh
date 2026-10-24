#!/bin/bash
# Images hextech (CommunityDragon) et sons de cartes (Kenney, CC0) pour la page Cartes
mkdir -p out/snd out/hex; cd out
U="https://raw.communitydragon.org"
curl -sL "$U/json/latest/plugins/rcp-fe-lol-loot/global/default/assets/loot_item_icons/" -o hex/list.json || true
python3 - <<'PY'
import json
try:
  L=json.load(open('hex/list.json'));names=[x['name'] for x in L]
  open('hex/names.txt','w').write("\n".join(names))
except Exception as e: open('hex/names.txt','w').write("ERR "+str(e))
PY
for f in chest_generic.png chest_champion_mastery.png masterwork_chest.png hextech_chest.png chest.png; do curl -sfL "$U/latest/plugins/rcp-fe-lol-loot/global/default/assets/loot_item_icons/$f" -o "hex/$f" || rm -f "hex/$f"; done
for z in "https://opengameart.org/sites/default/files/kenney_casinoaudio.zip" "https://kenney.nl/media/pages/assets/casino-audio/2b6a0f3d1c-1677589333/kenney_casino-audio.zip"; do curl -sfL "$z" -o snd/k.zip && break; done
ls -la snd hex | head -40 > report.txt
cd snd && (unzip -o -q k.zip && find . -iname "*card*" | head -60 >> ../report.txt) ; rm -f k.zip
