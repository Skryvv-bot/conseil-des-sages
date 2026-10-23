import fs from "fs";
let src=fs.readFileSync("tools/worker.js","utf8");src=src.slice(0,src.indexOf("export default {"));
const g=new Function(src+`;return async()=>{const j=await (await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="+FB.key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({returnSecureToken:true})})).json();const tk=j.idToken;
 const log=[];const list=await (await fetch(FS+"/fantasyGames?pageSize=300&key="+FB.key)).json();
 for(const d of list.documents||[]){const o=docObj(d);let t=o.teams;if(!Array.isArray(t)){t=Object.keys(t||{}).sort().map(k=>t[k]);const r=await fsPatch("fantasyGames/"+o.id,{teams:t},tk);log.push(o.id+" "+t.join("-")+" "+r.status)}else log.push(o.id+" ok")}
 return log}`);
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/gfix.json",JSON.stringify({log:await g()()},null,1));
