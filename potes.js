// Jeux entre potes : Poker, Undercover, Puissance 4, Loup-garou.
// Pas de serveur : l'état de chaque salon vit dans rooms/{id}. L'hôte du salon fait le maître du jeu
// (il mélange, distribue, compte les votes). Les infos cachées (cartes, mots, rôles) sont écrites
// par l'hôte dans secrets/{salon}_{joueur}, lisibles seulement par le joueur concerné.
conseilNav("potes");
const $=id=>document.getElementById(id), esc=conseilEsc;
const GAMES={
  poker:{name:"Poker",min:2,max:8,desc:"Texas Hold'em sans limite. 1 000 jetons fictifs à l'arrivée, blindes 10/20. Si tu es à sec, tu peux te recaver gratuitement : le classement compte le gain net."},
  uc:{name:"Undercover",min:3,max:12,desc:"Tout le monde reçoit le même mot, sauf l'Undercover (deux à partir de 7 joueurs) qui a un mot proche. Chacun donne un indice à son tour, puis on vote pour éliminer. Parfait en vocal sur Discord."},
  p4:{name:"Puissance 4",min:2,max:2,desc:"Aligne 4 jetons avant ton adversaire. Revanche en un clic."},
  lg:{name:"Loup-garou",min:5,max:12,desc:"Le site fait le maître du jeu : rôles, nuits et votes. Loups, Voyante, Sorcière et villageois. Discutez en vocal sur Discord pendant le jour."}
};
let db=null,uid=null,me="",game="poker",roomId=null,room=null,secret=null,mj=null,myAct=null,acts={};
let unsub=[],hostUnsub=[],lobbyUnsub=null,statsAll={},lbGame="poker";

// ---------- utilitaires ----------
function rnd(n){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
const clone=o=>JSON.parse(JSON.stringify(o));
const pseudoOf=u=>room?.players?.[u]?.pseudo||room?.gone?.[u]||"?";
const isHost=()=>room&&room.host===uid;
const now=()=>new Date().toISOString();
function toast(msg){const n=$("conn");n.textContent=msg;n.style.color="var(--tv-amber,#ffb400)";clearTimeout(toast.t);toast.t=setTimeout(()=>{n.textContent=db?"Connecté":"";n.style.color=""},4000)}

// Modifie le salon dans une transaction : fn reçoit une copie du salon et renvoie les champs à changer (ou null).
async function mutate(fn){
  if(!roomId)return false;const ref=db.doc("rooms/"+roomId);let ok=false;
  try{await db.runTransaction(async t=>{const d=await t.get(ref);if(!d.exists)return;const p=fn(clone(d.data()));if(!p)return;p.updated=now();t.update(ref,p);ok=true})}
  catch(e){console.warn(e);toast("Action refusée, réessaie.")}
  return ok;
}
const setSecret=(u,d)=>db.doc(`secrets/${roomId}_${u}`).set({room:roomId,uid:u,d});
const setMJ=d=>db.doc(`secrets/${roomId}_mj`).set({room:roomId,uid:room.host,d});
const act=a=>db.doc(`acts/${roomId}_${uid}`).set({room:roomId,uid,a,at:Date.now()});
async function addStat(g,patch){
  const key=`gstat-${roomId}-${g}-${patch.key}`;try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1")}catch(e){}
  try{await db.runTransaction(async t=>{const ref=db.doc("gstats/"+uid),d=await t.get(ref),cur=d.exists?d.data():{};const s={...(cur[g]||{})};
    for(const [k,v] of Object.entries(patch))if(k!=="key")s[k]=(s[k]||0)+v;t.set(ref,{...cur,pseudo:me,[g]:s,updated:now()})})}catch(e){console.warn(e)}
}

// ---------- pseudo ----------
function loadPseudo(){try{me=localStorage.getItem("potes-pseudo")||""}catch(e){}$("pseudo").value=me}
$("pseudo").addEventListener("change",()=>{me=$("pseudo").value.trim().slice(0,20);try{localStorage.setItem("potes-pseudo",me)}catch(e){}renderLobby()});
function needPseudo(){me=$("pseudo").value.trim().slice(0,20);if(!me){$("pseudo").focus();toast("Choisis d'abord ton pseudo.");return true}try{localStorage.setItem("potes-pseudo",me)}catch(e){}return false}

// ---------- onglets et salons ----------
$("gtabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{game=b.dataset.g;try{localStorage.setItem("potes-game",game)}catch(e){}if(roomId&&room?.game!==game){}renderTabs();watchLobby()});
function renderTabs(){$("gtabs").querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected",b.dataset.g===game));
  $("lobbyT").textContent="Salons de "+GAMES[game].name;$("lobbyDesc").textContent=GAMES[game].desc}
let lobbyRooms=[];
function watchLobby(){
  if(!db)return;if(lobbyUnsub)lobbyUnsub();
  lobbyUnsub=db.collection("rooms").where("game","==",game).onSnapshot(q=>{lobbyRooms=q.docs.map(d=>({id:d.id,...d.data()}));renderLobby()},e=>{console.warn(e);$("rooms").innerHTML=`<div class="empty">Salons indisponibles pour le moment.</div>`});
}
function renderLobby(){
  const fresh=Date.now()-3*3600e3;
  const list=lobbyRooms.filter(r=>Date.parse(r.updated||0)>fresh&&Object.keys(r.players||{}).length).sort((a,b)=>(b.updated||"").localeCompare(a.updated||""));
  $("rooms").innerHTML=list.length?list.map(r=>{const n=Object.keys(r.players).length,g=GAMES[r.game],inIt=!!r.players[uid];
    const canJoin=inIt||(n<g.max&&(r.status==="lobby"||r.game==="poker"));
    return `<div class="room"><div class="grow"><b>${esc(r.title||"Salon")}</b><div class="note">${n} / ${g.max} joueurs · ${r.status==="lobby"?"en attente":"partie en cours"} · ${Object.values(r.players).map(p=>esc(p.pseudo)).join(", ")}</div></div>
      <button class="btn ${inIt?"":"ghost"} small" data-open="${r.id}" ${canJoin?"":"disabled"}>${inIt?"Revenir":canJoin?"Rejoindre":"Complet"}</button></div>`}).join(""):`<div class="empty">Aucun salon ouvert. Crée le premier !</div>`;
  $("rooms").querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>joinRoom(b.dataset.open));
}
$("create").onclick=async()=>{
  if(!db||needPseudo())return;
  const ref=db.collection("rooms").doc();
  await ref.set({game,title:`${GAMES[game].name} de ${me}`,host:uid,hostPseudo:me,status:"lobby",players:{[uid]:{pseudo:me,at:Date.now()}},order:[],s:{},created:now(),updated:now()});
  openRoom(ref.id);
};
async function joinRoom(id){
  if(!db||needPseudo())return;
  roomId=id;
  const ok=await mutate(r=>{const g=GAMES[r.game];if(r.players[uid]){if(r.players[uid].pseudo===me)return {};r.players[uid].pseudo=me;return {players:r.players}}
    if(Object.keys(r.players).length>=g.max)return null;if(r.status!=="lobby"&&r.game!=="poker")return null;
    r.players[uid]={pseudo:me,at:Date.now()};return {players:r.players}});
  if(!ok){toast("Impossible de rejoindre ce salon (complet ou partie lancée).");roomId=null;return}
  openRoom(id);
}
function openRoom(id){
  closeRoom(true);roomId=id;try{history.replaceState(null,"","#salon="+id)}catch(e){}
  unsub.push(db.doc("rooms/"+id).onSnapshot(d=>{room=d.exists?{id:d.id,...d.data()}:null;if(!room||!room.players[uid]){if(room&&!room.players[uid]&&room.status!=="lobby"&&room.game!=="poker"){}}
    if(room&&room.game!==game){game=room.game;renderTabs();watchLobby()}hostSetup();renderGame();hostTick()},e=>console.warn(e)));
  unsub.push(db.doc(`secrets/${id}_${uid}`).onSnapshot(d=>{secret=d.exists?d.data().d:null;renderGame()},e=>console.warn("secret",e)));
  unsub.push(db.doc(`acts/${id}_${uid}`).onSnapshot(d=>{myAct=d.exists?d.data().a:null;renderGame()},e=>console.warn("act",e)));
  $("game").hidden=false;$("lobby").hidden=true;$("game").scrollIntoView({behavior:"smooth",block:"start"});
}
function closeRoom(quiet){unsub.forEach(f=>f());unsub=[];hostUnsub.forEach(f=>f());hostUnsub=[];hostFor=null;room=null;secret=null;mj=null;myAct=null;acts={};roomId=null;
  if(!quiet){$("game").hidden=true;$("lobby").hidden=false;try{history.replaceState(null,"",location.pathname)}catch(e){}}}
$("leave").onclick=async()=>{
  if(room){await mutate(r=>{if(!r.players[uid])return null;const gone={...(r.gone||{}),[uid]:r.players[uid].pseudo};delete r.players[uid];const left=Object.keys(r.players);
    const p={players:r.players,gone};
    if(r.host===uid&&left.length){p.host=left.sort((a,b)=>r.players[a].at-r.players[b].at)[0];p.hostPseudo=r.players[p.host].pseudo;if(r.status!=="lobby"){p.status="lobby";p.s={};p.note=`${me} (l'hôte) est parti : partie arrêtée.`}}
    else if(r.status!=="lobby"&&r.game!=="poker"&&(r.order||[]).includes(uid)){p.note=`${me} a quitté la partie.`;if(r.game==="p4"){p.status="lobby";p.s={}}}
    return p})}
  closeRoom(false);
};
$("copy").onclick=()=>{const url=location.origin+location.pathname+"#salon="+roomId;(navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(()=>toast("Lien copié, colle-le sur Discord !"),()=>prompt("Copie ce lien :",url))};

// ---------- côté hôte : écoute des actions secrètes et des données du maître du jeu ----------
let hostFor=null,hostBusy=false,hostAgain=false;
function hostSetup(){
  if(!room||!isHost()){if(hostFor){hostUnsub.forEach(f=>f());hostUnsub=[];hostFor=null}return}
  const key=room.id+"|"+(room.order||[]).join(",");if(hostFor===key)return;
  hostUnsub.forEach(f=>f());hostUnsub=[];hostFor=key;acts={};
  hostUnsub.push(db.doc(`secrets/${room.id}_mj`).onSnapshot(d=>{mj=d.exists?d.data().d:null;hostTick()},e=>console.warn("mj",e)));
  for(const u of room.order||[])hostUnsub.push(db.doc(`acts/${room.id}_${u}`).onSnapshot(d=>{acts[u]=d.exists?d.data().a:null;hostTick()},e=>console.warn("acts",e)));
}
async function hostTick(force){
  if(!room||!isHost()||room.status!=="play")return;
  if(hostBusy){hostAgain=true;return}hostBusy=true;
  try{const f={poker:pokerHost,uc:ucHost,lg:lgHost}[room.game];if(f)await f(force)}catch(e){console.warn("hôte",e)}
  hostBusy=false;if(hostAgain){hostAgain=false;setTimeout(()=>hostTick(),50)}
}

// ---------- rendu commun ----------
function renderGame(){
  if(!roomId)return;
  const keep={};for(const id of ["clueI","rzn","rz"]){const e=$(id);if(e&&e.value)keep[id]=e.value}const focused=document.activeElement?.id;
  renderGame0();
  for(const [id,v] of Object.entries(keep)){const e=$(id);if(e)e.value=v}if(focused&&$(focused))$(focused).focus();
}
function renderGame0(){
  if(!room){$("gTitle").textContent="Salon introuvable";$("seats").innerHTML="";$("gbody").innerHTML=`<div class="empty">Ce salon n'existe plus.</div>`;return}
  const g=GAMES[room.game];$("gTitle").textContent=room.title||g.name;
  if(!room.players[uid]){$("seats").innerHTML="";$("gbody").innerHTML=`<div class="banner">Tu n'es pas dans ce salon. <button class="btn small" id="rejoin">Rejoindre</button></div>`;$("rejoin").onclick=()=>joinRoom(room.id);return}
  const turnU=room.status==="play"?({poker:room.s?.turn,p4:room.order?.[room.s?.turn],uc:room.s?.phase==="clues"?room.s?.alive?.[room.s?.turn]:null})[room.game]:null;
  const dead=room.game==="uc"||room.game==="lg"?new Set((room.order||[]).filter(u=>room.status==="play"&&!(room.s?.alive||[]).includes(u))):new Set();
  const ids=room.status==="lobby"?Object.keys(room.players).sort((a,b)=>room.players[a].at-room.players[b].at):[...(room.order||[]),...Object.keys(room.players).filter(u=>!(room.order||[]).includes(u))];
  $("seats").innerHTML=ids.map(u=>`<span class="seat${u===uid?" me":""}${u===room.host?" host":""}${u===turnU?" turn":""}${dead.has(u)?" dead":""}">${esc(pseudoOf(u))}${room.players[u]?"":" (parti)"}</span>`).join("");
  if(room.status==="lobby")return renderWaiting(g);
  ({poker:pokerRender,uc:ucRender,p4:p4Render,lg:lgRender})[room.game]();
}
function renderWaiting(g){
  const n=Object.keys(room.players).length,ok=n>=g.min;
  $("gbody").innerHTML=`${room.note?`<div class="banner red">${esc(room.note)}</div>`:""}
    <div class="banner">${n} joueur${n>1?"s":""} sur ${g.max} · il en faut ${g.min} minimum. ${isHost()?(ok?"Tu peux lancer la partie.":"Envoie le lien sur Discord pour faire venir les sages."):`En attente de ${esc(room.hostPseudo||"l'hôte")} pour lancer.`}</div>
    <p class="note">${esc(g.desc)}</p>
    ${isHost()?`<div class="row"><button class="btn" id="start" ${ok?"":"disabled"}>Lancer la partie</button><button class="btn ghost small" id="copy2">Copier le lien d'invitation</button></div>`:""}
    <p class="note">L'hôte fait le maître du jeu : il doit garder la page ouverte pendant la partie.</p>`;
  if(isHost()){$("start").onclick=startGame;$("copy2").onclick=()=>$("copy").click()}
}
async function startGame(){({poker:pokerStart,uc:ucStart,p4:p4Start,lg:lgStart})[room.game]()}
function pickButtons(list,selected,attr,disabled){return `<div class="pick">${list.map(u=>`<button data-${attr}="${u}" aria-pressed="${u===selected}" ${disabled?"disabled":""}>${esc(pseudoOf(u))}</button>`).join("")}</div>`}

// =====================================================================
// PUISSANCE 4
// =====================================================================
function p4Start(){mutate(r=>{const ids=Object.keys(r.players);if(ids.length!==2)return null;const order=shuffle(ids);
  return {status:"play",order,note:null,s:{board:Array(42).fill(0),turn:0,winner:null,line:[],n:1,first:0}}})}
function p4Win(b,i){const p=b[i],r0=Math.floor(i/7),c0=i%7;
  for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){const line=[i];
    for(const s of [1,-1]){let r=r0+dr*s,c=c0+dc*s;while(r>=0&&r<6&&c>=0&&c<7&&b[r*7+c]===p){line.push(r*7+c);r+=dr*s;c+=dc*s}}
    if(line.length>=4)return line}return null}
function p4Play(col){mutate(r=>{const s=r.s;if(s.winner!==null||r.order[s.turn]!==uid)return null;
  let row=-1;for(let rr=5;rr>=0;rr--)if(!s.board[rr*7+col]){row=rr;break}if(row<0)return null;
  const i=row*7+col;s.board[i]=s.turn+1;const line=p4Win(s.board,i);
  if(line){s.winner=s.turn;s.line=line}else if(s.board.every(x=>x))s.winner="draw";else s.turn=1-s.turn;return {s}})}
function p4Render(){
  const s=room.s,mine=room.order.indexOf(uid),myTurn=s.winner===null&&mine===s.turn,col=i=>i===0?"#e4002b":"#ffb400";
  const who=i=>`<span class="disc" style="background:${col(i)}"></span> ${esc(pseudoOf(room.order[i]))}`;
  let msg=s.winner===null?(myTurn?"À toi de jouer !":`Au tour de ${who(s.turn)}`):s.winner==="draw"?"Match nul, grille pleine.":(s.winner===mine?"Victoire ! Bien joué.":`${who(s.winner)} gagne la partie.`);
  $("gbody").innerHTML=`<div class="banner${myTurn?"":" red"}">${msg}</div>
    <div class="p4" role="grid" aria-label="Grille de Puissance 4">${s.board.map((v,i)=>`<button data-col="${i%7}" class="${v?"c"+v:""}${s.line.includes(i)?" win":""}" aria-label="Colonne ${i%7+1}" ${myTurn?"":"disabled"}></button>`).join("")}</div>
    <p class="note" style="text-align:center">${who(0)} contre ${who(1)} · manche ${s.n}</p>
    ${s.winner!==null?`<div class="row" style="justify-content:center"><button class="btn" id="again">Revanche</button></div>`:""}`;
  $("gbody").querySelectorAll("[data-col]").forEach(b=>b.onclick=()=>p4Play(+b.dataset.col));
  if(s.winner!==null){$("again").onclick=()=>mutate(r=>{if(r.s.winner===null)return null;const order=[r.order[1],r.order[0]];return {order,s:{board:Array(42).fill(0),turn:0,winner:null,line:[],n:r.s.n+1,first:0}}});
    if(mine>=0)addStat("p4",{key:"m"+s.n+"-"+room.order.join(""),...(s.winner==="draw"?{d:1}:s.winner===mine?{w:1}:{l:1})})}
}

// =====================================================================
// UNDERCOVER
// =====================================================================
const UC_WORDS=[["Pizza","Burger"],["Chat","Chien"],["Plage","Piscine"],["Café","Thé"],["Netflix","YouTube"],["Faker","Chovy"],["Baron Nashor","Dragon ancestral"],["Yasuo","Yone"],["Teemo","Rammus"],["Ahri","Evelynn"],["Ward","Balise de contrôle"],["Flash","Téléportation"],["Nexus","Inhibiteur"],["Jungle","Forêt"],["Discord","WhatsApp"],["PlayStation","Xbox"],["Raclette","Fondue"],["Croissant","Pain au chocolat"],["Paris","Marseille"],["Football","Rugby"],["Guitare","Piano"],["Avion","Hélicoptère"],["Vampire","Zombie"],["Harry Potter","Le Seigneur des anneaux"],["Mario","Sonic"],["Pokémon","Digimon"],["Coca","Pepsi"],["Sushi","Maki"],["Ski","Snowboard"],["Lune","Soleil"],["Pirate","Viking"],["Policier","Pompier"],["Tacos","Kebab"],["Fortnite","Minecraft"],["WoW","LoL"],["Azeroth","Runeterra"],["Orc","Troll"],["Elfe","Nain"],["Batman","Spider-Man"],["Instagram","TikTok"],["Bière","Vin"],["Chocolat","Caramel"],["Montagne","Volcan"],["Tennis","Badminton"]];
function ucStart(){
  const ids=shuffle(Object.keys(room.players));if(ids.length<3)return;
  const pair=shuffle(UC_WORDS[rnd(UC_WORDS.length)]),nU=ids.length>=7?2:1,under=new Set(shuffle(ids).slice(0,nU));
  const roles={};ids.forEach(u=>roles[u]=under.has(u)?"under":"civil");
  roomIdGuard(async()=>{await setMJ({roles,words:{civil:pair[0],under:pair[1]}});
    await Promise.all(ids.map(u=>setSecret(u,{word:roles[u]==="under"?pair[1]:pair[0],game:Date.now()})));
    await mutate(r=>({status:"play",order:ids,note:null,s:{phase:"clues",round:1,alive:ids,turn:0,clues:{},last:null,votes:{},elim:[],winner:null,reveal:null,nU,g:(r.s?.g||0)+1}}))});
}
function roomIdGuard(fn){const id=roomId;fn().catch(e=>{console.warn(e);if(id===roomId)toast("Erreur au lancement, réessaie.")})}
function ucClue(text){text=String(text||"").trim().slice(0,30);if(!text)return;
  mutate(r=>{const s=r.s;if(s.phase!=="clues"||s.alive[s.turn]!==uid)return null;s.clues[uid]=text;s.turn++;if(s.turn>=s.alive.length){s.phase="vote";s.votes={}}return {s}})}
function ucVote(t){mutate(r=>{const s=r.s;if(s.phase!=="vote"||!s.alive.includes(uid)||!s.alive.includes(t)||t===uid)return null;s.votes[uid]=t;return {s}})}
async function ucHost(force){
  const s=room.s;if(!mj||s.phase!=="vote")return;
  const voters=s.alive.filter(u=>s.votes[u]);if(!(voters.length===s.alive.length||(force&&voters.length)))return;
  await mutate(r=>{const s=r.s;if(s.phase!=="vote")return null;
    const tally={};for(const u of s.alive)if(s.votes[u])tally[s.votes[u]]=(tally[s.votes[u]]||0)+1;
    const max=Math.max(0,...Object.values(tally)),top=Object.keys(tally).filter(u=>tally[u]===max);
    s.last={round:s.round,clues:s.clues,votes:s.votes};
    if(top.length!==1){s.elim.push({uid:null,round:s.round,text:"Égalité : personne n'est éliminé."})}
    else{const u=top[0],role=mj.roles[u];s.alive=s.alive.filter(x=>x!==u);s.elim.push({uid:u,pseudo:r.players[u]?.pseudo||"?",role,round:s.round,votes:max})}
    const aU=s.alive.filter(u=>mj.roles[u]==="under").length,aC=s.alive.length-aU;
    if(aU===0)s.winner="civil";else if(aU>=aC)s.winner="under";
    if(s.winner){s.phase="end";s.reveal={};for(const u of r.order)s.reveal[u]={role:mj.roles[u],word:mj.words[mj.roles[u]]}}
    else{s.phase="clues";s.round++;s.turn=rnd(s.alive.length)%s.alive.length;s.alive=[...s.alive.slice(s.turn),...s.alive.slice(0,s.turn)];s.turn=0;s.clues={};s.votes={}}
    return {s}});
}
function ucRender(){
  const s=room.s,alive=s.alive.includes(uid),inGame=room.order.includes(uid);
  let h="";
  if(inGame)h+=`<div class="role"><span class="eyebrow">Ton mot secret</span><p class="big">${secret?.word?esc(secret.word):"…"}</p><span class="note">Tu ne sais pas si tu es civil ou Undercover : écoute bien les indices des autres.</span></div>`;
  else h+=`<div class="banner">Tu regardes la partie. Tu joueras à la prochaine.</div>`;
  const lastE=s.elim[s.elim.length-1];
  if(lastE&&s.phase!=="end")h+=`<div class="banner red">${lastE.uid?`${esc(lastE.pseudo)} est éliminé avec ${lastE.votes} vote${lastE.votes>1?"s":""} : c'était ${lastE.role==="under"?"un Undercover !":"un civil."}`:esc(lastE.text)}</div>`;
  if(s.phase==="clues"){
    const cur=s.alive[s.turn],my=cur===uid;
    h+=`<div class="banner">${my?"À toi : donne un indice (un mot ou une courte phrase) sans dire ton mot.":`Ronde ${s.round} · ${esc(pseudoOf(cur))} cherche son indice…`}</div>`;
    if(isHost()&&!my)h+=`<button class="btn ghost small" id="skipC">Passer le tour de ${esc(pseudoOf(cur))} (absent)</button>`;
    if(my)h+=`<form class="row" id="clueF"><input id="clueI" maxlength="30" placeholder="Ton indice" autocomplete="off" style="flex:1;min-width:160px;padding:10px"><button class="btn">Valider</button></form>`;
  }
  if(s.phase==="vote"){
    const done=s.alive.filter(u=>s.votes[u]).length;
    h+=`<div class="banner">Vote ! Qui est l'Undercover ? (${done}/${s.alive.length} ont voté)</div>`;
    if(alive)h+=pickButtons(s.alive.filter(u=>u!==uid),s.votes[uid],"vote",false);
    if(isHost())h+=`<button class="btn ghost small" id="forceV">Clore le vote maintenant</button>`;
  }
  if(s.phase!=="end"){const cl=s.phase==="vote"?s.clues:s.clues;
    h+=`<div><span class="eyebrow">Indices de la ronde ${s.round}</span><div class="clues" style="margin-top:6px">${s.alive.map(u=>`<div class="clue"><b>${esc(pseudoOf(u))}</b><span>${cl[u]?esc(cl[u]):"…"}</span></div>`).join("")}</div></div>`;
    if(s.last)h+=`<details><summary class="note">Indices de la ronde ${s.last.round}</summary><div class="clues" style="margin-top:6px">${Object.entries(s.last.clues).map(([u,c])=>`<div class="clue"><b>${esc(pseudoOf(u))}</b><span>${esc(c)}</span></div>`).join("")}</div></details>`;}
  if(s.phase==="end"){
    const myRole=s.reveal?.[uid]?.role,won=myRole&&myRole===s.winner;
    h+=`<div class="banner${won?"":" red"}">${s.winner==="civil"?"Les civils ont démasqué l'Undercover !":"L'Undercover a gagné !"} ${inGame?(won?"Tu as gagné.":"Tu as perdu."):""}</div>
      <div class="clues">${room.order.map(u=>`<div class="clue"><b>${esc(pseudoOf(u))} · ${s.reveal[u].role==="under"?"Undercover":"civil"}</b><span>${esc(s.reveal[u].word)}</span></div>`).join("")}</div>
      ${isHost()?`<button class="btn" id="again">Nouvelle partie</button>`:`<p class="note">L'hôte peut relancer une partie.</p>`}`;
    if(inGame&&myRole)addStat("uc",{key:"g"+s.g,g:1,...(won?{w:1}:{})});
  }
  h+=s.elim.length?`<div class="log">${s.elim.map(e=>`<div>Ronde ${e.round} · ${e.uid?`${esc(e.pseudo)} éliminé (${e.role==="under"?"Undercover":"civil"})`:esc(e.text)}</div>`).join("")}</div>`:"";
  $("gbody").innerHTML=h;
  const f=$("clueF");if(f){f.onsubmit=e=>{e.preventDefault();ucClue($("clueI").value)};if(!document.activeElement||document.activeElement===document.body)$("clueI").focus()}
  $("gbody").querySelectorAll("[data-vote]").forEach(b=>b.onclick=()=>ucVote(b.dataset.vote));
  if($("forceV"))$("forceV").onclick=()=>hostTick(true);
  if($("skipC"))$("skipC").onclick=()=>mutate(r=>{const s=r.s;if(s.phase!=="clues"||r.host!==uid)return null;const cur=s.alive[s.turn];s.clues[cur]="(absent)";s.turn++;if(s.turn>=s.alive.length){s.phase="vote";s.votes={}}return {s}});
  if($("again"))$("again").onclick=ucStart;
}

// =====================================================================
// LOUP-GAROU
// =====================================================================
const LG_ROLES={loup:{n:"Loup-garou",d:"Chaque nuit, avec les autres loups, choisis une victime. Le jour, fais-toi passer pour un villageois."},
  voyante:{n:"Voyante",d:"Chaque nuit, découvre le vrai rôle d'un joueur."},
  sorciere:{n:"Sorcière",d:"Une potion de vie pour sauver la victime des loups, une potion de mort pour tuer quelqu'un. Une seule fois chacune."},
  villageois:{n:"Villageois",d:"Pas de pouvoir, mais ton vote compte : trouve les loups pendant le jour."}};
function lgStart(){
  const ids=shuffle(Object.keys(room.players)),n=ids.length;if(n<5)return;
  const W=n<=6?1:n<=9?2:3,deck=[...Array(W).fill("loup"),"voyante",...(n>=6?["sorciere"]:[])];while(deck.length<n)deck.push("villageois");
  const roles={},sh=shuffle(deck);ids.forEach((u,i)=>roles[u]=sh[i]);const wolves=ids.filter(u=>roles[u]==="loup");
  roomIdGuard(async()=>{await setMJ({roles,seen:{},done:{}});
    await Promise.all(ids.map(u=>setSecret(u,{role:roles[u],mates:roles[u]==="loup"?wolves:[],g:Date.now()})));
    await mutate(r=>({status:"play",order:ids,note:null,s:{phase:"night",night:1,alive:ids,votes:{},log:[],deaths:[],winner:null,reveal:null,potions:{life:true,death:true},g:(r.s?.g||0)+1}}))});
}
const lgWin=(alive,roles)=>{const w=alive.filter(u=>roles[u]==="loup").length;return w===0?"village":w>=alive.length-w?"loups":null};
async function lgHost(force){
  const s=room.s;if(!mj)return;const roles=mj.roles,night=s.night,mjBefore=JSON.stringify(mj);
  if(s.phase==="night"){
    const wolves=s.alive.filter(u=>roles[u]==="loup"),wv={};
    for(const u of wolves){const a=acts[u];if(a&&a.kind==="wolf"&&a.night===night&&s.alive.includes(a.target)&&roles[a.target]!=="loup")wv[u]=a.target}
    // les loups voient les votes des autres loups
    const key=JSON.stringify(wv);if(mj.lastWolf!==key+night){mj.lastWolf=key+night;await Promise.all(wolves.map(u=>setSecret(u,{role:"loup",mates:room.order.filter(x=>roles[x]==="loup"),wolfVotes:wv,night,g:0})))}
    let victim=null,wolvesDone=wolves.every(u=>wv[u]);
    if(wolvesDone||(force&&Object.keys(wv).length)){const t={};Object.values(wv).forEach(x=>t[x]=(t[x]||0)+1);const m=Math.max(...Object.values(t));const top=Object.keys(t).filter(x=>t[x]===m);victim=top[rnd(top.length)];wolvesDone=true}
    if(force&&!wolvesDone)wolvesDone=true;
    mj.done=mj.done||{};const nd=mj.done[night]||(mj.done[night]={});
    if(wolvesDone&&nd.victim===undefined)nd.victim=victim;
    if(nd.victim!==undefined)victim=nd.victim;
    // voyante
    const seer=s.alive.find(u=>roles[u]==="voyante");let seerDone=!seer;
    if(seer){const a=acts[seer];if(a&&a.kind==="seer"&&a.night===night){if(!nd.seer){nd.seer=a.target;mj.seen={...(mj.seen||{}),[a.target]:roles[a.target]};await setSecret(seer,{role:"voyante",seen:mj.seen,night,g:0})}seerDone=true}else if(force)seerDone=true}
    // sorcière : informée quand la victime est connue
    const witch=s.alive.find(u=>roles[u]==="sorciere");let witchDone=!witch||(!s.potions.life&&!s.potions.death);
    if(witch&&!witchDone&&wolvesDone){if(nd.witchTold!==true){nd.witchTold=true;await setSecret(witch,{role:"sorciere",night,victim,g:0})}
      const a=acts[witch];if(a&&a.kind==="witch"&&a.night===night){witchDone=true;nd.witch={save:!!a.save,kill:a.kill||null}}else if(force)witchDone=true}
    if(JSON.stringify(mj)!==mjBefore)await setMJ(mj);
    if(!(wolvesDone&&seerDone&&witchDone))return;
    await mutate(r=>{const s=r.s;if(s.phase!=="night"||s.night!==night)return null;
      const dead=new Set();const w=nd.witch||{};
      if(victim&&!(w.save&&s.potions.life))dead.add(victim);
      if(w.save&&victim&&s.potions.life)s.potions.life=false;
      if(w.kill&&s.potions.death&&s.alive.includes(w.kill)){dead.add(w.kill);s.potions.death=false}
      s.deaths=[...dead].map(u=>({uid:u,pseudo:r.players[u]?.pseudo||"?",role:roles[u]}));
      s.alive=s.alive.filter(u=>!dead.has(u));
      s.log.push(dead.size?`Nuit ${night} : ${s.deaths.map(d=>`${d.pseudo} (${LG_ROLES[d.role].n})`).join(" et ")} ${dead.size>1?"sont morts":"est mort"}.`:`Nuit ${night} : personne n'est mort.`);
      s.winner=lgWin(s.alive,roles);if(s.winner){s.phase="end";s.reveal=roles}else{s.phase="day";s.votes={}}
      return {s}});
  }
  if(s.phase==="day"){
    const voters=s.alive.filter(u=>s.votes[u]);if(!(voters.length===s.alive.length||(force&&voters.length)))return;
    await mutate(r=>{const s=r.s;if(s.phase!=="day"||s.night!==night)return null;
      const t={};for(const u of s.alive)if(s.votes[u])t[s.votes[u]]=(t[s.votes[u]]||0)+1;
      const m=Math.max(0,...Object.values(t)),top=Object.keys(t).filter(x=>t[x]===m);
      if(top.length===1){const u=top[0];s.alive=s.alive.filter(x=>x!==u);s.lynch={uid:u,pseudo:r.players[u]?.pseudo||"?",role:roles[u],votes:m};s.log.push(`Jour ${night} : le village élimine ${s.lynch.pseudo} (${LG_ROLES[roles[u]].n}).`)}
      else{s.lynch=null;s.log.push(`Jour ${night} : égalité, personne n'est éliminé.`)}
      s.winner=lgWin(s.alive,roles);if(s.winner){s.phase="end";s.reveal=roles}else{s.phase="night";s.night++;s.deaths=[];s.votes={}}
      return {s}});
  }
}
function lgRender(){
  const s=room.s,role=secret?.role,alive=s.alive.includes(uid),inGame=room.order.includes(uid),R=LG_ROLES[role]||null;
  let h="";
  if(inGame&&R)h+=`<div class="role${role==="loup"?" wolf":""}"><span class="eyebrow">Ton rôle${alive?"":" · tu es mort"}</span><p class="big">${R.n}</p><span class="note">${R.d}</span>${role==="loup"&&secret.mates?.length>1?`<span class="note">Les autres loups : ${secret.mates.filter(u=>u!==uid).map(u=>esc(pseudoOf(u))).join(", ")}</span>`:""}</div>`;
  else if(!inGame)h+=`<div class="banner">Tu regardes la partie. Tu joueras à la prochaine.</div>`;
  if(s.phase==="night"){
    h+=`<div class="night"><span class="eyebrow">Nuit ${s.night}</span><p class="big" style="font-size:1.5rem">Le village s'endort… 🌙</p>`;
    const mine=myAct&&myAct.night===s.night?myAct:null;
    if(alive&&role==="loup"){const targets=s.alive.filter(u=>!(secret.mates||[]).includes(u));
      const wv=secret.night===s.night?secret.wolfVotes||{}:{};
      h+=`<span>Choisissez votre victime (il faut que tous les loups votent) :</span>${pickButtons(targets,mine?.target,"lgt",false)}
        ${Object.keys(wv).length?`<span class="note">Votes des loups : ${Object.entries(wv).map(([w,t])=>`${esc(pseudoOf(w))} → ${esc(pseudoOf(t))}`).join(" · ")}</span>`:""}`}
    else if(alive&&role==="voyante"){const seen=secret.seen||{};
      h+=mine?`<span>Tu as sondé ${esc(pseudoOf(mine.target))} : ${seen[mine.target]?`<b>${LG_ROLES[seen[mine.target]].n}</b>`:"réponse en cours…"}</span>`:`<span>Qui veux-tu sonder cette nuit ?</span>${pickButtons(s.alive.filter(u=>u!==uid&&!seen[u]),null,"lgs",false)}`;
      const k=Object.entries(seen);if(k.length)h+=`<span class="note">Déjà vus : ${k.map(([u,r])=>`${esc(pseudoOf(u))} = ${LG_ROLES[r].n}`).join(" · ")}</span>`}
    else if(alive&&role==="sorciere"&&(s.potions.life||s.potions.death)){
      if(mine)h+=`<span>Ta décision est prise. Attends le lever du jour.</span>`;
      else if(secret.night===s.night&&"victim" in secret){const v=secret.victim;
        h+=`<span>${v?`Les loups ont attaqué <b>${esc(pseudoOf(v))}</b>.`:"Les loups n'ont tué personne."}</span>
          <div class="row">${v&&s.potions.life?`<button class="btn green small" id="wSave">Le sauver (potion de vie)</button>`:""}<button class="btn ghost small" id="wNone">Ne rien faire</button></div>
          ${s.potions.death?`<span class="note">Ou utiliser la potion de mort sur :</span>${pickButtons(s.alive.filter(u=>u!==uid),null,"lgw",false)}`:""}`}
      else h+=`<span>Les loups choisissent leur victime…</span>`}
    else h+=`<span class="muted">Ferme les yeux. Les rôles spéciaux agissent…</span>`;
    if(isHost())h+=`<button class="btn ghost small" id="forceN" style="align-self:flex-start">Forcer la fin de la nuit (joueur absent)</button>`;
    h+=`</div>`;
  }
  if(s.phase==="day"){
    h+=`<div class="banner">☀ Jour ${s.night} · ${s.deaths.length?s.deaths.map(d=>`${esc(d.pseudo)} est mort cette nuit (${LG_ROLES[d.role].n})`).join(" · "):"Personne n'est mort cette nuit"}.</div>
      <p>Discutez sur Discord, puis votez pour éliminer un suspect. (${s.alive.filter(u=>s.votes[u]).length}/${s.alive.length} votes)</p>`;
    if(alive)h+=pickButtons(s.alive.filter(u=>u!==uid),s.votes[uid],"lgv",false);
    const t={};for(const u of s.alive)if(s.votes[u])t[s.votes[u]]=(t[s.votes[u]]||[]).concat(pseudoOf(u));
    if(Object.keys(t).length)h+=`<div class="log">${Object.entries(t).map(([u,v])=>`<div><b>${esc(pseudoOf(u))}</b> : ${v.length} vote${v.length>1?"s":""} (${v.map(esc).join(", ")})</div>`).join("")}</div>`;
    if(isHost())h+=`<button class="btn ghost small" id="forceD" style="align-self:flex-start">Clore le vote maintenant</button>`;
  }
  if(s.phase==="end"){
    const myTeam=role==="loup"?"loups":"village",won=inGame&&s.winner===myTeam;
    h+=`<div class="banner${won?"":" red"}">${s.winner==="loups"?"Les loups-garous ont dévoré le village !":"Le village a éliminé tous les loups !"} ${inGame?(won?"Tu as gagné.":"Tu as perdu."):""}</div>
      <div class="clues">${room.order.map(u=>`<div class="clue"><b>${esc(pseudoOf(u))}${s.alive.includes(u)?"":" · mort"}</b><span>${LG_ROLES[s.reveal[u]].n}</span></div>`).join("")}</div>
      ${isHost()?`<button class="btn" id="again">Nouvelle partie</button>`:`<p class="note">L'hôte peut relancer une partie.</p>`}`;
    if(inGame&&role)addStat("lg",{key:"g"+s.g,g:1,...(won?{w:1}:{})});
  }
  if(s.log.length)h+=`<div class="log">${s.log.map(l=>`<div>${esc(l)}</div>`).join("")}</div>`;
  $("gbody").innerHTML=h;
  const on=(sel,fn)=>$("gbody").querySelectorAll(sel).forEach(b=>b.onclick=()=>fn(b));
  on("[data-lgt]",b=>act({kind:"wolf",night:s.night,target:b.dataset.lgt}));
  on("[data-lgs]",b=>act({kind:"seer",night:s.night,target:b.dataset.lgs}));
  on("[data-lgw]",b=>act({kind:"witch",night:s.night,save:false,kill:b.dataset.lgw}));
  on("[data-lgv]",b=>mutate(r=>{const s=r.s;if(s.phase!=="day"||!s.alive.includes(uid)||!s.alive.includes(b.dataset.lgv))return null;s.votes[uid]=b.dataset.lgv;return {s}}));
  if($("wSave"))$("wSave").onclick=()=>act({kind:"witch",night:s.night,save:true,kill:null});
  if($("wNone"))$("wNone").onclick=()=>act({kind:"witch",night:s.night,save:false,kill:null});
  if($("forceN"))$("forceN").onclick=()=>hostTick(true);
  if($("forceD"))$("forceD").onclick=()=>hostTick(true);
  if($("again"))$("again").onclick=lgStart;
}

// =====================================================================
// POKER (Texas Hold'em sans limite)
// =====================================================================
const START=1000,SB=10,BB=20,RANKS="23456789TJQKA",SUITS={s:"♠",h:"♥",d:"♦",c:"♣"};
const HAND_FR=["Carte haute","Paire","Double paire","Brelan","Quinte","Couleur","Full","Carré","Quinte flush"];
function cardHTML(c,sm){if(!c)return `<span class="pcard back${sm?" sm":""}"></span>`;const r=c[0]==="T"?"10":c[0],s=c[1];return `<span class="pcard${s==="h"||s==="d"?" r":""}${sm?" sm":""}">${r}<i>${SUITS[s]}</i></span>`}
function eval5(cs){
  const v=cs.map(c=>RANKS.indexOf(c[0])).sort((a,b)=>b-a),fl=cs.every(c=>c[1]===cs[0][1]);
  const u=[...new Set(v)];let st=-1;if(u.length===5){if(v[0]-v[4]===4)st=v[0];else if(v.join()==="12,3,2,1,0")st=3}
  const cnt={};v.forEach(x=>cnt[x]=(cnt[x]||0)+1);const g=Object.entries(cnt).map(([r,n])=>[n,+r]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
  if(st>=0&&fl)return [8,st];if(g[0][0]===4)return [7,g[0][1],g[1][1]];if(g[0][0]===3&&g[1][0]===2)return [6,g[0][1],g[1][1]];
  if(fl)return [5,...v];if(st>=0)return [4,st];if(g[0][0]===3)return [3,...g.map(x=>x[1])];if(g[0][0]===2&&g[1][0]===2)return [2,...g.map(x=>x[1])];
  if(g[0][0]===2)return [1,...g.map(x=>x[1])];return [0,...v];
}
const cmp=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??-1)-(b[i]??-1);if(d)return d}return 0};
function best7(cs){let best=null;for(let a=0;a<cs.length;a++)for(let b=a+1;b<cs.length;b++){const five=cs.filter((_,i)=>i!==a&&i!==b);const sc=eval5(five);if(!best||cmp(sc,best)>0)best=sc}return best}
window.pokerEval={eval5,best7,cmp};
function nextIn(list,u,ok){const i=list.indexOf(u);for(let k=1;k<=list.length;k++){const x=list[(i+k)%list.length];if(ok(x))return x}return null}
function pokerStart(){mutate(r=>{const ids=Object.keys(r.players).sort((a,b)=>r.players[a].at-r.players[b].at);if(ids.length<2)return null;
  const stacks={},buy={};ids.forEach(u=>{stacks[u]=START;buy[u]=1});
  return {status:"play",order:ids,note:null,s:{hand:0,street:"end",stacks,buy,dealer:null,results:null,reveal:null,board:[],bets:{},pot:0}}})}
let dealing=false;
async function pokerDeal(){
  if(!room||!isHost()||dealing)return;const s0=room.s;if(s0.street!=="end")return;dealing=true;
  try{
    // nouveaux arrivants : ils s'assoient avec 1 000 jetons
    const seats=Object.keys(room.players).sort((a,b)=>room.players[a].at-room.players[b].at);
    const stacks={...s0.stacks},buy={...s0.buy};seats.forEach(u=>{if(stacks[u]==null){stacks[u]=START;buy[u]=1}});
    const active=seats.filter(u=>stacks[u]>0);if(active.length<2){await mutate(r=>({order:seats,s:{...r.s,stacks,buy,results:[{text:"Il faut au moins 2 joueurs avec des jetons. Recave-toi pour continuer !"}]}}));return}
    const hand=s0.hand+1,deck=shuffle(Object.keys(SUITS).flatMap(su=>[...RANKS].map(r=>r+su))),holes={};active.forEach((u,i)=>holes[u]=[deck[i],deck[i+active.length]]);
    await setMJ({hand,deck,holes,n:active.length});
    await Promise.all(active.map(u=>setSecret(u,{hand,cards:holes[u]})));
    await mutate(r=>{const s=r.s;if(s.hand!==hand-1||s.street!=="end")return null;
      const dealer=nextIn(active,s.dealer&&active.includes(s.dealer)?s.dealer:active[active.length-1],()=>true);
      const sb=active.length===2?dealer:nextIn(active,dealer,()=>true),bb=nextIn(active,sb,()=>true);
      const n={hand,street:"preflop",stacks,buy,dealer,seats:active,folded:{},allin:{},bets:{},contrib:{},pot:0,board:[],acted:{},minRaise:BB,results:null,reveal:null,need:null,start:{...stacks},last:"Nouvelle main"};
      const post=(u,a)=>{a=Math.min(a,n.stacks[u]);n.stacks[u]-=a;n.bets[u]=(n.bets[u]||0)+a;n.contrib[u]=(n.contrib[u]||0)+a;if(!n.stacks[u])n.allin[u]=true};
      post(sb,SB);post(bb,BB);n.sb=sb;n.bb=bb;
      n.turn=nextIn(active,bb,u=>!n.allin[u]);
      if(!n.turn||active.filter(u=>!n.allin[u]).length<=1&&(n.bets[n.turn]||0)>=Math.max(...Object.values(n.bets))){n.turn=null;n.need="runout"}
      return {order:seats,s:n}});
  }finally{dealing=false}
}
function pokerAct(kind,amount,who){const me0=uid,actor=who||uid;mutate(r=>{
  const uid=actor;if(uid!==me0&&(r.host!==me0||kind!=="fold"))return null;
  const s=r.s;if(s.turn!==uid||!["preflop","flop","turn","river"].includes(s.street))return null;
  const live=()=>s.seats.filter(u=>!s.folded[u]),max=Math.max(0,...Object.values(s.bets)),b=s.bets[uid]||0,stack=s.stacks[uid],nm=r.players[uid]?.pseudo||"?";
  const put=a=>{a=Math.min(a,s.stacks[uid]);s.stacks[uid]-=a;s.bets[uid]=b+a;s.contrib[uid]=(s.contrib[uid]||0)+a;if(!s.stacks[uid])s.allin[uid]=true};
  if(kind==="fold"){s.folded[uid]=true;s.last=`${nm} se couche${uid!==me0?" (absent)":""}`}
  else if(kind==="check"){if(b!==max)return null;s.last=`${nm} parle`}
  else if(kind==="call"){if(max<=b)return null;put(max-b);s.last=`${nm} suit${s.allin[uid]?" (tapis)":""}`}
  else if(kind==="raise"||kind==="allin"){
    const to=kind==="allin"?b+stack:Math.floor(amount);if(to>b+stack)return null;
    if(kind==="raise"&&to<max+s.minRaise&&to<b+stack)return null;if(to<=max&&kind==="raise")return null;
    if(to-max>=s.minRaise){s.minRaise=to-max;s.acted={}}else if(to>max){s.acted={}}
    put(to-b);s.last=s.allin[uid]?`${nm} fait tapis (${to})`:`${nm} ${max?"relance à":"mise"} ${to}`}
  else return null;
  s.acted[uid]=true;
  const L=live();
  if(L.length===1){const w=L[0],tot=s.pot+Object.values(s.bets).reduce((a,c)=>a+c,0);s.stacks[w]+=tot;s.pot=0;s.bets={};s.street="end";s.turn=null;
    s.results=[{uid:w,amount:tot,text:`${r.players[w]?.pseudo||"?"} remporte ${tot} (les autres se sont couchés)`}];s.delta={};s.seats.forEach(u=>s.delta[u]=s.stacks[u]-(s.start[u]||0));return {s}}
  const mx=Math.max(0,...Object.values(s.bets)),can=L.filter(u=>!s.allin[u]);
  const done=can.every(u=>s.acted[u]&&(s.bets[u]||0)===mx);
  if(!done){s.turn=nextIn(s.seats,uid,u=>!s.folded[u]&&!s.allin[u]&&(!s.acted[u]||(s.bets[u]||0)<mx));if(s.turn)return {s}}
  s.pot+=Object.values(s.bets).reduce((a,c)=>a+c,0);s.bets={};s.acted={};s.minRaise=BB;s.turn=null;
  s.need=can.length<=1?"runout":{preflop:"flop",flop:"turn",turn:"river",river:"showdown"}[s.street];
  return {s}})}
async function pokerHost(){
  const s=room.s;if(s.street==="end"&&!s.hand){pokerDeal();return}
  if(!mj||mj.hand!==s.hand)return;
  if(s.need){const need=s.need,n=mj.n;
    await mutate(r=>{const s=r.s;if(s.need!==need||s.hand!==mj.hand)return null;
      const base=2*n,full=mj.deck.slice(base,base+5);
      if(need==="flop")s.board=full.slice(0,3);else if(need==="turn")s.board=full.slice(0,4);else if(need==="river")s.board=full.slice(0,5);else s.board=full;
      s.need=null;
      if(need==="flop"||need==="turn"||need==="river"){s.street=need;const live=s.seats.filter(u=>!s.folded[u]&&!s.allin[u]);s.turn=nextIn(s.seats,s.dealer,u=>live.includes(u));s.last=`${{flop:"Flop",turn:"Turn",river:"River"}[need]}`;return {s}}
      // abattage
      const live=s.seats.filter(u=>!s.folded[u]),score={};live.forEach(u=>score[u]=best7([...mj.holes[u],...s.board]));
      const levels=[...new Set(live.map(u=>s.contrib[u]||0))].sort((a,b)=>a-b);let prev=0;const won={};
      for(const lv of levels){let part=0;for(const u of s.seats)part+=Math.max(0,Math.min(s.contrib[u]||0,lv)-prev);
        const el=live.filter(u=>(s.contrib[u]||0)>=lv);if(!part||!el.length){prev=lv;continue}
        let top=[el[0]];for(const u of el.slice(1)){const c=cmp(score[u],score[top[0]]);if(c>0)top=[u];else if(c===0)top.push(u)}
        const share=Math.floor(part/top.length);let rest=part-share*top.length;
        const ordered=s.seats.filter(u=>top.includes(u));ordered.forEach(u=>{won[u]=(won[u]||0)+share+(rest>0?1:0);if(rest>0)rest--});prev=lv}
      Object.entries(won).forEach(([u,a])=>s.stacks[u]+=a);
      s.pot=0;s.street="end";s.turn=null;s.reveal={};live.forEach(u=>s.reveal[u]=mj.holes[u]);
      s.results=Object.entries(won).map(([u,a])=>({uid:u,amount:a,text:`${r.players[u]?.pseudo||"?"} remporte ${a} avec ${HAND_FR[score[u][0]]}`}));
      s.hands={};live.forEach(u=>s.hands[u]=HAND_FR[score[u][0]]);
      s.delta={};s.seats.forEach(u=>s.delta[u]=s.stacks[u]-(s.start[u]||0));s.last="Abattage";
      return {s}});
  }
}
let autoNext=null;
function pokerRender(){
  const s=room.s,seats=s.seats||room.order,my=secret&&secret.hand===s.hand?secret.cards:null,inHand=(s.seats||[]).includes(uid)&&s.street!=="end";
  const max=Math.max(0,...Object.values(s.bets||{})),b=(s.bets||{})[uid]||0,stack=(s.stacks||{})[uid]??0,toCall=Math.min(max-b,stack),myTurn=s.turn===uid;
  const potNow=(s.pot||0)+Object.values(s.bets||{}).reduce((a,c)=>a+c,0);
  let h=`<div class="felt"><div class="pot">Pot : ${potNow}</div><div class="board">${[0,1,2,3,4].map(i=>s.board?.[i]?cardHTML(s.board[i]):`<span class="pcard" style="opacity:.15"></span>`).join("")}</div>
    <div class="note" style="color:#d1fae5">${s.hand?`Main n°${s.hand} · ${esc(s.last||"")}`:"Distribution…"}</div>
    <div class="ptable">${Object.keys(s.stacks||{}).filter(u=>room.players[u]||seats.includes(u)).map(u=>{const inH=(s.seats||[]).includes(u),cards=s.reveal?.[u];
      return `<div class="pseat${s.turn===u?" turn":""}${s.folded?.[u]?" fold":""}${u===uid?" me":""}"><div class="nm">${s.dealer===u?'<span class="dchip">D</span>':""}${esc(pseudoOf(u))}</div>
        <div class="st">${s.stacks[u]} jetons${s.allin?.[u]&&s.street!=="end"?" · TAPIS":""}${s.folded?.[u]?" · couché":""}${inH?"":" · attend"}</div>
        ${(s.bets?.[u])?`<div class="bt">Mise : ${s.bets[u]}</div>`:""}
        <div class="pcards">${cards?cards.map(c=>cardHTML(c,1)).join(""):inH&&!s.folded?.[u]&&u!==uid?cardHTML(null,1)+cardHTML(null,1):""}</div>
        ${s.hands?.[u]&&s.street==="end"?`<div class="note">${esc(s.hands[u])}</div>`:""}</div>`}).join("")}</div>
    ${my&&inHand||(my&&s.street==="end"&&(s.seats||[]).includes(uid))?`<div class="mine-cards"><span class="eyebrow" style="color:#d1fae5">Tes cartes</span>${my.map(c=>cardHTML(c)).join("")}</div>`:""}`;
  if(myTurn){const minTo=Math.min(b+stack,max+s.minRaise);
    h+=`<div class="actbar"><button class="btn ghost small" data-pk="fold">Se coucher</button>
      ${toCall>0?`<button class="btn small" data-pk="call">Suivre ${toCall}</button>`:`<button class="btn small" data-pk="check">Parler</button>`}
      ${b+stack>max?`${b+stack>minTo?`<input type="range" id="rz" min="${minTo}" max="${b+stack}" step="10" value="${minTo}" aria-label="Montant de la relance"><input type="number" id="rzn" min="${minTo}" max="${b+stack}" value="${minTo}"><button class="btn gold small" data-pk="raise">${max?"Relancer":"Miser"}</button>`:""}<button class="btn red small" data-pk="allin">Tapis (${b+stack})</button>`:""}</div>`}
  else if(s.street!=="end"&&s.turn)h+=`<div class="note" style="color:#d1fae5">Au tour de ${esc(pseudoOf(s.turn))}</div>${isHost()?`<button class="btn ghost small" id="afk">Coucher ${esc(pseudoOf(s.turn))} (absent)</button>`:""}`;
  h+=`</div>`;
  if(s.street==="end"&&s.results){h+=`<div class="banner">${s.results.map(x=>esc(x.text)).join("<br>")}</div>`;
    const d=s.delta?.[uid];if(d!==undefined&&s.hand&&(s.seats||[]).includes(uid))addStat("poker",{key:"h"+s.hand,hands:1,net:d,...(d>0?{wins:1}:{})});}
  if(s.street==="end"){
    h+=`<div class="row">${isHost()?`<button class="btn" id="deal">Main suivante</button>`:""}${stack<BB?`<button class="btn ghost" id="rebuy">Me recaver (1 000 jetons)</button>`:""}<span class="note">${isHost()?"La main suivante part toute seule dans quelques secondes.":"L'hôte distribue la main suivante."}</span></div>`;
  }
  $("gbody").innerHTML=h;
  $("gbody").querySelectorAll("[data-pk]").forEach(bt=>bt.onclick=()=>pokerAct(bt.dataset.pk,+($("rzn")?.value||0)));
  const rz=$("rz"),rzn=$("rzn");if(rz){rz.oninput=()=>rzn.value=rz.value;rzn.oninput=()=>rz.value=rzn.value}
  if($("deal"))$("deal").onclick=()=>pokerDeal();
  if($("afk"))$("afk").onclick=()=>pokerAct("fold",0,s.turn);
  if($("rebuy"))$("rebuy").onclick=()=>mutate(r=>{const s=r.s;if((s.stacks[uid]||0)>=BB||(s.street!=="end"&&(s.seats||[]).includes(uid)&&!s.folded[uid]))return null;s.stacks[uid]=(s.stacks[uid]||0)+START;s.buy[uid]=(s.buy[uid]||0)+1;return {s}});
  clearTimeout(autoNext);if(isHost()&&s.street==="end"&&s.hand)autoNext=setTimeout(()=>{if(room?.s?.street==="end"&&room.s.hand===s.hand)pokerDeal()},8000);
}

// ---------- classement ----------
const LB={poker:{n:"Poker",cols:[["Gain net","net"],["Mains","hands"],["Mains gagnées","wins"]],sort:"net"},uc:{n:"Undercover",cols:[["Victoires","w"],["Parties","g"]],sort:"w"},
  p4:{n:"Puissance 4",cols:[["Victoires","w"],["Défaites","l"],["Nuls","d"]],sort:"w"},lg:{n:"Loup-garou",cols:[["Victoires","w"],["Parties","g"]],sort:"w"}};
function renderLB(){
  $("lbtabs").innerHTML=Object.entries(LB).map(([k,v])=>`<button class="chip" data-lb="${k}" aria-pressed="${k===lbGame}">${v.n}</button>`).join("");
  $("lbtabs").querySelectorAll("[data-lb]").forEach(b=>b.onclick=()=>{lbGame=b.dataset.lb;renderLB()});
  const L=LB[lbGame],rows=Object.entries(statsAll).filter(([id,v])=>v[lbGame]&&!conseilIsClaimed(id)).sort((a,b)=>(b[1][lbGame][L.sort]||0)-(a[1][lbGame][L.sort]||0)).slice(0,20);
  $("lboard").innerHTML=rows.length?`<table class="lb"><thead><tr><th>#</th><th>Sage</th>${L.cols.map(c=>`<th class="num">${c[0]}</th>`).join("")}</tr></thead><tbody>${rows.map(([id,v],i)=>`<tr${id===uid?' style="color:var(--tv-amber,#ffb400)"':""}><td>${i+1}</td><td>${esc(v.pseudo)}${conseilCampTag(id)}</td>${L.cols.map(c=>`<td class="num">${(v[lbGame][c[1]]||0).toLocaleString("fr-FR")}</td>`).join("")}</tr>`).join("")}</tbody></table>`:`<div class="empty">Personne n'a encore joué. Lance un salon !</div>`;
}

// ---------- démarrage ----------
try{game=localStorage.getItem("potes-game")||"poker"}catch(e){}if(!GAMES[game])game="poker";
loadPseudo();renderTabs();renderLB();
(async()=>{
  const c=await (window.__TEST_CONNECT||conseilConnect)();
  if(!c.db){$("conn").textContent="Hors ligne : recharge la page dans un instant.";$("rooms").innerHTML=`<div class="empty">Connexion impossible pour le moment.</div>`;return}
  db=c.db;uid=c.uid;$("conn").textContent="Connecté";
  if(!me){try{const r=await db.doc("riot/"+uid).get();if(r.exists&&r.data().pseudo){me=r.data().pseudo;$("pseudo").value=me;localStorage.setItem("potes-pseudo",me)}}catch(e){}}
  watchLobby();
  db.collection("gstats").onSnapshot(q=>{statsAll={};q.docs.forEach(d=>statsAll[d.id]=d.data());renderLB()},()=>{});
  const m=location.hash.match(/salon=([\w-]+)/);if(m)joinRoom(m[1]);
})();
