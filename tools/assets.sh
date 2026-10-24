#!/bin/bash
mkdir -p out/jingle; cd out/jingle
for u in https://lpc.opengameart.org/sites/default/files/jingleSounds_Kenney.zip https://opengameart.org/sites/default/files/jingleSounds_Kenney.zip; do curl -sfL "$u" -o j.zip && break; done
unzip -o -q j.zip && rm -f j.zip; find . -type f | sort > ../jreport.txt
