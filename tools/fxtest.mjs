import fs from "fs";
const src=fs.readFileSync("tools/fantasy-part.js","utf8");
const written={};
const stubs=`const fbToken=async()=>({token:"x"});const fsPatch=async(p,d)=>{__w[p]=d;return {ok:true,status:200}};const fsList=async()=>Object.entries(__w).map(([p,d])=>({id:p.split("/")[1],...d}));`;
const f=new Function("__w",stubs+src+";return fantasyRun;");
const run=f(written);
const log=await run({});
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/fx.json",JSON.stringify({log,written},null,1));
