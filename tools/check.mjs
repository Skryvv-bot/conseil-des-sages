import fs from "fs";
const out={};const K="AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I",B="https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/";
const g=async u=>{const r=await fetch(u);return {s:r.status,t:(await r.text()).slice(0,800)}};
out.list=await g(B+"fantasyGames?key="+K);
out.doc=await g(B+"fantasyGames/lol_115660540726095006?key="+K);
out.sages=await g(B+"fantasySages?pageSize=2&key="+K);out.time=new Date().toISOString();
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/check.json",JSON.stringify(out,null,1));
