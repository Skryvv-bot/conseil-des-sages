import fs from "fs";
const q=new URLSearchParams({action:"cargoquery",format:"json",tables:"MatchSchedule=MS,MatchScheduleGame=MSG",join_on:"MS.MatchId=MSG.MatchId",
 fields:"MS.Team1,MS.Team2,MS.DateTime_UTC=DT,MSG.N_GameInMatch=N,MSG.Winner,MSG.MVP,MSG.RiotPlatformGameId=RPG,MSG.GameId",
 where:"MS.DateTime_UTC >= '2026-10-23 00:00:00' AND MS.OverviewPage LIKE 'Season World Championship/2026%'",limit:"50",order_by:"MS.DateTime_UTC"});
const out={};
for(let i=0;i<3;i++){const r=await fetch("https://lol.fandom.com/api.php?"+q,{headers:{"User-Agent":"CDS-TV fan site (contact: github Skryvv-bot)"}});out["try"+i]=r.status;const t=await r.text();try{out.j=JSON.parse(t)}catch(e){out.t=t.slice(0,400)};if(out.j&&!out.j.error)break;await new Promise(r=>setTimeout(r,20000))}
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/mvp.json",JSON.stringify(out,null,1));
