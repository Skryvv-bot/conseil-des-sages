import {initializeApp} from "firebase/app";
import {getAuth,signInAnonymously} from "firebase/auth";
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,deleteDoc} from "firebase/firestore";
import fs from "fs";
const app=initializeApp({apiKey:"AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I",authDomain:"conseil-des-sages.firebaseapp.com",projectId:"conseil-des-sages"});
const log=[];const L=(...a)=>{log.push(a.map(x=>typeof x==="string"?x:JSON.stringify(x)).join(" "))};
try{
await signInAnonymously(getAuth(app));const db=getFirestore(app);
const riot={};(await getDocs(collection(db,"riot"))).forEach(d=>riot[d.id]=d.data());
const claimed=new Set();(await getDocs(collection(db,"claims"))).forEach(d=>claimed.add(d.id));
const players=Object.entries(riot).filter(([id,p])=>p.riotId&&p.pseudo&&!claimed.has(id));
const accs=p=>[{riotId:p.riotId,region:p.region||"euw1",main:true},...(p.alts||[]).filter(a=>a&&a.riotId).map(a=>({riotId:a.riotId,region:a.region||p.region||"euw1"}))];
const list=[...new Set(players.flatMap(([,p])=>accs(p).map(a=>a.riotId+"|"+a.region)))];
L("accounts",list.length);
const r=await fetch("https://conseil-riot.perrotinyvanpro.workers.dev/ranks?players="+encodeURIComponent(list.join(",")),{headers:{Origin:"https://conseil-des-sages.pages.dev"}});
L("ranks status",r.status);const j=await r.json();L("errors",j.errors);
const out={};for(const [id,p] of players){const rk=j.ranks?.[p.riotId.toLowerCase()];out[id]={pseudo:p.pseudo,riotId:p.riotId,solo:rk?.solo||null,flex:rk?.flex||null,err:rk?null:(j.errors?.[p.riotId.toLowerCase()]||null),
  alts:accs(p).filter(a=>!a.main).map(a=>{const x=j.ranks?.[a.riotId.toLowerCase()];return {riotId:a.riotId,solo:x?.solo||null,flex:x?.flex||null}})}}
L("bapti",out["etddQT7rHJWJ6SFIpPbCXwJbqW23"]);
try{await setDoc(doc(db,"ladder","debugtest"),{updatedAt:new Date().toISOString(),players:out});L("set debugtest OK");await deleteDoc(doc(db,"ladder","debugtest")).catch(e=>L("del",e.code))}catch(e){L("set debugtest FAIL",e.code,e.message)}
const cur=(await getDoc(doc(db,"ladder","current"))).data();L("current updatedAt",cur.updatedAt,"keys",Object.keys(cur),"weekKeys",cur.week?Object.keys(cur.week):null);
}catch(e){L("fatal",e.message)}
fs.mkdirSync("out",{recursive:true});fs.writeFileSync("out/ladtest.txt",log.join("\n"));process.exit(0);
