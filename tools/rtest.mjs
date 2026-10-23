import fs from "fs";
let src=fs.readFileSync("tools/worker.js","utf8");src=src.slice(0,src.indexOf("export default {"));
src=src.replace("async function fsGetRaw(path, tk) {","async function fsGetRaw(path, tk) { return (await fetch(`${FS}/${path}?key=${FB.key}`)).json();");
const f=new Function("__w",src+`;const fsPatch2=async(p,d)=>{__w[p]=d;return {ok:true}};return async()=>{const log=[];const sch=await leGet("/getSchedule?hl=en-US&leagueId="+FX_LEAGUE);
 const _p=fsPatch;return {log,sch}}`);
const w={};const prep=f(w);
// réexécution avec un fsPatch factice
const g=new Function("__w",src.replace(/const fsPatch = /,"const fsPatch_real = ")+`;const fsPatch=async(p,d)=>{__w[p]=d;return {ok:true,status:200}};return async()=>{const log=[];const sch=await leGet("/getSchedule?hl=en-US&leagueId="+FX_LEAGUE);await resultsRun({}, "x", sch, log);return log}`);
const log=await g(w)();
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/rtest.json",JSON.stringify({log,matches:(w["results/state"]?.matches||[]).slice(0,10)},null,1));
