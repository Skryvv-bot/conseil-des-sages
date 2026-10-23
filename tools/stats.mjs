import fs from "fs";
const KEY="0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z",H={"x-api-key":KEY};
const out={};const J=async(u,h=H)=>{const r=await fetch(u,{headers:h});const t=await r.text();try{return {s:r.status,j:JSON.parse(t)}}catch(e){return {s:r.status,t:t.slice(0,300)}}};
const lg=await J("https://esports-api.lolesports.com/persisted/gw/getLeagues?hl=fr-FR");
const worlds=lg.j.data.leagues.filter(l=>/worlds/i.test(l.slug));out.leagues=worlds.map(l=>({id:l.id,slug:l.slug,name:l.name}));
const sch=await J(`https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=fr-FR&leagueId=${worlds.map(l=>l.id).join(",")}`);
const ev=sch.j.data.schedule.events.filter(e=>e.type==="match"&&Math.abs(Date.parse(e.startTime)-Date.now())<20*3600e3);
out.events=ev.map(e=>({start:e.startTime,state:e.state,block:e.blockName,id:e.match.id,teams:e.match.teams.map(t=>t.code+":"+(t.result?.outcome||"")+":"+(t.result?.gameWins??"")),strategy:e.match.strategy}));
const done=ev.find(e=>e.state==="completed")||ev.find(e=>e.state==="inProgress");
if(done){const det=await J(`https://esports-api.lolesports.com/persisted/gw/getEventDetails?hl=fr-FR&id=${done.match.id}`);
  out.games=det.j.data.event.match.games.map(g=>({id:g.id,n:g.number,state:g.state,teams:g.teams}));
  const g=det.j.data.event.match.games.find(x=>x.state==="completed")||det.j.data.event.match.games[0];
  const w0=await J(`https://feed.lolesports.com/livestats/v1/window/${g.id}`,{});out.w0s=w0.s;
  if(w0.j){out.meta=w0.j.gameMetadata;const t0=Date.parse(w0.j.frames[0].rfc460Timestamp);out.t0=w0.j.frames[0].rfc460Timestamp;
    let last=null,lastT=null;for(let m=10;m<=70;m+=5){const ts=new Date(Math.floor((t0+m*60e3)/10000)*10000).toISOString();const w=await J(`https://feed.lolesports.com/livestats/v1/window/${g.id}?startingTime=${ts}`,{});if(w.j?.frames?.length){last=w.j;lastT=ts}else{out.stopAt=m;break}}
    if(last){const f=last.frames[last.frames.length-1];out.lastWindowFrame=f;
      const d=await J(`https://feed.lolesports.com/livestats/v1/details/${g.id}?startingTime=${lastT}`,{});out.detailsStatus=d.s;if(d.j){const fr=d.j.frames;out.lastDetails=fr[fr.length-1]}}}}
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/stats.json",JSON.stringify(out,null,1));
