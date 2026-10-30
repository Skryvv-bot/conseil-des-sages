#!/bin/bash
set -u
mkdir -p out/fx
python3 tools/multikills.py 2>&1 | tee out/fx/report.txt
exit 0
