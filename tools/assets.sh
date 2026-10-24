#!/bin/bash
mkdir -p out; cd out
{ echo "--- robot /cards"; curl -s -X POST -H "Content-Type: application/json" -d '{"op":"free"}' https://conseil-riot.perrotinyvanpro.workers.dev/cards; echo
  echo "--- doc cartes Skryvv"; curl -s "https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/cards/7ggyIoUpvlRrJCpqKkgdYlsMhcp2?mask.fieldPaths=free&mask.fieldPaths=freeAt&mask.fieldPaths=opened&mask.fieldPaths=n"; echo
  echo "--- portefeuille"; curl -s "https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/wallets/7ggyIoUpvlRrJCpqKkgdYlsMhcp2?mask.fieldPaths=po"; } > check.txt 2>&1
