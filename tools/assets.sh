#!/bin/bash
mkdir -p out/dianaq; cd out/dianaq; rm -f *.jpg err.txt
for n in Q1 Q2 W1 E1 R1 P1; do for ext in mp4 webm; do u="https://lol.dyn.riotcdn.net/x/videos/champion-abilities/0131/ability_0131_${n}.${ext}";
  c=$(curl -s -o /dev/null -w "%{http_code}" -A "Mozilla/5.0" -e "https://www.leagueoflegends.com/" "$u"); echo "$n.$ext $c" >> codes.txt; done; done
U="https://lol.dyn.riotcdn.net/x/videos/champion-abilities/0131/ability_0131_Q1.webm"
curl -sfL -A "Mozilla/5.0" -e "https://www.leagueoflegends.com/" "$U" -o q.vid || curl -sfL -A "Mozilla/5.0" -e "https://www.leagueoflegends.com/" "${U%.webm}.mp4" -o q.vid
if [ -s q.vid ]; then ffprobe -v error -show_entries format=duration -of csv=p=0 q.vid > info.txt; ffmpeg -loglevel error -i q.vid -vf "fps=6,scale=480:-1" -q:v 4 f_%02d.jpg; rm q.vid; fi
ls > list.txt
