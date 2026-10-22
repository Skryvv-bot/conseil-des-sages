// Outils partagés par toutes les pages du Conseil des Sages
const FIREBASE_CONFIG={
  apiKey:"AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I",
  authDomain:"conseil-des-sages.firebaseapp.com",
  projectId:"conseil-des-sages",
  storageBucket:"conseil-des-sages.firebasestorage.app",
  messagingSenderId:"909258807221",
  appId:"1:909258807221:web:2e1d7feb3dfab11a33abfc"
};

// Renvoie {db, uid} une fois le visiteur connecté anonymement, ou {db:null, error} si la connexion échoue.
window.conseilConnect=function(){
  return new Promise(resolve=>{
    try{
      if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
      const auth=firebase.auth(), db=firebase.firestore();
      let done=false;
      auth.onAuthStateChanged(u=>{if(u&&!done){done=true;window.CONSEIL_UID=u.uid;watchCamps(db,u.uid);resolve({db,uid:u.uid})}});
      auth.signInAnonymously().catch(e=>{if(!done){done=true;console.error(e);resolve({db:null,error:e})}});
    }catch(e){console.error(e);resolve({db:null,error:e})}
  });
};

// ---------- Navigation commune ----------
const CONSEIL_NAV=[
  {id:"accueil",href:"index.html",label:"Accueil"},
  {id:"worlds",href:"worlds.html",label:"Worlds 2026",sub:[{id:"worlds",href:"worlds.html",label:"Matchs & pronos"},{id:"tierlist",href:"tierlist.html",label:"Tier list"}]},
  {id:"jeux",href:"jeux.html",label:"Jeux",sub:[{id:"jeux",href:"jeux.html",label:"Tous les jeux"},{id:"devinettes",href:"devinettes.html",label:"Devinettes"},{id:"echauffement",href:"echauffement.html",label:"Échauffement"}]},
  {id:"customs",href:"customs.html",label:"Customs & Clash"},
  {id:"conseil",href:"communaute.html",label:"Le Conseil"},
  {id:"patch",href:"patch.html",label:"Patch"}
];
const NAV_GROUP={tierlist:"worlds",devinettes:"jeux",echauffement:"jeux"};
(function navStyles(){
  const css=`
.cnav{position:sticky;top:env(safe-area-inset-top,0px);z-index:50;margin:-20px calc(-1*max(16px,env(safe-area-inset-left,0px))) 0;padding:10px max(16px,env(safe-area-inset-left,0px));
  background:rgba(1,10,19,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid #463714}
.cnav-in{max-width:1040px;margin:0 auto;display:flex;align-items:center;gap:14px}
.cnav-brand{display:flex;align-items:center;gap:8px;text-decoration:none;color:#c8aa6e;font:700 .95rem "Cinzel",Georgia,serif;letter-spacing:.06em;white-space:nowrap}
.cnav-brand svg{width:26px;height:26px}
.cnav-links{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0}
.cnav-links::-webkit-scrollbar{display:none}
.cnav-links a{white-space:nowrap;text-decoration:none;color:#a09b8c;font:600 .78rem "Barlow",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:7px 10px;border:1px solid transparent}
.cnav-links a:hover{color:#f0e6d2}
.cnav-links a[aria-current="page"]{color:#f0e6d2;border-color:#785a28;box-shadow:inset 0 -2px 0 #0ac8b9}
.cnav-install{white-space:nowrap;font:700 .7rem "Barlow",system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#0ac8b9;background:transparent;border:1px solid #0397ab;padding:6px 10px;cursor:pointer}
.csub{display:flex;gap:6px;flex-wrap:wrap}
.csub a{text-decoration:none;font:600 .74rem "Barlow",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#a09b8c;padding:6px 10px;border:1px solid #1e2d43;background:#010a13}
.csub a[aria-current="page"]{color:#0ac8b9;border-color:#0397ab}
@media (max-width:620px){.cnav-brand span{display:none}}`;
  const s=document.createElement("style");s.textContent=css;document.head.appendChild(s);
})();
window.conseilNav=function(active){
  const group=NAV_GROUP[active]||active;
  const nav=document.createElement("nav");nav.className="cnav";nav.setAttribute("aria-label","Navigation du site");
  nav.innerHTML=`<div class="cnav-in"><a class="cnav-brand" href="index.html" aria-label="Conseil des Sages, accueil"><span>CDS<b>.</b>TV</span></a>
    <div class="cnav-links">${CONSEIL_NAV.map(n=>`<a href="${n.href}" ${n.id===group?'aria-current="page"':""}>${n.label}</a>`).join("")}</div>
    <button class="cnav-install" id="cnavInstall" hidden>Installer l'appli</button></div>`;
  document.body.prepend(nav);
  const tk=document.createElement("div");tk.className="tv-ticker";tk.setAttribute("aria-label","Bandeau d'infos");
  tk.innerHTML=`<div class="in"><span class="dot">● Direct</span><div style="overflow:hidden;flex:1;min-width:0"><div class="run" id="tvRun"></div></div></div>`;
  document.body.prepend(tk);conseilTicker(defaultTicker());
  const item=CONSEIL_NAV.find(n=>n.id===group);
  if(item&&item.sub){const wrap=document.querySelector(".wrap");if(wrap){const sub=document.createElement("div");sub.className="csub";
    sub.innerHTML=item.sub.map(s=>`<a href="${s.href}" ${s.id===active?'aria-current="page"':""}>${s.label}</a>`).join("");wrap.prepend(sub)}}
  setupInstall();
};

// ---------- Application installable ----------
let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;showInstall()});
function showInstall(){if(!deferredInstall)return;const b=document.getElementById("cnavInstall");if(b)b.hidden=false;
  document.querySelectorAll("[data-install]").forEach(x=>x.hidden=false)}
window.conseilInstall=async function(){
  if(deferredInstall){deferredInstall.prompt();try{await deferredInstall.userChoice}catch(e){}deferredInstall=null;
    document.querySelectorAll("#cnavInstall,[data-install]").forEach(x=>x.hidden=true);return true}
  return false;
};
function setupInstall(){const b=document.getElementById("cnavInstall");if(b)b.onclick=()=>conseilInstall();showInstall()}
if("serviceWorker" in navigator&&location.protocol==="https:"){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(e=>console.warn("sw",e)));
}

// ---------- Petits utilitaires ----------
window.conseilEsc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Semaine ISO, ex. "2026-W43"
window.conseilWeek=function(d=new Date()){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);
  const y=t.getUTCFullYear(),w=Math.ceil(((t-Date.UTC(y,0,1))/864e5+1)/7);return `${y}-W${String(w).padStart(2,"0")}`};

// ---------- Images officielles : champions (Data Dragon de Riot) et logos d'équipes (Leaguepedia) ----------
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const DD_FIX={"Wukong":"MonkeyKing","Nunu et Willump":"Nunu","Nunu & Willump":"Nunu","Maître Yi":"MasterYi","Master Yi":"MasterYi","Renata Glasc":"Renata","Renata":"Renata","LeBlanc":"Leblanc","Kai'Sa":"Kaisa","Kha'Zix":"Khazix","Cho'Gath":"Chogath","Bel'Veth":"Belveth","Vel'Koz":"Velkoz","Kog'Maw":"KogMaw","Rek'Sai":"RekSai","K'Sante":"KSante","Dr. Mundo":"DrMundo","Jarvan IV":"JarvanIV","Aurelion Sol":"AurelionSol","Fiddlesticks":"Fiddlesticks"};
window.conseilChampId=n=>DD_FIX[n]||String(n).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z]/g,"");
let ddVersion=null,ddWaiters=[];
window.conseilDD=function(){                         // dernière version de Data Dragon (mise en cache 12 h)
  if(ddVersion)return Promise.resolve(ddVersion);
  const c=LS.get("dd-ver",null);if(c&&Date.now()-c.t<12*3600e3){ddVersion=c.v;return Promise.resolve(ddVersion)}
  return fetch("https://ddragon.leagueoflegends.com/api/versions.json").then(r=>r.json()).then(v=>{ddVersion=v[0];LS.set("dd-ver",{v:ddVersion,t:Date.now()});return ddVersion}).catch(()=>{ddVersion=(c&&c.v)||"15.20.1";return ddVersion});
};
conseilDD();
window.conseilChampImg=n=>ddVersion?`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${conseilChampId(n)}.png`:"";
// <img> de champion avec repli sur des initiales si l'image n'existe pas
window.conseilChampHTML=function(n,size=32,cls=""){
  const ini=conseilEsc(String(n).replace(/[^A-Za-zÀ-ÿ]/g,"").slice(0,2));
  const fb=`<span class=&quot;cimg-fb ${cls}&quot; style=&quot;width:${size}px;height:${size}px&quot;>${ini}</span>`;
  const u=conseilChampImg(n);
  return u?`<img class="cimg ${cls}" src="${u}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.outerHTML='${fb}'">`:`<span class="cimg-fb ${cls}" style="width:${size}px;height:${size}px">${ini}</span>`;
};
(function(){const s=document.createElement("style");s.textContent=`.cimg{display:inline-block;object-fit:cover;border:1px solid #785a28;vertical-align:middle;flex:none;background:#010a13}
.cimg-fb{display:inline-grid;place-items:center;flex:none;font:700 .72rem "Cinzel",Georgia,serif;color:#010a13;background:#c8aa6e;border:1px solid #785a28;vertical-align:middle}
.tlogo{display:inline-grid;place-items:center;width:30px;height:30px;flex:none;vertical-align:middle}
.tlogo img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 0 1px rgba(0,0,0,.6))}
.tlogo.light{background:#e8e3d4;border-radius:50%;padding:3px;box-shadow:0 0 0 1px #785a28}
.tlogo.light img{filter:none}`;document.head.appendChild(s)})();

// Logos d'équipes (images Leaguepedia). Plusieurs noms de fichier possibles par équipe : on essaie dans l'ordre,
// on retient celui qui marche, et on revient au badge de couleur si aucun ne charge.
const TEAM_LOGO_CANDIDATES={"GEN": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e3/Gen.Glogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/5b/Gen.Glogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3b/Gen.Glogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Gen.Glogo_square.png"], "HLE": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a6/Hanwha_Life_Esportslogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e9/Hanwha_Life_Esportslogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e9/Hanwha_Life_Esportslogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Hanwha_Life_Esportslogo_square.png"], "T1": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a2/T1logo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/78/T1logo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/fc/T1logo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/T1logo_square.png"], "DK": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/1b/Dplus_Kialogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3c/Dpluslogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/32/DWG_KIAlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/73/Dplus_KIAlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/7e/Dplus_Kialogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/78/Dpluslogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/24/DWG_KIAlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e0/Dplus_KIAlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/55/Dplus_Kialogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e1/Dpluslogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/9a/DWG_KIAlogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/fc/Dplus_KIAlogo_std.png/revision/latest/scale-to-width-down/64"], "AL": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/25/Anyone%27s_Legendlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/74/Anyone%27s_Legendlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/44/Anyone%27s_Legendlogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Anyone%27s_Legendlogo_square.png"], "BLG": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/91/Bilibili_Gaminglogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/fb/Bilibili_Gaminglogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/5b/Bilibili_Gaminglogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Bilibili_Gaminglogo_square.png"], "TES": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/46/Top_Esportslogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/75/TOP_Esportslogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/35/Top_Esportslogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/09/TOP_Esportslogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3a/Top_Esportslogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/6e/TOP_Esportslogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Top_Esportslogo_square.png"], "IG": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e4/Invictus_Gaminglogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/7f/Invictus_Gaminglogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/72/Invictus_Gaminglogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Invictus_Gaminglogo_square.png"], "G2": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/77/G2_Esportslogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/b4/G2_Esportslogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/50/G2_Esportslogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/G2_Esportslogo_square.png"], "MKOI": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/bd/Movistar_KOIlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/8/84/MAD_Lions_KOIlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/19/Movistar_KOI_%28Spanish_Team%29logo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/39/Movistar_KOIlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/f9/MAD_Lions_KOIlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/9a/Movistar_KOI_%28Spanish_Team%29logo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/bf/Movistar_KOIlogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/98/MAD_Lions_KOIlogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/ad/Movistar_KOI_%28Spanish_Team%29logo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Movistar_KOIlogo_square.png"], "KC": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/2d/Karmine_Corplogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/f7/Karmine_Corplogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/ed/Karmine_Corplogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Karmine_Corplogo_square.png"], "TL": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/f4/Team_Liquidlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/90/Team_Liquid_Alienwarelogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/25/Team_Liquidlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/79/Team_Liquid_Alienwarelogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/bf/Team_Liquidlogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e5/Team_Liquid_Alienwarelogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Team_Liquidlogo_square.png"], "LYON": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/54/LYON_%282024_American_Team%29logo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/c4/LYONlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/94/Lyon_Gaminglogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/01/LYON_%282024_American_Team%29logo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/4a/LYONlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/fc/Lyon_Gaminglogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/78/LYON_%282024_American_Team%29logo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/8/85/LYONlogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/d/d0/Lyon_Gaminglogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/LYON_(2024_American_Team)logo_square.png"], "TSW": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/ac/Team_Secret_Whaleslogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/6b/Team_Secretlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/c9/Team_Secret_Whaleslogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3f/Team_Secretlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/ab/Team_Secret_Whaleslogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/65/Team_Secretlogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/Team_Secret_Whaleslogo_square.png"], "CFO": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/bb/CTBC_Flying_Oysterlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/00/Flying_Oysterlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/9b/CTBC_Flying_Oysterlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/46/Flying_Oysterlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/15/CTBC_Flying_Oysterlogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/b5/Flying_Oysterlogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/CTBC_Flying_Oysterlogo_square.png"], "LOS": ["https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/bc/L%C3%98Slogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/ce/Los_Grandeslogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/c0/LOSlogo_square.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3a/L%C3%98Slogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/0e/Los_Grandeslogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a7/LOSlogo_profile.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3c/L%C3%98Slogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/4e/Los_Grandeslogo_std.png/revision/latest/scale-to-width-down/64", "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/90/LOSlogo_std.png/revision/latest/scale-to-width-down/64", "https://lol.fandom.com/wiki/Special:FilePath/LØSlogo_square.png"]};
window.TEAM_LOGOS=LS.get("team-logos-ok2",{});
window.conseilLoadLogos=function(onDone){onDone&&onDone()};
window.conseilLogoOk=function(img){const t=img.dataset.tag;if(t&&TEAM_LOGOS[t]!==img.src){TEAM_LOGOS[t]=img.src;LS.set("team-logos-ok2",TEAM_LOGOS)}};
window.conseilLogoErr=function(img){
  const t=img.dataset.tag,list=[TEAM_LOGOS[t],...(TEAM_LOGO_CANDIDATES[t]||[])].filter(Boolean),i=+img.dataset.i+1;
  if(TEAM_LOGOS[t]===img.src){delete TEAM_LOGOS[t];LS.set("team-logos-ok2",TEAM_LOGOS)}
  if(i<list.length){img.dataset.i=i;img.src=list[i]}else{img.parentNode.outerHTML=decodeURIComponent(img.dataset.fb)}
};
const DARK_LOGOS=["IG","TSW"];   // logos noirs : posés sur une pastille claire pour rester lisibles sur fond sombre
window.conseilTeamLogo=function(tag,fallbackHTML,size=30){
  const list=[TEAM_LOGOS[tag],...(TEAM_LOGO_CANDIDATES[tag]||[])].filter(Boolean);
  if(!list.length)return fallbackHTML;
  return `<span class="tlogo${DARK_LOGOS.includes(tag)?" light":""}" style="width:${size}px;height:${size}px" title="${tag}"><img src="${list[0]}" alt="${tag}" data-tag="${tag}" data-i="0" data-fb="${encodeURIComponent(fallbackHTML)}" referrerpolicy="no-referrer" onload="conseilLogoOk(this)" onerror="conseilLogoErr(this)"></span>`;
};

// ---------- Thème Plateau TV et bandeau « Direct » ----------
(function(){const add=()=>{if(document.getElementById("tv-theme"))return;
  const f=document.createElement("link");f.rel="stylesheet";f.href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@400;500;600;700&display=swap";document.head.appendChild(f);
  const l=document.createElement("link");l.id="tv-theme";l.rel="stylesheet";l.href="theme-tv.css";document.head.appendChild(l)};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",add);else add();})();
function defaultTicker(){const d=Math.ceil((Date.parse("2026-11-04T23:00:00Z")-Date.now())/864e5);
  return [...(window.CAMP_TRAITORS||[]).slice(0,3).map(TRAITOR_TXT),"Worlds 2026 : phase suisse du 23 au 31 octobre, finale le 14 novembre","Un skin LoL à gagner pour le n°1 du pick'em",d>0?`WoW Forever dans ${d} jour${d>1?"s":""} : fin de l'amitié`:"WoW Forever est sorti","Patch 26.21 résumé dans la rubrique Patch","Paris, tribunal et sage de la semaine dans Le Conseil"]}
window.conseilTicker=function(items){const el=document.getElementById("tvRun");if(!el||!items||!items.length)return;
  const html=items.map(t=>`<span>${conseilEsc(t)}</span>`).join("");el.innerHTML=html+html};

// ---------- Camps : Fidèles de la Faille (lol) contre Déserteurs d'Azeroth (wow) ----------
window.CAMPS={};window.CAMP_BY_PSEUDO={};let campsWatched=false;
const campSide=w=>w&&(w.side||(w.going?"wow":null));
(function(){try{const c=localStorage.getItem("my-camp");if(c)document.documentElement.dataset.camp=c}catch(e){}})();
function watchCamps(db,uid){
  if(campsWatched)return;campsWatched=true;
  db.collection("wow").onSnapshot(q=>{
    const docs={};q.docs.forEach(d=>docs[d.id]=d.data());
    CAMPS={};CAMP_BY_PSEUDO={};
    for(const [id,w] of Object.entries(docs)){const s=campSide(w);if(!s)continue;CAMPS[id]=s;if(w.pseudo)CAMP_BY_PSEUDO[w.pseudo.toLowerCase()]=s}
    const mine=CAMPS[uid]||"";
    if(mine)document.documentElement.dataset.camp=mine;else delete document.documentElement.dataset.camp;
    try{mine?localStorage.setItem("my-camp",mine):localStorage.removeItem("my-camp")}catch(e){}
    // traîtres des 7 derniers jours dans le bandeau
    const week=Date.now()-7*864e5;
    window.CAMP_TRAITORS=Object.values(docs).filter(w=>w.switchedAt&&Date.parse(w.switchedAt)>week&&campSide(w)).sort((a,b)=>b.switchedAt.localeCompare(a.switchedAt));
    if(!window.CUSTOM_TICKER)conseilTicker(defaultTicker());
    window.dispatchEvent(new Event("conseil-camps"));
  },e=>console.warn("camps",e));
}
const TRAITOR_TXT=w=>`Trahison ! ${w.pseudo} ${campSide(w)==="wow"?"a quitté la Faille pour Azeroth":"a abandonné Azeroth pour revenir sur la Faille"}`;
// petit badge de camp à côté d'un pseudo (par identifiant ou par pseudo)
window.conseilCampTag=function(idOrPseudo,byPseudo){
  const s=byPseudo?CAMP_BY_PSEUDO[String(idOrPseudo||"").toLowerCase()]:CAMPS[idOrPseudo];
  if(!s)return "";
  return s==="wow"?`<span class="camptag ct-wow" title="Déserteur d'Azeroth">WoW</span>`:`<span class="camptag ct-lol" title="Fidèle de la Faille">LoL</span>`;
};

// ---------- Mention légale Riot Games (obligatoire pour les sites de fans) ----------
(function(){const add=()=>{if(document.getElementById("riot-legal"))return;
  const p=document.createElement("p");p.id="riot-legal";
  p.style.cssText="max-width:1040px;margin:18px auto 0;font-size:.75rem;line-height:1.5;color:#6f7480;text-align:center";
  p.textContent="Conseil des Sages isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";
  const f=document.querySelector("footer");(f&&f.parentNode?f.parentNode:document.body).appendChild(p)};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",add);else add();})();
