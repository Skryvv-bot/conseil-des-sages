#!/bin/bash
# Vidéos d'aperçu des sorts (Blitz) : sort principal + ultime des 8 champions
mkdir -p out/vfx; cd out/vfx; rm -f codes.txt
for cs in Azir:W Azir:R Diana:Q Diana:R Gangplank:E Gangplank:R Ashe:W Ashe:R Kled:Q Kled:R Galio:Q Galio:R Mordekaiser:Q Mordekaiser:R Tryndamere:E Tryndamere:R; do
  c=${cs%%:*}; k=${cs##*:}; u="https://blitz-cdn-videos.blitz.gg/tooltip_videos/$c/$k.webm"
  code=$(curl -sL -A "Mozilla/5.0" -e "https://blitz.gg/" -o "${c}_$k.webm" -w "%{http_code}" "$u"); echo "${c}_$k $code $(stat -c%s ${c}_$k.webm 2>/dev/null)" >> codes.txt
  [ "$code" = "200" ] && [ -s "${c}_$k.webm" ] || rm -f "${c}_$k.webm"
done
exit 0
