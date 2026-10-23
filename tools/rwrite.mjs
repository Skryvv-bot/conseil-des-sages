import fs from "fs";
let src=fs.readFileSync("tools/worker.js","utf8");src=src.slice(0,src.indexOf("export default {"));
const g=new Function(src+`;return async()=>{const j=await (await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="+FB.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({returnSecureToken:true})})).json();const tk=j.idToken;
 const log=[];const list=await (await fetch(FS+"/fantasyGames?pageSize=300&key="+FB.key)).json();const games=(list.documents||[]).map(docObj);
 const sch=await leGet("/getSchedule?hl=en-US&leagueId="+FX_LEAGUE);await resultsRun({}, tk, sch, log, games);
 const raw2=await (await fetch(FS+"/results/state?key="+FB.key)).json();const ps=fromFs(raw2.fields.playerStats);log.push("games "+fromFs(raw2.fields.games)+" Chovy "+JSON.stringify(ps.Chovy)+" n="+Object.keys(ps).length);
 return log}`);
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/rwrite.json",JSON.stringify({log:await g()()},null,1));
