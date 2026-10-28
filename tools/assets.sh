#!/bin/bash
# Voix VO des champions d'Icathia (wiki LoL) : sélection, sorts, attaques, morts, éliminations
set -u
mkdir -p out/voice; cd out/voice
while read -r n; do [ -z "$n" ] && continue; [ -s "$n" ] || curl -sL -A "Mozilla/5.0" -o "$n" "https://wiki.leagueoflegends.com/en-us/images/$n"; done < ../../tools/audio_list.txt
ls | wc -l; du -sh .
exit 0
