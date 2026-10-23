import fs from "fs";
const K="AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I",B="https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/";
const r=await fetch(B+"results/state?key="+K);fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/state.json",await r.text());
