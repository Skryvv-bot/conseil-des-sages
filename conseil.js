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
      auth.onAuthStateChanged(async u=>{if(u&&!done){done=true;window.CONSEIL_UID=u.uid;await loadClaims(db);watchCamps(db,u.uid);resolve({db,uid:u.uid});offerClaim(db,u.uid)}});
      auth.signInAnonymously().catch(e=>{if(!done){done=true;console.error(e);resolve({db:null,error:e})}});
    }catch(e){console.error(e);resolve({db:null,error:e})}
  });
};

// ---------- Navigation commune ----------
const CONSEIL_NAV=[
  {id:"accueil",href:"index.html",label:"Accueil"},
  {id:"ladder",href:"ladder.html",label:"Ladder"},
  {id:"worlds",href:"worlds.html",label:"Worlds 2026",sub:[{id:"worlds",href:"worlds.html",label:"Matchs & pronos"},{id:"tierlist",href:"tierlist.html",label:"Tier list"}]},
  {id:"jeux",href:"jeux.html",label:"Jeux",sub:[{id:"jeux",href:"jeux.html",label:"Tous les jeux"},{id:"devinettes",href:"devinettes.html",label:"Devinettes"},{id:"echauffement",href:"echauffement.html",label:"Échauffement"}]},
  {id:"conseil",href:"communaute.html",label:"Le Conseil"},
  {id:"customs",href:"customs.html",label:"Customs & Clash"},
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
  return [...(window.CAMP_TRAITORS||[]).slice(0,3).map(TRAITOR_TXT),"Worlds 2026 : phase suisse du 23 au 31 octobre, finale le 14 novembre","Un skin LoL à gagner pour le n°1 du pick'em",d>0?`WoW Forever dans ${d} jour${d>1?"s":""} : fin de l'amitié`:"WoW Forever est sorti","Patch 26.21 résumé dans la rubrique Patch","Pronos entre potes, tribunal et sage de la semaine dans Le Conseil","Ladder du Conseil : les rangs officiels, mis à jour toutes les 15 minutes"]}
window.conseilTicker=function(items){const el=document.getElementById("tvRun");if(!el||!items||!items.length)return;
  const html=items.map(t=>`<span>${conseilEsc(t)}</span>`).join("");el.innerHTML=html+html};

// ---------- Camps : Fidèles de la Faille (lol) contre Déserteurs d'Azeroth (wow) ----------
window.CAMPS={};window.CAMP_BY_PSEUDO={};let campsWatched=false;
const campSide=w=>w&&(w.side||(w.going?"wow":null));
(function(){try{const c=localStorage.getItem("my-camp");if(c)document.documentElement.dataset.camp=c}catch(e){}})();
function watchCamps(db,uid){
  if(campsWatched)return;campsWatched=true;
  db.collection("wow").onSnapshot(q=>{
    const docs={};q.docs.filter(d=>!conseilIsClaimed(d.id)).forEach(d=>docs[d.id]=d.data());
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

// ---------- Récupération des comptes de l'ancienne adresse (Netlify) ----------
// Chaque navigateur a une nouvelle identité sur la nouvelle adresse. Un sage peut « réclamer » son ancien pseudo :
// ses données sont recopiées sur sa nouvelle identité et l'ancienne est masquée partout (collection claims).
window.CLAIMED=new Set();window.CLAIM_BY={};
window.conseilIsClaimed=function(id){if(!CLAIMED.size)return false;if(CLAIMED.has(id))return true;const i=id.lastIndexOf("_");return i>0&&CLAIMED.has(id.slice(i+1))};
async function loadClaims(db){try{const q=await db.collection("claims").get();q.docs.forEach(d=>{CLAIMED.add(d.id);CLAIM_BY[d.data().by]=d.id})}catch(e){console.warn("claims",e)}}
const CLAIM_COLS=["picks","tiers","riot","wow","warmup"];
async function offerClaim(db,uid){
  try{
    if(CLAIM_BY[uid])return;                                   // déjà récupéré
    for(const c of CLAIM_COLS){const d=await db.doc(c+"/"+uid).get();if(d.exists)return}   // a déjà des données ici
    try{if(localStorage.getItem("claim-dismissed"))return}catch(e){}
    const people={};
    for(const c of CLAIM_COLS){const q=await db.collection(c).get();q.docs.forEach(d=>{if(d.id===uid||CLAIMED.has(d.id))return;const p=d.data().pseudo;if(p&&!people[d.id])people[d.id]=p})}
    const list=Object.entries(people).sort((a,b)=>a[1].localeCompare(b[1]));
    if(!list.length)return;
    const box=document.createElement("section");box.className="claim";box.setAttribute("aria-label","Récupérer mon ancien compte");
    box.innerHTML=`<div><b>Nouvelle adresse du site !</b><span>Tu avais déjà un compte (pronos, tier list, profil, camp) ? Choisis ton pseudo pour tout récupérer.</span></div>
      <div class="claim-row"><select aria-label="Mon ancien pseudo"><option value="">Mon ancien pseudo…</option>${list.map(([id,p])=>`<option value="${id}">${conseilEsc(p)}</option>`).join("")}</select>
      <button type="button" class="btn" data-go>Récupérer</button><button type="button" class="btn ghost" data-no>Je suis nouveau</button></div><p class="claim-msg" role="status"></p>`;
    const wrap=document.querySelector(".wrap")||document.body;wrap.prepend(box);
    const msg=box.querySelector(".claim-msg");
    box.querySelector("[data-no]").onclick=()=>{try{localStorage.setItem("claim-dismissed","1")}catch(e){}box.remove()};
    box.querySelector("[data-go]").onclick=async()=>{
      const old=box.querySelector("select").value;if(!old){msg.textContent="Choisis ton pseudo dans la liste.";return}
      msg.textContent="Récupération en cours…";
      try{
        const c0=await db.doc("claims/"+old).get();if(c0.exists){msg.textContent="Ce compte a déjà été récupéré.";return}
        for(const c of CLAIM_COLS){const d=await db.doc(c+"/"+old).get();if(d.exists)await db.doc(c+"/"+uid).set(d.data())}
        await db.doc("claims/"+old).set({by:uid,pseudo:people[old],at:new Date().toISOString()});
        msg.textContent="C'est fait ! Rechargement…";setTimeout(()=>location.reload(),900);
      }catch(e){console.warn(e);msg.textContent="Récupération impossible pour le moment, réessaie dans un instant."}};
  }catch(e){console.warn("claim",e)}
}

// ---------- Données Riot officielles (via le relais Cloudflare) ----------
window.RIOT_RELAY="https://conseil-riot.perrotinyvanpro.workers.dev";
const RIOT_TIERS=["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"];
window.TIER_FR={IRON:"Fer",BRONZE:"Bronze",SILVER:"Argent",GOLD:"Or",PLATINUM:"Platine",EMERALD:"Émeraude",DIAMOND:"Diamant",MASTER:"Maître",GRANDMASTER:"Grand Maître",CHALLENGER:"Challenger"};
window.TIER_COLOR={IRON:"#6b6f76",BRONZE:"#a0674b",SILVER:"#9aa4ae",GOLD:"#d4a640",PLATINUM:"#3fb6a8",EMERALD:"#2fbf71",DIAMOND:"#6f8cff",MASTER:"#b45cff",GRANDMASTER:"#e4002b",CHALLENGER:"#ffd54a"};
const APEX=new Set(["MASTER","GRANDMASTER","CHALLENGER"]);
// Valeur servant uniquement à trier les rangs officiels et à mesurer les LP gagnés ou perdus
window.conseilRankValue=v=>{if(!v||!v.tier)return -1;const t=RIOT_TIERS.indexOf(v.tier);if(APEX.has(v.tier))return 2800+(v.lp||0);return t*400+Math.max(0,["IV","III","II","I"].indexOf(v.rank))*100+(v.lp||0)};
window.conseilRankLabel=(v,withLp=true)=>!v||!v.tier?"Non classé":`${TIER_FR[v.tier]||v.tier}${APEX.has(v.tier)?"":" "+v.rank}${withLp?" · "+(v.lp||0)+" LP":""}`;
// Anciens emblèmes de rang Riot (style 2019-2022). Émeraude n'existait pas à l'époque : badge de couleur seul.
const RANK_EMBLEM={IRON:"0/03",BRONZE:"f/f4",SILVER:"7/70",GOLD:"9/96",PLATINUM:"7/74",DIAMOND:"9/91",MASTER:"1/11",GRANDMASTER:"7/76",CHALLENGER:"5/5f"};
window.conseilRankEmblem=(tier,size=28)=>{const h=RANK_EMBLEM[tier];if(!h||!size)return "";const n=tier[0]+tier.slice(1).toLowerCase();
  return `<img class="rke" width="${size}" height="${size}" style="width:${size}px;height:${size}px" alt="" loading="lazy" src="https://static.wikia.nocookie.net/leagueoflegends/images/${h}/Season_2019_-_${n}_1.png/revision/latest/scale-to-width-down/${Math.min(256,size*2)}" onerror="this.remove()">`};
window.conseilRankBadge=(v,size=28)=>!v||!v.tier?`<span class="rkb none">Non classé</span>`:`<span class="rkw">${conseilRankEmblem(v.tier,size)}<span class="rkb" style="--rk:${TIER_COLOR[v.tier]}">${conseilEsc(conseilRankLabel(v,false))}</span></span>`;
(function(){const st=document.createElement("style");st.textContent=`.rkb{display:inline-block;padding:2px 8px;font:700 .78rem "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#08090b;background:var(--rk,#a7abb6);white-space:nowrap}.rkb.none{background:transparent;color:#a7abb6;border:1px solid #3a3e48}.rkw{display:inline-flex;align-items:center;gap:6px;vertical-align:middle}.rke{object-fit:contain;flex:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}`;document.head.appendChild(st)})();
const isoDay=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`};
const weekStart=()=>{const d=new Date();const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d};
// Ladder partagé : un seul visiteur interroge Riot toutes les 15 minutes, les autres lisent Firebase.
window.conseilLadder=async function(db,riotProfiles,{force=false}={}){
  const players=Object.entries(riotProfiles||{}).filter(([id,p])=>p.riotId&&p.pseudo&&!conseilIsClaimed(id));
  let cur=null;try{const d=await db.doc("ladder/current").get();cur=d.exists?d.data():null}catch(e){}
  const stale=!cur||Date.now()-Date.parse(cur.updatedAt||0)>15*60e3||players.some(([id])=>!cur.players?.[id]);
  if((stale||force)&&players.length){
    try{
      const r=await fetch(RIOT_RELAY+"/ranks?players="+encodeURIComponent(players.map(([,p])=>p.riotId+"|"+(p.region||"euw1")).join(",")));
      if(r.ok){const j=await r.json();const out={};
        for(const [id,p] of players){const rk=j.ranks?.[p.riotId.toLowerCase()];out[id]={pseudo:p.pseudo,riotId:p.riotId,solo:rk?.solo||null,flex:rk?.flex||null,err:rk?null:(j.errors?.[p.riotId.toLowerCase()]||null)}}
        cur={updatedAt:new Date().toISOString(),players:out};
        await db.doc("ladder/current").set(cur);
        const today=isoDay(Date.now()),snap=await db.doc("ladderSnap/"+today).get();
        if(!snap.exists){const sp={};for(const [id,v] of Object.entries(out))sp[id]={solo:v.solo,flex:v.flex};await db.doc("ladderSnap/"+today).set({day:today,players:sp})}
      }
    }catch(e){console.warn("ladder",e)}
  }
  // point de départ de la semaine : premier relevé depuis lundi
  let base=null;
  try{const q=await db.collection("ladderSnap").where("day",">=",isoDay(weekStart())).orderBy("day").limit(1).get();base=q.docs[0]?.data()||null}catch(e){console.warn("snap",e)}
  return{current:cur,base};
};
// Évolution de la semaine pour un joueur et une file (solo/flex)
window.conseilWeekDelta=function(cur,base,id,q="solo"){
  const a=cur?.players?.[id]?.[q],b=base?.players?.[id]?.[q];
  if(!a)return null;
  if(!b)return{games:0,wins:0,lp:0,fresh:true};
  return{games:(a.w+a.l)-(b.w+b.l),wins:a.w-b.w,lp:conseilRankValue(a)-conseilRankValue(b)};
};
// Résolution automatique des pronos entre potes : on demande à Riot le résultat de la partie.
const resolving=new Set();
window.conseilResolvePronos=async function(db,bets){
  for(const [id,b] of Object.entries(bets||{})){
    if(b.status!=="open"||!b.riotId||resolving.has(id))continue;
    const closes=b.closesAt?.toMillis?b.closesAt.toMillis():+b.closesAt||0;
    if(Date.now()<closes)continue;
    resolving.add(id);
    try{
      const u=RIOT_RELAY+"/result?"+new URLSearchParams({player:b.riotId+"|"+(b.region||"euw1"),after:String(Date.parse(b.created)||Date.now()),...(b.gameId?{gameId:String(b.gameId)}:{})});
      const r=await (await fetch(u)).json();
      if(r.done)await db.doc("bets/"+id).update({status:"done",result:r.win?"win":"loss",settledBy:"riot",settledAt:new Date().toISOString(),
        match:{championName:r.championName||"",kills:r.kills||0,deaths:r.deaths||0,assists:r.assists||0,duration:r.duration||0,matchId:r.matchId||""}});
    }catch(e){console.warn("prono",e)}
    finally{setTimeout(()=>resolving.delete(id),60000)}
  }
};

// ---------- Titres de champion du monde (une étoile par titre, Worlds 2011-2025) ----------
const WORLDS_TITLES={
  players:{Faker:[2013,2015,2016,2023,2024,2025],Oner:[2023,2024,2025],Keria:[2023,2024,2025],Gumayusi:[2023,2024,2025],Zeus:[2023,2024],Doran:[2025],
    Ruler:[2017],CoreJJ:[2017],Canyon:[2020],ShowMaker:[2020],Zeka:[2022],Viper:[2021],Meiko:[2021],Tian:[2019],JackeyLove:[2018],TheShy:[2018],Rookie:[2018]},
  teams:{T1:[2013,2015,2016,2023,2024,2025],GEN:[2017],DK:[2020],IG:[2018]}
};
function conseilStars(kind,key){
  const y=(WORLDS_TITLES[kind==="team"?"teams":"players"]||{})[key];if(!y||!y.length)return "";
  const t=`${y.length} titre${y.length>1?"s":""} de champion du monde : ${y.join(", ")}`;
  return `<span class="wstars" title="${t}" aria-label="${t}">${"★".repeat(y.length)}</span>`;
}

// ---------- Popups du Conseil : il faut cliquer « Oui » pour continuer ----------
(function(){
  const FIRST_MIN=3, EVERY_MIN=7;
  if(/echauffement/.test(location.pathname))return;   // pas pendant les exercices
  // Phrases fixes : 2 sur Faker, le reste pour troller les sages et culpabiliser les Déserteurs
  const BASE_LINES=[
    "Faker est-il le plus grand joueur de tous les temps ?",
    "Faker a 6 titres de champion du monde. Toi, tu as au moins validé ta tier list ?",
    "Ton KDA ressemble à un numéro de téléphone. Tu veux en parler ?",
    "Ta dernière balise date de 2019. Tu comptes en poser une ce soir ?",
    "Tu as encore flash dans un mur aujourd'hui ?",
    "Ton CS à 10 minutes est plus bas que ton âge. On peut en parler ?",
    "Tu dis « je suis bloqué à cause de mes mates » depuis trois saisons. C'est toujours vrai ?",
    "Tu as accusé ton jungler cette semaine ?",
    "Tu vas encore lancer « juste une dernière » après trois défaites ?",
    "Tu as mute tout le monde dès l'écran de chargement ?",
    "Le 5 novembre, des sages vont abandonner leurs potes pour WoW. Toi, tu restes sur la Faille ?"
  ];
  const WOW_ME=[
    "Tu pars sur WoW et tu laisses tes potes seuls sur la Faille. Tu te sens fier ?",
    "Faker n'a jamais quitté LoL. Toi, si. Tu y réfléchis encore ?",
    "Tes potes vont devoir faire leurs flex avec un random parce que tu pars sur WoW. Tu assumes ?",
    "Azeroth ne t'a jamais offert de pentakill. Tu es sûr de ton choix ?",
    "Tu pourrais encore revenir chez les Fidèles de la Faille. Tu y penses ?"
  ];
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const TFR={IRON:"Fer",BRONZE:"Bronze",SILVER:"Argent",GOLD:"Or",PLATINUM:"Platine",EMERALD:"Émeraude",DIAMOND:"Diamant",MASTER:"Maître",GRANDMASTER:"Grand Maître",CHALLENGER:"Challenger"};
  async function dynamicLines(){
    const out=[];
    try{
      if(!window.firebase||!firebase.apps.length)return out;
      const fs=firebase.firestore(),claimed=id=>window.conseilIsClaimed&&conseilIsClaimed(id);
      const [bq,lq,wq]=await Promise.all([fs.collection("bets").where("status","==","done").get().catch(()=>null),fs.doc("ladder/current").get().catch(()=>null),fs.collection("wow").get().catch(()=>null)]);
      // résultats des parties des 3 derniers jours
      const since=Date.now()-3*864e5;
      (bq?.docs||[]).map(d=>d.data()).filter(b=>b.match&&Date.parse(b.settledAt||0)>since&&!claimed(b.target)).forEach(b=>{
        const m=b.match,p=b.targetPseudo||"Un sage",c=m.championName||"son champion",kda=`${m.kills}/${m.deaths}/${m.assists}`,min=Math.round((m.duration||0)/60),lbl=b.label||"partie";
        if(b.result==="win"){
          out.push(`${p} a gagné une ${lbl} sur ${c}. Il a sûrement été carry par ses mates. On est d'accord ?`);
          if(m.kills+m.assists<=5)out.push(`${p} a gagné en ${kda} sur ${c}. Il était là, ou il regardait ?`);
        }else{
          out.push(`${p} a perdu sa ${lbl} sur ${c} en ${kda}. C'était la faute du jungle, bien sûr ?`);
          if(m.deaths>=8)out.push(`${p} est mort ${m.deaths} fois sur ${c}. On lui retire son siège au Conseil ?`);
          if(m.deaths>m.kills+m.assists)out.push(`${p} a fini en ${kda}. Il jouait pour l'équipe d'en face ?`);
          if(min&&min<=22)out.push(`${p} a perdu en ${min} minutes. Le FF à 15 était mérité ?`);
        }
      });
      // classements
      const L=Object.entries(lq?.data()?.players||{}).filter(([id])=>!claimed(id)).map(([id,v])=>({...v,id}));
      const val=s=>window.conseilRankValue?conseilRankValue(s):0,rk=s=>`${TFR[s.tier]||s.tier}${["MASTER","GRANDMASTER","CHALLENGER"].includes(s.tier)?"":" "+s.rank}`;
      const ranked=L.filter(v=>v.solo&&v.solo.tier).sort((a,b)=>val(a.solo)-val(b.solo));
      if(ranked.length>1){
        const low=ranked[0],top=ranked[ranked.length-1];
        out.push(`${low.pseudo} est ${rk(low.solo)}, le plus bas du Conseil. On organise une collecte pour lui payer un coach ?`);
        out.push(`${top.pseudo} est ${rk(top.solo)}, le meilleur du Conseil… et T1 ne l'a toujours pas appelé. Ça veut tout dire ?`);
      }
      for(const v of ranked){const n=v.solo.w+v.solo.l,wr=n?Math.round(100*v.solo.w/n):0;
        if(n>=20&&wr<48)out.push(`${v.pseudo} tourne à ${wr} % de victoires en solo. Il le fait exprès ?`);
        if(n>=300)out.push(`${v.pseudo} a joué ${n} classées cette saison. Quelqu'un devrait aller vérifier qu'il voit encore la lumière du jour ?`);
        if(["IRON","BRONZE"].includes(v.solo.tier))out.push(`${v.pseudo} est en ${TFR[v.solo.tier]}. Même les bots de l'intro auraient peur pour lui. On l'aide ?`);}
      L.filter(v=>v.riotId&&!v.solo&&!v.err).slice(0,3).forEach(v=>out.push(`${v.pseudo} n'est même pas classé en solo. Il a peur de voir son vrai niveau ?`));
      // les Déserteurs partis sur WoW
      (wq?.docs||[]).filter(d=>!claimed(d.id)).map(d=>d.data()).filter(w=>w.pseudo&&(w.side==="wow"||(!w.side&&w.going))).forEach(w=>{
        out.push(`${w.pseudo} abandonne ses potes pour Azeroth le 5 novembre. On le pardonnera un jour ?`);
        out.push(`${w.pseudo} préfère farmer des sangliers sur WoW plutôt que de jouer avec vous. Ça te fait de la peine ?`);
      });
    }catch(e){}
    return out;
  }
  function css(){if(document.getElementById("cpop-css"))return;const st=document.createElement("style");st.id="cpop-css";st.textContent=`
.cpop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(8,9,11,.82);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:cpopf .2s ease-out}
.cpop-box{width:min(440px,100%);background:#15171c;border-top:6px solid var(--tv-red,#e4002b);padding:22px 22px 20px;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:cpopz .25s cubic-bezier(.2,1.4,.4,1)}
.cpop-tag{font:700 .78rem "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--tv-amber,#ffb400)}
.cpop-q{margin:0;font:400 1.55rem/1.15 "Anton","Impact",sans-serif;text-transform:uppercase;color:#fff}
.cpop-yes{align-self:stretch;padding:14px;border:0;background:var(--tv-red,#e4002b);color:#fff;font:700 1.15rem "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.cpop-yes:hover,.cpop-yes:focus-visible{background:#ff1744;outline:2px solid #fff;outline-offset:2px}
html[data-camp="wow"] .cpop-yes{background:#ffb400;color:#08090b}
@keyframes cpopf{from{opacity:0}}@keyframes cpopz{from{transform:scale(.85);opacity:0}}
@media (prefers-reduced-motion:reduce){.cpop,.cpop-box{animation:none}}`;document.head.appendChild(st)}
  let open=false;
  async function show(){
    if(open)return;
    if(document.hidden){document.addEventListener("visibilitychange",function v(){if(!document.hidden){document.removeEventListener("visibilitychange",v);show()}});return}
    const dyn=await dynamicLines(),meWow=document.documentElement.dataset.camp==="wow",r=Math.random();
    let q,tag="Question obligatoire du Conseil";
    if(meWow&&r<.35){q=pick(WOW_ME);tag="Message pour les Déserteurs"}
    else if(dyn.length&&r<.75){q=pick(dyn);tag="Le Conseil a vu les stats"}
    else q=pick(BASE_LINES);
    css();open=true;
    const el=document.createElement("div");el.className="cpop";el.setAttribute("role","alertdialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-labelledby","cpopQ");
    el.innerHTML=`<div class="cpop-box"><span class="cpop-tag">${tag}</span><p class="cpop-q" id="cpopQ"></p><button class="cpop-yes" type="button">Oui</button></div>`;
    el.querySelector(".cpop-q").textContent=q;
    const prevOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow="hidden";
    const btn=el.querySelector(".cpop-yes");
    el.addEventListener("keydown",e=>{if(e.key==="Escape")e.preventDefault();if(e.key==="Tab"){e.preventDefault();btn.focus()}});
    btn.onclick=()=>{el.remove();document.documentElement.style.overflow=prevOverflow;open=false;setTimeout(show,EVERY_MIN*60e3)};
    document.body.appendChild(el);btn.focus();
  }
  setTimeout(show,FIRST_MIN*60e3);
  window.conseilPopupTest=show;   // pour tester : conseilPopupTest() dans la console
})();
