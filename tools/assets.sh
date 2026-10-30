#!/bin/bash
# Vérification Fantasy : games enregistrées, MVP Leaguepedia, champs des stats officielles
set -u
mkdir -p out/fx; cd out/fx
exec > >(tee report.txt) 2>&1
FS="https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents"
curl -s -m 40 "$FS/fantasyGames?pageSize=300" -o games.json
python3 - <<'PY'
import json
j=json.load(open("games.json"));docs=j.get("documents",[])
print("games",len(docs), "erreur" if "error" in j else "")
mv=0;ids=[]
for d in docs:
  f=d["fields"];
  if "mvp" in f: mv+=1
  ids.append((f.get("teams",{}).get("arrayValue",{}).get("values",[]),f.get("gameId",{}).get("stringValue"),f.get("at",{}).get("integerValue")))
print("avec mvp",mv)
open("ids.txt","w").write("\n".join(i[1] for i in ids if i[1]))
d=docs[0]["fields"]["players"]["mapValue"]["fields"]; k=list(d)[0]; print("exemple",k,json.dumps(d[k])[:600])
PY
GID=$(head -1 ids.txt); echo "game $GID"
W0=$(curl -s -m 40 "https://feed.lolesports.com/livestats/v1/window/$GID")
echo "$W0" | python3 -c "import json,sys;j=json.load(sys.stdin);f=j['frames'];print('window frames',len(f),f[0]['rfc460Timestamp'],f[-1]['rfc460Timestamp']);print(json.dumps(f[0]['blueTeam']['participants'][0]))" 
T0=$(echo "$W0" | python3 -c "import json,sys;j=json.load(sys.stdin);print(j['frames'][0]['rfc460Timestamp'])")
TS=$(python3 -c "import datetime;t=datetime.datetime.fromisoformat('$T0'.replace('Z','+00:00'))+datetime.timedelta(minutes=12);print(t.strftime('%Y-%m-%dT%H:%M:')+'%02d'%(t.second//10*10)+'.000Z')")
curl -s -m 40 "https://feed.lolesports.com/livestats/v1/window/$GID?startingTime=$TS" | python3 -c "import json,sys;j=json.load(sys.stdin);f=j['frames'];print('window2',len(f),[x['rfc460Timestamp'][11:19] for x in f])"
curl -s -m 40 "https://feed.lolesports.com/livestats/v1/details/$GID?startingTime=$TS" | python3 -c "import json,sys;j=json.load(sys.stdin);f=j['frames'];print('details',len(f),[x['rfc460Timestamp'][11:19] for x in f]);print(json.dumps(f[-1]['participants'][0])[:900])"
# Leaguepedia : MVP et pentakills des Worlds 2026
curl -s -m 40 -A "CDS-TV fan site" "https://lol.fandom.com/api.php?action=cargoquery&format=json&tables=MatchSchedule=MS,MatchScheduleGame=MSG&join_on=MS.MatchId=MSG.MatchId&fields=MS.Team1,MS.Team2,MS.DateTime_UTC=DT,MSG.N_GameInMatch=N,MSG.MVP&where=MS.OverviewPage%20LIKE%20%27Season%20World%20Championship/2026%25%27&limit=60" -o lp_mvp.json; python3 -c "import json;j=json.load(open('lp_mvp.json'));r=[x['title'] for x in j.get('cargoquery',[])];print('LP lignes',len(r),'avec MVP',sum(1 for x in r if x.get('MVP')));print(r[:3]);print(j.get('error'))"
curl -s -m 40 -A "CDS-TV fan site" "https://lol.fandom.com/api.php?action=cargoquery&format=json&tables=Pentakills&fields=Name,Team,Champion,DateDisplay,OverviewPage&where=OverviewPage%20LIKE%20%27Season%20World%20Championship/2026%25%27&limit=50" -o lp_penta.json; head -c 800 lp_penta.json; echo
curl -s -m 40 -A "CDS-TV fan site" "https://lol.fandom.com/api.php?action=cargoquery&format=json&tables=ScoreboardPlayers&fields=Name,Champion,Kills,Deaths,Assists,GameId&where=OverviewPage%20LIKE%20%27Season%20World%20Championship/2026%25%27&limit=3" | head -c 600; echo
rm -f games.json
exit 0
