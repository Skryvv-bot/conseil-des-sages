#!/bin/bash
# Repérage des fichiers audio du wiki LoL (répliques et effets sonores des champions d'Icathia)
set -u
mkdir -p out/audio; cd out/audio
for c in Ashe Diana Azir Gangplank Kled Galio Mordekaiser Tryndamere Graves; do
  curl -sL -A "Mozilla/5.0" -o "$c.html" "https://wiki.leagueoflegends.com/en-us/$c/Audio"
  grep -o 'https\?://[^"'"'"' ]*\.ogg' "$c.html" | sort -u > "$c.ogg.txt" || true
  grep -o '/en-us/images/[^"'"'"' ]*\.ogg' "$c.html" | sort -u >> "$c.ogg.txt" || true
  echo "$c $(wc -l < $c.ogg.txt) $(wc -c < $c.html)" >> summary.txt
  rm -f "$c.html"
done
curl -sL -A "Mozilla/5.0" -o music.html "https://wiki.leagueoflegends.com/en-us/Music"
grep -o '[^"'"'"' ]*\.ogg' music.html | sort -u | head -300 > music.ogg.txt; rm -f music.html
cat summary.txt; wc -l music.ogg.txt
exit 0
