// Généré depuis la page Fantasy : ne pas modifier à la main.
window.FantasyScore=(function(){
const PTS={win:3,d:-1,clean:2,solo:2,fb:2,triple:2,quadra:5,penta:10,captain:2};
const ROLE_PTS={
  Top:{k:3,a:2,cs:50,dmg:[.25,3]},
  Jungle:{k:3,a:1,cs:50,drag:.5,baron:1,kp:[.70,2]},
  Mid:{k:3,a:1,cs:50,dmg:[.28,3]},
  Bot:{k:2.5,a:1,cs:50,dmg:[.30,3]},
  Support:{k:2,a:1.5,wp:20,wk:5,kp:[.75,2]}};
const fr=x=>String(Math.round(x*10)/10).replace(".",",");
const pl=(n,one,many)=>`${n} ${n>1?many:one}`;
function detail(st,role,g){const R=ROLE_PTS[role]||ROLE_PTS.Mid,o=[],add=(l,v)=>{if(v)o.push([l,v])};
  if(st.win)add("Victoire",PTS.win);
  add(pl(st.k||0,"kill","kills"),(st.k||0)*R.k);add(pl(st.a||0,"assist","assists"),(st.a||0)*R.a);add(pl(st.d||0,"mort","morts"),(st.d||0)*PTS.d);
  if(st.d===0)add("Aucune mort",PTS.clean);
  if(st.solo)add(pl(st.solo,"solokill","solokills"),st.solo*PTS.solo);
  if(st.fb)add("Premier sang",PTS.fb);
  if(st.triple)add(pl(st.triple,"triple kill","triple kills"),st.triple*PTS.triple);
  if(st.quadra)add(pl(st.quadra,"quadra kill","quadra kills"),st.quadra*PTS.quadra);
  if(st.penta)add(pl(st.penta,"pentakill","pentakills"),st.penta*PTS.penta);
  if(R.cs&&st.cs)add(`${st.cs} CS`,Math.floor(st.cs/R.cs));
  if(R.dmg&&st.dmg>=R.dmg[0])add(`${Math.round(st.dmg*100)} % des dégâts de l'équipe`,R.dmg[1]);
  if(R.kp&&st.kp>=R.kp[0])add(`${Math.round(st.kp*100)} % de participation aux kills`,R.kp[1]);
  const ob=g?.obj?.[st.team];
  if(R.drag&&ob?.drag)add(pl(ob.drag,"dragon de l'équipe","dragons de l'équipe"),ob.drag*R.drag);
  if(R.baron&&ob?.baron)add(pl(ob.baron,"Baron de l'équipe","Barons de l'équipe"),ob.baron*R.baron);
  if(R.wp&&st.wp)add(`${st.wp} balises posées`,Math.floor(st.wp/R.wp));
  if(R.wk&&st.wk)add(`${st.wk} balises détruites`,Math.floor(st.wk/R.wk));
  return o}
function base(st,role,g){return detail(st,role,g).reduce((t,x)=>t+x[1],0)}

const ROLE_OF={"Zeus": "Top", "Bin": "Top", "Kiin": "Top", "Breathe": "Top", "BrokenBlade": "Top", "Siwoo": "Top", "369": "Top", "Canna": "Top", "Doran": "Top", "TheShy": "Top", "Myrwn": "Top", "Dhokla": "Top", "Morgan": "Top", "Pun": "Top", "Rest": "Top", "Zest": "Top", "Canyon": "Jungle", "Oner": "Jungle", "Kanavi": "Jungle", "SkewMond": "Jungle", "Xun": "Jungle", "Tarzan": "Jungle", "Wei": "Jungle", "Inspired": "Jungle", "Yike": "Jungle", "Elyoya": "Jungle", "Lucid": "Jungle", "Tian": "Jungle", "Josedeodo": "Jungle", "Hizto": "Jungle", "Shad0w": "Jungle", "Curse": "Jungle", "Faker": "Mid", "Caps": "Mid", "Chovy": "Mid", "Knight": "Mid", "Zeka": "Mid", "Kyeahoo": "Mid", "ShowMaker": "Mid", "Creme": "Mid", "Rookie": "Mid", "Shanks": "Mid", "Jojopyun": "Mid", "Quid": "Mid", "Dire": "Mid", "Pout": "Mid", "Saint": "Mid", "Feisty": "Mid", "Peyz": "Bot", "Gumayusi": "Bot", "Viper": "Bot", "Ruler": "Bot", "Hans Sama": "Bot", "Smash": "Bot", "Hope": "Bot", "JiaQi": "Bot", "Doggo": "Bot", "Caliste": "Bot", "JackeyLove": "Bot", "Berserker": "Bot", "Eddie": "Bot", "Supa": "Bot", "Yeon": "Bot", "Duduhh": "Bot", "Keria": "Support", "Duro": "Support", "ON": "Support", "Delight": "Support", "Labrov": "Support", "Kael": "Support", "Career": "Support", "Meiko": "Support", "Zhuo": "Support", "Busio": "Support", "CoreJJ": "Support", "Alvaro": "Support", "Bie": "Support", "Isles": "Support", "Kino": "Support", "Ackerman": "Support"};
const PHASE_IDS=["swiss","quarts","demis","finale"];
function teamOf(phases,id,ph){const d=phases[ph];if(!d?.picks)return null;const o={};for(const x of d.picks)if(x.uid===id)o[x.role]=x.name;return o}
function gamePts(g,name){const st=g.players?.[name];if(!st)return null;const s=base(st,ROLE_OF[name],g);return Math.round(s*10)/10}
function playerPts(games,name,ph){let t=0;for(const g of games){if(ph&&g.phase!==ph)continue;const s=gamePts(g,name);if(s!=null)t+=s}return t}
function sagePts(phases,captains,games,id){let t=0;for(const ph of PHASE_IDS){const tm=teamOf(phases,id,ph);if(!tm)continue;const cap=captains[id]?.[ph];
  for(const r in tm){const n=tm[r],p=playerPts(games,n,ph);t+=n===cap?p*PTS.captain:p}}return Math.round(t*10)/10}
// Multikills, solokills et premier sang : absents des stats officielles, recalculés depuis le direct de LoL Esports 
// (seconde par seconde) par la tâche GitHub « Fantasy : multikills » et publiés dans multi.json. 
const FX_MULTI_URL="https://raw.githubusercontent.com/Skryvv-bot/conseil-des-sages/fantasy-data/out/fx/multi.json"; 
let FX_MULTI={}; 
function fxApplyMulti(gs){for(const g of gs||[]){const m=FX_MULTI[g.id];if(!m||!g.players)continue; 
  for(const n in g.players){const st=g.players[n],x=m.players?.[n]||{};st.triple=x.triple||0;st.quadra=x.quadra||0;st.penta=x.penta||0;st.solo=x.solo||0;st.fb=m.fb===n?1:0}}return gs} 
function fxLoadMulti(cb){fetch(FX_MULTI_URL+"?t="+Math.floor(Date.now()/300000)).then(r=>r.ok?r.json():{}).then(j=>{FX_MULTI=j||{};cb&&cb()}).catch(()=>{})} 
return {PTS,ROLE_OF,teamOf,gamePts,sagePts,fr,applyMulti:fxApplyMulti,loadMulti:fxLoadMulti};
})();
