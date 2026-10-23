import fs from "fs";
const out={};const K="AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I",B="https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/";
const W="https://conseil-riot.perrotinyvanpro.workers.dev";
out.root=await (await fetch(W+"/",{headers:{Origin:"https://conseil-des-sages.pages.dev"}})).text().catch(e=>e.message);
const list=async c=>{const r=await fetch(B+c+"?pageSize=300&key="+K);const j=await r.json();return (j.documents||[]).map(d=>({id:d.name.split("/").pop(),upd:d.updateTime,mvp:d.fields?.mvp?.stringValue,teams:d.fields?.teams?.arrayValue?.values?.map(v=>v.stringValue),winner:d.fields?.winner?.stringValue}))};
out.gamesBefore=await list("fantasyGames");
if(!out.gamesBefore.length){const r=await fetch(W+"/fantasy");out.fantasyStatus=r.status;out.fantasyRun=(await r.text()).slice(0,1500);out.gamesAfter=await list("fantasyGames")}
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/check.json",JSON.stringify(out,null,1));
