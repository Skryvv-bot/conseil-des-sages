#!/bin/bash
# Vidéo d'aperçu du Q de Graves (Blitz)
mkdir -p out/vfx; cd out/vfx
for cs in Graves:Q Graves:R; do c=${cs%%:*}; k=${cs##*:}
  code=$(curl -sL -A "Mozilla/5.0" -e "https://blitz.gg/" -o "${c}_$k.webm" -w "%{http_code}" "https://blitz-cdn-videos.blitz.gg/tooltip_videos/$c/$k.webm"); echo "${c}_$k $code" >> codes.txt
  [ "$code" = "200" ] && [ -s "${c}_$k.webm" ] || rm -f "${c}_$k.webm"; done
exit 0
