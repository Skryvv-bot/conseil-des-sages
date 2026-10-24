#!/bin/bash
# Sons de cartes (Kenney Casino Audio, CC0)
mkdir -p out/snd; cd out/snd
curl -sfL "https://opengameart.org/sites/default/files/kenney_casino-audio.zip" -o k.zip && unzip -o -q k.zip && rm k.zip
find . -type f | sort > ../report.txt
