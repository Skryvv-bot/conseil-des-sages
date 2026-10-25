#!/bin/bash
# Vidéo officielle de la compétence Q de Diana : quelques images pour en reproduire l'effet
mkdir -p out/dianaq; cd out/dianaq; rm -f *.jpg
curl -sfL "https://lol.dyn.riotcdn.net/x/videos/champion-abilities/0131/ability_0131_Q1.mp4" -o q.mp4 || echo "echec" > err.txt
if [ -f q.mp4 ]; then ffprobe -v error -show_entries format=duration -of csv=p=0 q.mp4 > info.txt; ffmpeg -loglevel error -i q.mp4 -vf "fps=6,scale=480:-1" -q:v 4 f_%02d.jpg; rm q.mp4; fi
ls > list.txt
