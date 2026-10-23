import fs from "fs";
let src=fs.readFileSync("tools/worker.js","utf8");src=src.slice(0,src.indexOf("export default {"));
const g=new Function(src+`;return async()=>{const j=await (await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="+FB.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({returnSecureToken:true})})).json();const tk=j.idToken;
 const log=[];
 // remettre matches en liste (ordre R1-1, R1-2, …)
 const raw=await (await fetch(FS+"/results/state?key="+FB.key)).json();let m=fromFs(raw.fields.matches);if(!Array.isArray(m))m=Object.keys(m).sort((a,b)=>+a-+b).map(k=>m[k]);
 const r0=await fsPatch("results/state",{matches:m,updatedAt:new Date().toISOString()},tk);log.push("liste "+r0.status+" "+m.length);
 const sch=await leGet("/getSchedule?hl=en-US&leagueId="+FX_LEAGUE);await resultsRun({}, tk, sch, log);
 const raw2=await (await fetch(FS+"/results/state?key="+FB.key)).json();const m2=fromFs(raw2.fields.matches);log.push("isArray "+Array.isArray(m2)+" "+m2.slice(0,6).map(x=>x.id+":"+x.status+":"+x.winner).join(" "));
 return log}`);
const log=await g()();
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/rwrite.json",JSON.stringify({log},null,1));
