import fs from "fs";
let src=fs.readFileSync("tools/worker.js","utf8");src=src.slice(0,src.indexOf("export default {"));
const g=new Function(src+`;return async()=>{const j=await (await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="+FB.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({returnSecureToken:true})})).json();
 const log=[];const sch=await leGet("/getSchedule?hl=en-US&leagueId="+FX_LEAGUE);await resultsRun({}, j.idToken, sch, log);return log}`);
const log=await g()();
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/rwrite.json",JSON.stringify({log},null,1));
