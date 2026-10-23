import fs from "fs";
const out={time:new Date().toISOString()};const K="AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I",B="https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/";
const W="https://conseil-riot.perrotinyvanpro.workers.dev";
const list=async c=>{const r=await fetch(B+c+"?pageSize=300&key="+K);const j=await r.json();if(!r.ok)return {err:r.status};return (j.documents||[]).map(d=>({id:d.name.split("/").pop(),mvp:d.fields?.mvp?.stringValue,teams:d.fields?.teams?.arrayValue?.values?.map(v=>v.stringValue),winner:d.fields?.winner?.stringValue}))};
out.before=await list("fantasyGames");
const r=await fetch(W+"/fantasy");out.run=await r.text();
out.after=await list("fantasyGames");
const st=await fetch(B+"results/state?key="+K);const sj=await st.json();out.stateUpd=sj.updateTime;
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/check.json",JSON.stringify(out,null,1));
