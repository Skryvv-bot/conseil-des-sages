// Relais Riot du Conseil des Sages (Cloudflare Worker)
// Garde la clé API Riot secrète. Seuls les sages qui ont ajouté eux-mêmes leur Riot ID sur le site sont interrogés.
// Réglage : Cloudflare > Workers > conseil-riot > Settings > Variables and Secrets : secret RIOT_KEY = ta clé Riot.
//
// GET /live?players=Pseudo#TAG|euw1,...            -> {"games":{"pseudo#tag":{championId,queueId,start,gameId}|null}}
// GET /ranks?players=Pseudo#TAG|euw1,...           -> {"ranks":{"pseudo#tag":{solo:{tier,rank,lp,w,l},flex:{...}}|null}}
// GET /result?player=Pseudo#TAG|euw1&gameId=123&after=1700000000000
//                                                  -> {"done":true,"win":true,"championName","kills","deaths","assists","queueId","duration","matchId"} | {"done":false}
// GET /week?players=Pseudo#TAG|euw1,...&since=ms -> {"week":{"pseudo#tag":{solo:{w,l,pending},flex:{w,l,pending}}|null}}
//                                                  (victoires/défaites classées depuis "since", d'après l'historique des parties)
// GET /clash?platform=euw1                         -> {"tournaments":[{id,name,name2,start,registration,cancelled}]}
//
// Banque (Cron Trigger "3-59/10 * * * *" + route /bank) : crédite et débite les Pièces d'or.
// Fantasy (même cron + route /fantasy) : stats officielles des games des Worlds -> fantasyGames, MVP depuis Leaguepedia.
// Tâche automatique (Cron Trigger "*/2 * * * *") : détecte les parties des sages, ouvre un prono sur le site,
// l'annonce sur Discord, puis annonce le résultat. Secret nécessaire : DISCORD_WEBHOOK (URL du webhook du salon). Liaison KV nécessaire : CDS_KV.

const ALLOWED_ORIGINS = [
  "https://conseil-des-sages.pages.dev",
  "https://conseil-des-sages.netlify.app",
];
const PLATFORM_TO_REGION = {
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  kr: "asia", jp1: "asia", oc1: "sea",
};
const MAX_PLAYERS = 40;
const LIVE_TTL = 60;            // état "en partie"
const RANK_TTL = 600;           // rangs : 10 minutes
const PUUID_TTL = 86400 * 7;    // le PUUID d'un compte ne change pas
const MATCH_TTL = 86400 * 30;   // une partie terminée ne change plus
const CLASH_TTL = 3600;

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.conseil-des-sages\.pages\.dev$/.test(origin || "") || /^http:\/\/localhost(:\d+)?$/.test(origin || "");
  return { "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0], "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" };
}

// Mémoire du relais : sur workers.dev, le cache Cloudflare ne fonctionne pas, on garde donc les réponses
// en mémoire (et les PUUID dans KV) pour économiser la limite Riot (100 requêtes / 2 min).
const MEM = new Map(); let KV = null;
async function riotGet(url, key, ttl) {
  const m = MEM.get(url); if (m && m.exp > Date.now()) return { status: m.status, body: m.body };
  const res = await riotGet0(url, key, ttl);
  if (res.status === 200 || res.status === 404) { MEM.set(url, { status: res.status, body: res.body, exp: Date.now() + (res.status === 404 ? Math.min(ttl, 60) : ttl) * 1000 }); if (MEM.size > 2000) MEM.clear(); }
  else if (res.status === 429 && m) return { status: m.status, body: m.body };   // limite atteinte : on renvoie la dernière réponse connue
  return res;
}
async function riotGet0(url, key, ttl) {
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return { status: hit.status, body: await hit.text() };
  const r = await fetch(url, { headers: { "X-Riot-Token": key } });
  const body = await r.text();
  if (r.status === 200 || r.status === 404) {
    await cache.put(cacheKey, new Response(body, { status: r.status, headers: { "Cache-Control": `max-age=${r.status === 404 ? Math.min(ttl, 60) : ttl}` } }));
  }
  return { status: r.status, body };
}

function parsePlayer(entry) {
  // retire les caractères invisibles (copier-coller depuis le client LoL) et les espaces en trop
  let [riotId, platform = "euw1"] = String(entry).replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "").split("|");
  riotId = riotId.trim().replace(/\s*#\s*/, "#");
  const i = riotId.lastIndexOf("#");
  if (i < 1) throw new Error("Riot ID invalide");
  const p = platform.toLowerCase();
  if (!PLATFORM_TO_REGION[p]) throw new Error("Région inconnue");
  return { riotId, name: riotId.slice(0, i), tag: riotId.slice(i + 1), platform: p, region: PLATFORM_TO_REGION[p] };
}

async function puuidOf(pl, key) {
  const kk = "puuid:" + pl.region + ":" + pl.riotId.toLowerCase();
  if (KV) { const v = await KV.get(kk); if (v) return v; }
  const acc = await riotGet(`https://${pl.region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(pl.name)}/${encodeURIComponent(pl.tag)}`, key, PUUID_TTL);
  if (acc.status === 404) throw new Error("Compte introuvable");
  if (acc.status === 429) throw new Error("Limite Riot atteinte, réessaie dans une minute");
  if (acc.status !== 200) throw new Error("Riot " + acc.status);
  const puuid = JSON.parse(acc.body).puuid; if (KV && puuid) await KV.put(kk, puuid); return puuid;
}

async function live(pl, key) {
  const puuid = await puuidOf(pl, key);
  const sp = await riotGet(`https://${pl.platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`, key, LIVE_TTL);
  if (sp.status === 404) return null;
  if (sp.status === 429) throw new Error("Limite Riot atteinte, réessaie dans une minute");
  if (sp.status !== 200) throw new Error("Riot " + sp.status);
  const g = JSON.parse(sp.body);
  const me = (g.participants || []).find(p => p.puuid === puuid) || {};
  return { championId: me.championId ?? null, queueId: g.gameQueueConfigId ?? 0, start: g.gameStartTime || Date.now(), gameId: g.gameId ?? null };
}

async function ranks(pl, key) {
  const puuid = await puuidOf(pl, key);
  const r = await riotGet(`https://${pl.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`, key, RANK_TTL);
  if (r.status !== 200) throw new Error("Riot " + r.status);
  const out = { solo: null, flex: null };
  for (const e of JSON.parse(r.body)) {
    const v = { tier: e.tier, rank: e.rank, lp: e.leaguePoints, w: e.wins, l: e.losses, hot: !!e.hotStreak };
    if (e.queueType === "RANKED_SOLO_5x5") out.solo = v;
    else if (e.queueType === "RANKED_FLEX_SR") out.flex = v;
  }
  return out;
}

function summarize(m, puuid, matchId) {
  const p = (m.info.participants || []).find(x => x.puuid === puuid);
  if (!p) return { done: false };
  return { done: true, matchId, win: !!p.win, championName: p.championName, kills: p.kills, deaths: p.deaths, assists: p.assists,
    queueId: m.info.queueId, duration: m.info.gameDuration, end: m.info.gameEndTimestamp || null };
}

async function result(pl, gameId, after, key) {
  const puuid = await puuidOf(pl, key);
  // 1) la partie exacte, quand on connaît son identifiant (fourni par le direct)
  if (gameId) {
    const matchId = `${pl.platform.toUpperCase()}_${gameId}`;
    const r = await riotGet(`https://${pl.region}.api.riotgames.com/lol/match/v5/matches/${matchId}`, key, MATCH_TTL);
    if (r.status === 200) return summarize(JSON.parse(r.body), puuid, matchId);
    if (r.status !== 404) throw new Error("Riot " + r.status);
    return { done: false };
  }
  // 2) sinon, la première partie terminée après l'ouverture du prono
  const since = Math.floor((after - 2 * 3600e3) / 1000);
  const ids = await riotGet(`https://${pl.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${since}&count=5`, key, 60);
  if (ids.status !== 200) throw new Error("Riot " + ids.status);
  for (const id of JSON.parse(ids.body).reverse()) {
    const r = await riotGet(`https://${pl.region}.api.riotgames.com/lol/match/v5/matches/${id}`, key, MATCH_TTL);
    if (r.status !== 200) continue;
    const m = JSON.parse(r.body);
    if ((m.info.gameEndTimestamp || 0) > after) return summarize(m, puuid, id);
  }
  return { done: false };
}

// Victoires et défaites classées depuis "since" (lundi 00 h), compte par compte, partie par partie.
// Le résultat de chaque partie est gardé dans KV pour toujours : on ne redemande jamais deux fois la même partie à Riot.
// "budget" limite le nombre de parties lues par appel pour rester sous la limite Riot ; le reste est marqué "pending".
async function weekStats(pl, since, key, budget) {
  const puuid = await puuidOf(pl, key), out = {};
  for (const [q, qid] of [["solo", 420], ["flex", 440]]) {
    const ids = await riotGet(`https://${pl.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${Math.floor(since / 1000)}&queue=${qid}&count=100`, key, 300);
    if (ids.status === 429) throw new Error("Limite Riot atteinte, réessaie dans une minute");
    if (ids.status !== 200) throw new Error("Riot " + ids.status);
    let w = 0, l = 0, pending = 0;
    for (const id of JSON.parse(ids.body)) {
      const kk = "mres:" + id + ":" + puuid.slice(0, 20);
      let v = MEM.get(kk)?.v ?? (KV ? await KV.get(kk) : null);
      if (v === null || v === undefined) {
        if (budget.n <= 0) { pending++; continue; }
        budget.n--;
        const r = await riotGet(`https://${pl.region}.api.riotgames.com/lol/match/v5/matches/${id}`, key, MATCH_TTL);
        if (r.status !== 200) { pending++; continue; }
        const m = JSON.parse(r.body), p = (m.info.participants || []).find(x => x.puuid === puuid);
        v = !p ? "x" : p.gameEndedInEarlySurrender ? "r" : p.win ? "1" : "0";     // "r" = partie à refaire, ne compte pas
        if (KV) await KV.put(kk, v);
      }
      MEM.set(kk, { v, exp: Infinity });
      if (v === "1") w++; else if (v === "0") l++;
    }
    out[q] = { w, l, pending };
  }
  return out;
}

async function clash(platform, key) {
  const r = await riotGet(`https://${platform}.api.riotgames.com/lol/clash/v1/tournaments`, key, CLASH_TTL);
  if (r.status !== 200) throw new Error("Riot " + r.status);
  return JSON.parse(r.body).map(t => {
    const s = (t.schedule || [])[0] || {};
    return { id: t.id, name: t.nameKey, name2: t.nameKeySecondary, start: s.startTime, registration: s.registrationTime, cancelled: !!s.cancelled };
  }).sort((a, b) => (a.start || 0) - (b.start || 0));
}

const json = (obj, headers, status = 200, maxAge = 30) => new Response(JSON.stringify(obj), { status, headers: { ...headers, "Cache-Control": `public, max-age=${maxAge}` } });

// ================== Tâche automatique : pronos + Discord ==================
const FB = { key: "AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I", project: "conseil-des-sages" };
const SITE = "https://conseil-des-sages.pages.dev";
const FS = `https://firestore.googleapis.com/v1/projects/${FB.project}/databases/(default)/documents`;
const QUEUES = { 420: "Classée Solo/Duo", 440: "Classée Flex", 400: "Normale (draft)", 430: "Normale", 490: "Partie rapide", 450: "ARAM", 1700: "Arena", 1710: "Arena", 900: "URF", 1900: "URF", 700: "Clash" };
const PRONO_MIN = 8;

// Connexion anonyme Firebase du robot (jeton gardé en cache pour ne pas recréer de compte à chaque passage)
// Le jeton est rangé dans Workers KV (liaison "CDS_KV") : un seul compte robot, renouvelé toutes les heures.
let fbMem = null;
async function fbToken(env) {
  let saved = fbMem || (env.CDS_KV ? await env.CDS_KV.get("fb-token", "json") : null);
  if (saved && saved.exp > Date.now() + 60e3) return (fbMem = saved);
  if (saved && saved.refresh) {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB.key}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(saved.refresh)}` });
    saved = r.ok ? await r.json().then(j => ({ token: j.id_token, refresh: j.refresh_token, uid: j.user_id, exp: Date.now() + (+j.expires_in) * 1000 })) : null;
  } else saved = null;
  if (!saved) {
    if (!env.CDS_KV) throw new Error("Liaison KV CDS_KV manquante");
    const j = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB.key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) })).json();
    saved = { token: j.idToken, refresh: j.refreshToken, uid: j.localId, exp: Date.now() + (+j.expiresIn) * 1000 };
  }
  if (env.CDS_KV) await env.CDS_KV.put("fb-token", JSON.stringify(saved));
  return (fbMem = saved);
}
// Conversion des valeurs Firestore REST <-> JS
const fromFs = v => v == null ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? +v.integerValue : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue
  : "nullValue" in v ? null : "timestampValue" in v ? Date.parse(v.timestampValue) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])) : "arrayValue" in v ? (v.arrayValue.values || []).map(fromFs) : null;
const toFs = v => v === null || v === undefined ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(toFs) } } : typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } } : { stringValue: String(v) };
const docObj = d => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])) });
async function fsList(col, tk) {
  const out = []; let page = "";
  do { const r = await fetch(`${FS}/${col}?pageSize=300${page ? "&pageToken=" + page : ""}`, { headers: { Authorization: "Bearer " + tk } }); if (!r.ok) break;
    const j = await r.json(); (j.documents || []).forEach(d => out.push(docObj(d))); page = j.nextPageToken || ""; } while (page);
  return out;
}
const fsCreate = (col, id, data, tk) => fetch(`${FS}/${col}${id ? "?documentId=" + encodeURIComponent(id) : ""}`, { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFs(v)])) }) });
const fsPatch = (path, data, tk) => fetch(`${FS}/${path}?${Object.keys(data).map(k => "updateMask.fieldPaths=" + k).join("&")}`, { method: "PATCH", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFs(v)])) }) });

// Requêtes ciblées (pour rester dans le quota gratuit de Firestore : 50 000 lectures par jour)
const fsVal = v => Array.isArray(v) ? { arrayValue: { values: v.map(fsVal) } } : toFs(v);
async function fsQuery(col, field, op, value, tk) {
  const body = { structuredQuery: { from: [{ collectionId: col }], ...(field ? { where: { fieldFilter: { field: { fieldPath: field }, op, value: fsVal(value) } } } : {}) } };
  const r = await fetch(`${FS}:runQuery`, { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("requête " + col + " " + r.status);
  return (await r.json()).filter(x => x.document).map(x => docObj(x.document));
}
async function fsIn(col, field, values, tk) { const out = []; for (let i = 0; i < values.length; i += 30) out.push(...await fsQuery(col, field, "IN", values.slice(i, i + 30), tk)); return out; }
// listes qui changent rarement (membres, comptes récupérés) : gardées 15 min dans KV
async function cachedList(env, col, tk) {
  const k = "list-" + col; let c = env.CDS_KV ? await env.CDS_KV.get(k, "json") : null;
  if (c && Date.now() - c.at < 15 * 60e3) return c.docs;
  const docs = await fsList(col, tk); if (env.CDS_KV) await env.CDS_KV.put(k, JSON.stringify({ at: Date.now(), docs })); return docs;
}
const isoAgo = ms => new Date(Date.now() - ms).toISOString();

let champCache = null;
async function champName(id) {
  if (!champCache) { try { const v = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json())[0];
    const d = (await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/fr_FR/champion.json`)).json()).data;
    champCache = { v, map: Object.fromEntries(Object.values(d).map(c => [c.key, { name: c.name, id: c.id }])) }; } catch (e) { champCache = { v: null, map: {} }; } }
  return champCache.map[id] || { name: "un champion", id: null };
}
async function discord(env, payload) {
  if (!env.DISCORD_WEBHOOK) return;
  const r = await fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "CDS.TV", avatar_url: SITE + "/icon-192.png?v=2", allowed_mentions: { parse: [] }, ...payload }) });
  if (!r.ok) throw new Error("Discord " + r.status);
}

async function autoRun(env, log = []) {
  const key = env.RIOT_KEY; if (!key) { log.push("RIOT_KEY manquant"); return log; }
  log.push("KV " + (env.CDS_KV ? "ok" : "MANQUANT") + " · webhook " + (env.DISCORD_WEBHOOK ? "ok" : "MANQUANT"));
  let tk; try { tk = await fbToken(env); log.push("connexion robot " + (tk && tk.uid ? "ok" : "échec")); } catch (e) { log.push("connexion robot : " + e.message); return log; }
  const claimed = new Set((await cachedList(env, "claims", tk.token)).map(d => d.id));
  // un même Riot ID peut exister sur plusieurs appareils : on ne garde que le profil le plus récent
  const byRiot = new Map();
  for (const p of (await cachedList(env, "riot", tk.token)).filter(p => p.riotId && p.pseudo && !claimed.has(p.id)).sort((a, b) => String(a.updated || "").localeCompare(String(b.updated || "")))) byRiot.set(p.riotId.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "").trim().toLowerCase(), p);
  const players = [...byRiot.values()].slice(0, MAX_PLAYERS);
  // seulement les pronos ouverts et ceux terminés depuis moins de 6 h
  const bets = [...await fsQuery("bets", "status", "EQUAL", "open", tk.token), ...await fsQuery("bets", "settledAt", "GREATER_THAN_OR_EQUAL", isoAgo(6 * 3600e3), tk.token)];
  const openFor = new Map(bets.filter(b => b.status === "open").map(b => [b.target, b]));

  // 1) nouvelles parties -> prono + message Discord
  for (const p of players) {
    try {
      // compte principal puis comptes secondaires (2 au maximum)
      const accs = [{ riotId: p.riotId, region: p.region || "euw1" }, ...(Array.isArray(p.alts) ? p.alts : []).slice(0, 2).filter(a => a && a.riotId).map(a => ({ riotId: a.riotId, region: a.region || p.region || "euw1" }))];
      let g = null, acc = accs[0];
      for (const a of accs) { try { g = await live(parsePlayer(a.riotId + "|" + a.region), key); } catch (e) { g = null; if (a === accs[0]) throw e; } if (g) { acc = a; break; } }
      log.push(p.pseudo + " : " + (g ? "en partie " + g.gameId + (acc !== accs[0] ? " sur " + acc.riotId : "") : "pas en partie") + (openFor.has(p.id) ? " (prono déjà ouvert sur le site)" : ""));
      const already = openFor.get(p.id);
      if (!g || !g.gameId || g.queueId === 0) continue;
      if (already && already.gameId && String(already.gameId) !== String(g.gameId)) continue;   // prono ouvert pour une autre partie
      const gameKey = `${acc.region.toUpperCase()}_${g.gameId}_${p.id}`;
      const lock = await fsCreate("autoGames", gameKey, { at: new Date().toISOString(), pseudo: p.pseudo }, tk.token);
      if (!lock.ok) { log.push("  verrou refusé " + lock.status + " (déjà annoncée ou règles)"); continue; }
      const ch = await champName(g.championId), mode = QUEUES[g.queueId] || "Partie";
      if (!already) await fsCreate("bets", null, { target: p.id, targetPseudo: p.pseudo, riotId: acc.riotId, region: acc.region, gameId: g.gameId, label: mode,
        championName: ch.name, openedBy: tk.uid, openedPseudo: "CDS.TV", created: new Date().toISOString(),
        closesAt: new Date(Date.now() + PRONO_MIN * 60e3), status: "open", result: null }, tk.token).then(r => { log.push("  prono " + (r.ok ? "ouvert" : "refusé " + r.status)); });
      const left = already ? Math.max(1, Math.round(((already.closesAt || 0) - Date.now()) / 60e3)) : PRONO_MIN;
      if (already) log.push("  annonce du prono ouvert par " + (already.openedPseudo || "un sage"));
      if (left <= 0 || (already && (already.closesAt || 0) < Date.now())) continue;
      await discord(env, { embeds: [{ color: 0xe4002b, title: `🎮 ${p.pseudo} lance une ${mode} !`,
        description: `Il joue **${ch.name}**. Victoire ou défaite ? Les pronos sont ouverts encore **${left} minute${left > 1 ? "s" : ""}**.\n👉 [Faire mon prono](${SITE}/communaute.html#paris)`,
        thumbnail: ch.id && champCache.v ? { url: `https://ddragon.leagueoflegends.com/cdn/${champCache.v}/img/champion/${ch.id}.png` } : undefined,
        footer: { text: "Pronos entre potes · CDS.TV" } }] });
    } catch (e) { log.push(p.pseudo + " : erreur " + e.message); }
  }

  // 2) parties terminées -> résultat + message Discord
  const stakes = await fsIn("stakes", "bet", bets.filter(b => b.status === "done" && !b.announced).map(b => b.id), tk.token);
  for (const b of bets) {
    try {
      let done = b.status === "done";
      if (b.status === "open" && Date.now() > (b.closesAt || 0) && b.riotId) {
        const r = await result(parsePlayer(b.riotId + "|" + (b.region || "euw1")), b.gameId, Date.parse(b.created) || Date.now(), key);
        if (r.done) {
          const upd = { status: "done", result: r.win ? "win" : "loss", settledBy: "riot", settledAt: new Date().toISOString(),
            match: { championName: r.championName || "", kills: r.kills || 0, deaths: r.deaths || 0, assists: r.assists || 0, duration: r.duration || 0, matchId: r.matchId || "" } };
          const ok = await fsPatch("bets/" + b.id, upd, tk.token);
          if (ok.ok) { Object.assign(b, upd); done = true; }
        }
      }
      if (done && !b.announced && b.result && (Date.now() - Date.parse(b.settledAt || 0)) < 6 * 3600e3) {
        const votes = stakes.filter(s => s.bet === b.id), good = votes.filter(s => s.side === b.result);
        const m = b.match || {}, win = b.result === "win";
        const mark = await fsPatch("bets/" + b.id, { announced: true }, tk.token);
        if (!mark.ok) continue;
        await discord(env, { embeds: [{ color: win ? 0x2fbf71 : 0xe4002b, title: `${win ? "✅" : "❌"} ${b.targetPseudo} ${win ? "a gagné" : "a perdu"} sa ${b.label || "partie"}`,
          description: `${m.championName ? `**${m.championName}** · ${m.kills}/${m.deaths}/${m.assists}` : ""}${m.duration ? ` · ${Math.round(m.duration / 60)} min` : ""}\n` +
            (votes.length ? `🎯 ${good.length}/${votes.length} sage${votes.length > 1 ? "s" : ""} avai${votes.length > 1 ? "ent" : "t"} vu juste${good.length ? " : " + good.map(s => s.pseudo).join(", ") : ""}.` : "Personne n'avait pronostiqué."),
          footer: { text: "+10 points par bon prono · CDS.TV" } }] });
      }
    } catch (e) { }
  }
  return log;
}

// ================== Banque des Pièces d'or (PO) ==================
// Le robot est le seul à pouvoir créditer ou débiter les portefeuilles (règles Firestore : isBank()).
// Chaque passage lit les activités du site, calcule les gains, traite les achats de la boutique,
// et écrit tout en UN SEUL commit atomique (si un autre passage a modifié bank/state entre-temps, rien n'est écrit).
const DOCS = `projects/${FB.project}/databases/(default)/documents`;
const BANK = {
  welcome: 500, dailyBase: 20, dailyStep: 10, dailyMax: 50, prono: 30, pick: { 1: 40, 3: 60, 5: 80 }, champion: 150, podium: [1000, 500, 250],
  tier: 100, warmRecord: 15, p4Win: 20, ucWin: 40, lgWin: 40, played: 10, rankedWin: 5, rankedMaxDay: 10, gameCapDay: 300,
  sage: { carry: 150, drole: 100, tilt: 50 }, devTries: [30, 25, 20, 15, 10], devMin: 5, devKey: 10
};
const SHOP = {
  ticker: { price: 150, hours: 1, label: "Bandeau Direct (1 h)", text: true },
  pin: { price: 400, hours: 24, label: "Message épinglé sur l'accueil (24 h)", text: true },
  popup: { price: 300, hours: 24, label: "Popup obligatoire pour tout le monde", text: true },
  popupTarget: { price: 200, hours: 72, label: "Popup obligatoire pour un sage", text: true, target: true },
  nickname: { price: 500, hours: 168, label: "Surnom pendant 7 jours", text: true, target: true, max: 24 },
  unnick: { price: 1000, label: "Retirer mon surnom" }
};
const BANNED = /\b(nègre|negre|bougnoule|youpin|pd|pédé|pede|tapette|enculé|encule|salope|pute|putain|connasse|nazi|hitler|suicide)\b/i;
const parisDay = (t = Date.now()) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7); return `${y}-W${String(w).padStart(2, "0")}`; }
const fsFields = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toFs(v)]));
async function fsGetRaw(path, tk) { const r = await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer " + tk } }); return r.ok ? r.json() : null; }
const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

let bankRunning = false;
async function bankRun(env, log = []) {
  if (bankRunning) { log.push("banque déjà en cours"); return log; }
  bankRunning = true;
  try { return await bankRun0(env, log); } finally { bankRunning = false; }
}
async function bankRun0(env, log) {
  const tk = (await fbToken(env)).token, now = Date.now(), today = parisDay(now), yesterday = parisDay(now - 864e5);
  const Q = (c, f, op, v) => fsQuery(c, f, op, v, tk);
  const stateRaw0 = await fsGetRaw("bank/state", tk), st0 = stateRaw0 ? docObj(stateRaw0) : {}, resultsRaw = await fsGetRaw("results/state", tk);
  const res0 = resultsRaw ? docObj(resultsRaw) : null, needPicks = (res0?.matches || []).some(m => m.status === "done" && m.winner && !(st0.matches || {})[m.id]) || (res0?.champion && !st0.champion);
  const lastWeek0 = isoWeek(new Date(now - 7 * 864e5));
  const [wallets, claims, riot, picks, tiers, warmup, gstats, visits, bets, sage, devs, orders, effects, ladderRaw] = await Promise.all([
    fsList("wallets", tk), cachedList(env, "claims", tk), cachedList(env, "riot", tk), needPicks ? fsList("picks", tk) : [], Q("tiers", "complete", "EQUAL", true),
    Q("warmup", "updated", "GREATER_THAN_OR_EQUAL", isoAgo(2 * 864e5)), Q("gstats", "updated", "GREATER_THAN_OR_EQUAL", isoAgo(2 * 864e5)), Q("visits", "day", "EQUAL", today),
    Q("bets", "settledAt", "GREATER_THAN_OR_EQUAL", isoAgo(3 * 864e5)), (st0.sage || {})[lastWeek0] ? [] : Q("sageVotes", "week", "EQUAL", lastWeek0),
    Q("dailyWins", "day", "GREATER_THAN_OR_EQUAL", yesterday), Q("orders", "status", "EQUAL", "pending"), Q("effects", "until", "GREATER_THAN", new Date(now)), fsGetRaw("ladder/current", tk)]);
  const stateRaw = stateRaw0;
  const stakes = await fsIn("stakes", "bet", bets.filter(b => b.status === "done" && !(st0.bets || {})[b.id]).map(b => b.id), tk);
  const claimed = new Set(claims.map(d => d.id)), ok = id => id && !claimed.has(id);
  const st = stateRaw ? docObj(stateRaw) : {}; delete st.id;
  for (const k of ["bets", "matches", "tiers", "sage", "dev", "moved"]) st[k] = st[k] || {};
  const liveBetIds = new Set(bets.map(b => b.id)); for (const k of Object.keys(st.bets)) if (!liveBetIds.has(k)) delete st.bets[k];
  const W = {}; wallets.forEach(w => W[w.id] = w);
  const pseudo = {};
  for (const src of [visits, gstats, warmup, tiers, picks, riot]) for (const d of src) if (d.pseudo && ok(d.id)) pseudo[d.id] = String(d.pseudo).slice(0, 20);
  const credits = [], ch = {}; // ch[uid] = changements du portefeuille
  const cw = uid => ch[uid] || (ch[uid] = { delta: 0, fields: {} });
  const wal = uid => ({ ...(W[uid] || {}), ...(ch[uid]?.fields || {}) });
  const give = (uid, amount, reason, kind) => { if (!ok(uid) || !amount) return; if (!W[uid] && !ch[uid]?.fields.created) return; credits.push({ uid, amount, reason, kind }); cw(uid).delta += amount; };
  // jeux : plafond quotidien
  const gameGive = (uid, amount, reason) => { const w = wal(uid); let used = w.gameDay === today ? (w.gameToday || 0) : 0; const a = Math.max(0, Math.min(amount, BANK.gameCapDay - used));
    cw(uid).fields.gameDay = today; cw(uid).fields.gameToday = used + a; if (a) give(uid, a, reason + (a < amount ? " (plafond du jour)" : ""), "jeu"); };

  // 1) nouveaux portefeuilles
  const inherits = uid => claims.some(c => c.by === uid && W[c.id]);
  for (const [uid, p] of Object.entries(pseudo)) if (!W[uid]) { cw(uid).fields = { created: new Date(now), pseudo: p, streak: 0, meta: { gs: null, warm: null, rw: null } }; if (!inherits(uid)) give(uid, BANK.welcome, "Bienvenue au Conseil", "bonus"); }
  // compte récupéré sur un autre appareil : le coffre suit
  for (const c of claims) if (W[c.id] && !st.moved[c.id] && c.by && (W[c.by] || ch[c.by]?.fields.created)) { st.moved[c.id] = 1; if (W[c.id].po) give(c.by, W[c.id].po, "Coffre récupéré de ton ancien compte", "bonus"); }
  for (const [uid, p] of Object.entries(pseudo)) if (W[uid] && W[uid].pseudo !== p) cw(uid).fields.pseudo = p;
  const has = uid => W[uid] || ch[uid]?.fields.created;

  // 2) passage quotidien
  for (const v of visits) { const uid = v.id; if (!has(uid) || v.day !== today) continue; const w = wal(uid); if (w.lastDaily === today) continue;
    const streak = w.lastDaily === yesterday ? (w.streak || 0) + 1 : 1;
    cw(uid).fields.lastDaily = today; cw(uid).fields.streak = streak;
    give(uid, Math.min(BANK.dailyMax, BANK.dailyBase + (streak - 1) * BANK.dailyStep), `Passage du jour${streak > 1 ? ` (${streak} jours d'affilée)` : ""}`, "bonus"); }

  // 3) pronos justes
  for (const b of bets) { if (b.status !== "done" || !b.result || st.bets[b.id]) continue; st.bets[b.id] = 1;
    for (const s of stakes) if (s.bet === b.id && s.side === b.result && has(s.uid)) give(s.uid, BANK.prono, `Prono juste sur ${b.targetPseudo || "un sage"}`, "prono"); }

  // 4) pick'em des Worlds
  const res = resultsRaw ? docObj(resultsRaw) : null;
  for (const m of res?.matches || []) { if (m.status !== "done" || !m.winner || st.matches[m.id]) continue; st.matches[m.id] = 1;
    for (const p of picks) if (p.picks?.[m.id] === m.winner && has(p.id)) give(p.id, BANK.pick[m.bo] || 40, `Pick'em : ${m.a} – ${m.b}, bon prono (${m.winner})`, "pickem"); }
  if (res?.champion && !st.champion) { st.champion = res.champion;
    for (const p of picks) if (p.champion === res.champion && has(p.id)) give(p.id, BANK.champion, `Pick'em : bon champion du monde (${res.champion})`, "pickem");
    const PTS = { 1: 1, 3: 2, 5: 3 }, sc = picks.filter(p => has(p.id)).map(p => { let s = 0; for (const m of res.matches || []) if (m.status === "done" && p.picks?.[m.id] === m.winner) s += PTS[m.bo] || 1; if (p.champion === res.champion) s += 5; return [p.id, s]; }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const distinct = [...new Set(sc.map(x => x[1]))];
    sc.forEach(([uid, s]) => { const rank = distinct.indexOf(s); if (rank < 3) give(uid, BANK.podium[rank], `Pick'em : ${rank + 1}${rank ? "e" : "er"} du classement final`, "pickem"); }); }

  // 5) tier list validée
  for (const t of tiers) if (t.complete && has(t.id) && !st.tiers[t.id]) { st.tiers[t.id] = 1; give(t.id, BANK.tier, "Tier list validée", "bonus"); }

  // 6) jeux : records d'échauffement, devinettes, jeux entre potes, victoires en classée
  for (const w of warmup) { const uid = w.id; if (!has(uid)) continue; const meta = { ...(wal(uid).meta || {}) }, paid = { ...(meta.warm || {}) }; let changed = false;
    for (const k of ["dodge", "cs", "combo", "routine"]) if (typeof w[k] === "number" && w[k] > (paid[k] || 0)) { if (paid[k] !== undefined || meta.warm) gameGive(uid, BANK.warmRecord, "Record à l'échauffement"); paid[k] = w[k]; changed = true; }
    if (changed) { meta.warm = paid; cw(uid).fields.meta = meta; } }
  for (const d of devs) { if (st.dev[d.id] || !has(d.uid) || (d.day !== today && d.day !== yesterday)) continue; st.dev[d.id] = d.day;
    const n = Math.max(1, d.tries | 0), a = n <= BANK.devTries.length ? BANK.devTries[n - 1] : BANK.devMin; gameGive(d.uid, a + (d.key ? BANK.devKey : 0), `Devinettes du jour (${d.mode}, ${n} essai${n > 1 ? "s" : ""})`); }
  for (const k of Object.keys(st.dev)) if (st.dev[k] !== today && st.dev[k] !== yesterday) delete st.dev[k];
  for (const g of gstats) { const uid = g.id; if (!has(uid)) continue; const meta = { ...(wal(uid).meta || {}) };
    const cur = { p4w: g.p4?.w || 0, ucw: g.uc?.w || 0, ucg: g.uc?.g || 0, lgw: g.lg?.w || 0, lgg: g.lg?.g || 0 };
    if (meta.gs) { const d = k => Math.max(0, cur[k] - (meta.gs[k] || 0));
      const a = d("p4w") * BANK.p4Win + d("ucw") * BANK.ucWin + d("lgw") * BANK.lgWin + (d("ucg") + d("lgg")) * BANK.played;
      if (a) gameGive(uid, a, `Jeux entre potes (${[d("p4w") && d("p4w") + " victoire(s) au Puissance 4", d("ucw") && d("ucw") + " à l'Undercover", d("lgw") && d("lgw") + " au Loup-garou", (d("ucg") + d("lgg")) && (d("ucg") + d("lgg")) + " partie(s) jouée(s)"].filter(Boolean).join(", ")})`); }
    if (JSON.stringify(meta.gs) !== JSON.stringify(cur)) { meta.gs = cur; cw(uid).fields.meta = meta; } }
  const lad = ladderRaw ? docObj(ladderRaw).players || {} : {};
  for (const [uid, v] of Object.entries(lad)) { if (!has(uid)) continue; const meta = { ...(wal(uid).meta || {}) }, w = wal(uid);
    // victoires par compte (principal + secondaires) ; un compte ajouté plus tard part de zéro sans rien rapporter d'un coup
    const cur = { main: (v.solo?.w || 0) + (v.flex?.w || 0) }; for (const a of v.alts || []) if (a.riotId) cur["alt:" + a.riotId.toLowerCase()] = (a.solo?.w || 0) + (a.flex?.w || 0);
    let base = meta.rw; if (typeof base === "number") base = { main: base };
    if (base && typeof base === "object") { let gained = 0; for (const [k, n] of Object.entries(cur)) if (base[k] != null && n > base[k]) gained += n - base[k];
      const usedToday = w.rankDay === today ? (w.rankToday || 0) : 0, n = Math.min(gained, BANK.rankedMaxDay - usedToday);
      if (n > 0) { give(uid, n * BANK.rankedWin, `${n} victoire${n > 1 ? "s" : ""} en classée`, "ranked"); cw(uid).fields.rankDay = today; cw(uid).fields.rankToday = usedToday + n; } }
    if (JSON.stringify(base) !== JSON.stringify(cur)) { meta.rw = cur; cw(uid).fields.meta = meta; } }
  // 7) sage de la semaine dernière
  const lastWeek = isoWeek(new Date(now - 7 * 864e5));
  if (!st.sage[lastWeek]) { st.sage[lastWeek] = 1;
    for (const cat of Object.keys(BANK.sage)) { const t = {}; for (const v of sage) if (v.week === lastWeek && v[cat]) t[v[cat]] = (t[v[cat]] || 0) + 1;
      const e = Object.entries(t).sort((a, b) => b[1] - a[1]); if (e.length && (!e[1] || e[0][1] > e[1][1]) && has(e[0][0])) give(e[0][0], BANK.sage[cat], `Élu « ${{ carry: "le plus carry", drole: "le plus drôle", tilt: "le plus tilté" }[cat]} » de la semaine`, "sage"); } }

  // 8) boutique : achats en attente
  const effWrites = [], orderWrites = [];
  const balance = uid => (W[uid]?.po || 0) + (ch[uid]?.delta || 0);
  for (const o of orders.filter(o => o.status === "pending").sort((a, b) => (a.at || 0) - (b.at || 0))) {
    const item = SHOP[o.item], buyer = o.uid; let refuse = null; const text = String(o.text || "").replace(/\s+/g, " ").trim();
    if (!item) refuse = "Article inconnu"; else if (!has(buyer)) refuse = "Pas encore de portefeuille";
    else if (item.text && (!text || text.length > (item.max || 60))) refuse = `Message vide ou trop long (${item.max || 60} caractères max)`;
    else if (item.text && BANNED.test(text)) refuse = "Message refusé par le filtre";
    else if (item.target && (!o.target || !pseudo[o.target] && !W[o.target])) refuse = "Sage introuvable";
    else if (o.item === "nickname" && o.target === buyer) refuse = "Tu ne peux pas te donner un surnom";
    else if (o.item === "unnick" && !effects.some(e => e.kind === "nickname" && e.target === buyer && e.until > now)) refuse = "Tu n'as pas de surnom en ce moment";
    else if (balance(buyer) < item.price) refuse = `Pas assez de PO (${balance(buyer)} / ${item.price})`;
    if (refuse) { orderWrites.push({ id: o.id, status: "refused", reason: refuse }); continue; }
    const tName = o.target ? (pseudo[o.target] || W[o.target]?.pseudo || "un sage") : null;
    credits.push({ uid: buyer, amount: -item.price, reason: `Boutique : ${item.label}${tName ? ` (${tName})` : ""}`, kind: "achat" }); cw(buyer).delta -= item.price;
    if (o.item === "unnick") { for (const e of effects) if (e.kind === "nickname" && e.target === buyer && e.until > now) effWrites.push({ id: e.id, patch: { until: new Date(now), removedBy: buyer } }); }
    else { if (o.item === "nickname") for (const e of effects) if (e.kind === "nickname" && e.target === o.target && e.until > now) effWrites.push({ id: e.id, patch: { until: new Date(now), replaced: true } });
      effWrites.push({ id: rid(), create: { kind: o.item, by: buyer, byPseudo: pseudo[buyer] || W[buyer]?.pseudo || "?", target: o.target || null, targetPseudo: tName, text, at: new Date(now), until: new Date(now + item.hours * 3600e3), order: o.id } }); }
    orderWrites.push({ id: o.id, status: "done", reason: null });
  }

  // 9) un seul commit atomique
  const writes = [];
  for (const [uid, c] of Object.entries(ch)) { const f = { ...c.fields, updated: new Date(now) }; delete f.created; if (c.fields.created) f.created = c.fields.created;
    writes.push({ update: { name: `${DOCS}/wallets/${uid}`, fields: fsFields(f) }, updateMask: { fieldPaths: Object.keys(f) }, ...(c.delta ? { updateTransforms: [{ fieldPath: "po", increment: { integerValue: String(c.delta) } }] } : {}) }); }
  for (const c of credits.slice(0, 400)) writes.push({ update: { name: `${DOCS}/ledger/${rid()}`, fields: fsFields({ uid: c.uid, amount: c.amount, reason: c.reason, kind: c.kind, at: new Date(now), day: today }) }, currentDocument: { exists: false } });
  for (const e of effWrites) writes.push(e.create ? { update: { name: `${DOCS}/effects/${e.id}`, fields: fsFields(e.create) }, currentDocument: { exists: false } }
    : { update: { name: `${DOCS}/effects/${e.id}`, fields: fsFields(e.patch) }, updateMask: { fieldPaths: Object.keys(e.patch) } });
  for (const o of orderWrites) writes.push({ update: { name: `${DOCS}/orders/${o.id}`, fields: fsFields({ status: o.status, reason: o.reason, doneAt: new Date(now) }) }, updateMask: { fieldPaths: ["status", "reason", "doneAt"] } });
  const stFields = { ...st, updated: new Date(now) };
  writes.push({ update: { name: `${DOCS}/bank/state`, fields: fsFields(stFields) }, currentDocument: stateRaw ? { updateTime: stateRaw.updateTime } : { exists: false } });
  const r = await fetch(`${FS.replace(/\/documents$/, "")}/documents:commit`, { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ writes }) });
  if (!r.ok) { log.push("commit refusé " + r.status + " " + (await r.text()).slice(0, 300)); return log; }
  log.push(`banque : ${credits.length} mouvement(s), ${orderWrites.length} achat(s), ${Object.keys(ch).length} portefeuille(s) modifié(s)`);
  credits.slice(0, 30).forEach(c => log.push(`  ${c.amount > 0 ? "+" : ""}${c.amount} PO · ${pseudo[c.uid] || W[c.uid]?.pseudo || c.uid} · ${c.reason}`));
  return log;
}

// ================== Fantasy du Conseil : stats officielles des games (lolesports) + MVP (Leaguepedia) ==================
// Toutes les 10 minutes : pour chaque game des Worlds terminée, on lit la dernière image des stats officielles
// et on écrit fantasyGames/lol_<id> (kills, morts, assists, CS, part des dégâts, participation, balises, dragons, barons, vainqueur).
// Le MVP officiel est ajouté ensuite depuis Leaguepedia, dès qu'il y est publié.
const LE_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z", LE = "https://esports-api.lolesports.com/persisted/gw", LIVE = "https://feed.lolesports.com/livestats/v1";
const FX_LEAGUE = "98767975604431411";                       // Worlds
const FX_CODE = { TLAW: "TL" };                              // codes lolesports -> codes du site
const FX_LP_TEAMS = { "Gen.G": "GEN", "Hanwha Life Esports": "HLE", "T1": "T1", "Dplus Kia": "DK", "Dplus KIA": "DK", "Anyone's Legend": "AL", "Bilibili Gaming": "BLG", "Top Esports": "TES", "Invictus Gaming": "IG", "Shanghai Invictus Gaming Meituan": "IG", "G2 Esports": "G2", "Movistar KOI": "MKOI", "Karmine Corp": "KC", "Team Liquid": "TL", "Team Liquid Alienware": "TL", "LYON (2024 American Team)": "LYON", "LYON": "LYON", "Team Secret Whales": "TSW", "CTBC Flying Oyster": "CFO", "LØS": "LOS" };
const FX_PLAYERS = ["Zeus", "Bin", "Kiin", "Breathe", "BrokenBlade", "Siwoo", "369", "Canna", "Doran", "TheShy", "Myrwn", "Dhokla", "Morgan", "Pun", "Rest", "Zest", "Canyon", "Oner", "Kanavi", "SkewMond", "Xun", "Tarzan", "Wei", "Inspired", "Yike", "Elyoya", "Lucid", "Tian", "Josedeodo", "Hizto", "Shad0w", "Curse", "Faker", "Caps", "Chovy", "Knight", "Zeka", "Kyeahoo", "ShowMaker", "Creme", "Rookie", "Shanks", "Jojopyun", "Quid", "Dire", "Pout", "Saint", "Feisty", "Peyz", "Gumayusi", "Viper", "Ruler", "Hans Sama", "Smash", "Hope", "JiaQi", "Doggo", "Caliste", "JackeyLove", "Berserker", "Eddie", "Supa", "Yeon", "Duduhh", "Keria", "Duro", "ON", "Delight", "Labrov", "Kael", "Career", "Meiko", "Zhuo", "Busio", "CoreJJ", "Alvaro", "Bie", "Isles", "Kino", "Ackerman"];
const FX_NAME = Object.fromEntries(FX_PLAYERS.map(n => [n.toLowerCase().replace(/[^a-z0-9]/g, ""), n]));
const fxCode = c => FX_CODE[c] || c;
const fxPlayer = summoner => { const s = String(summoner || "").trim(), i = s.indexOf(" "), raw = i > 0 ? s.slice(i + 1) : s; return FX_NAME[raw.toLowerCase().replace(/[^a-z0-9]/g, "")] || raw; };
const fxPhase = block => { const b = String(block || "").toLowerCase(); return /quarter|quart/.test(b) ? "quarts" : /semi|demi/.test(b) ? "demis" : /final/.test(b) ? "finale" : "swiss"; };
const ROLE_FR = { top: "Top", jungle: "Jungle", mid: "Mid", bottom: "Bot", support: "Support" };

async function leGet(path) { const r = await fetch(LE + path, { headers: { "x-api-key": LE_KEY } }); if (!r.ok) throw new Error("lolesports " + r.status); return r.json(); }
async function liveGet(path) { const r = await fetch(LIVE + path); if (r.status !== 200) return null; const t = await r.text(); if (!t) return null; try { return JSON.parse(t); } catch (e) { return null; } }

// Dernière image d'une game terminée (null si pas encore finie)
async function fxFinal(gameId) {
  const w0 = await liveGet(`/window/${gameId}`); if (!w0?.frames?.length) return null;
  const t0 = Date.parse(w0.frames[0].rfc460Timestamp); let lastTs = null, lastW = null;
  for (let m = 15; m <= 90; m += 5) {
    const ts = new Date(Math.floor((t0 + m * 60e3) / 10000) * 10000).toISOString();
    if (Date.parse(ts) > Date.now()) break;
    const w = await liveGet(`/window/${gameId}?startingTime=${ts}`);
    if (!w?.frames?.length) break;
    lastTs = ts; lastW = w;
    if (w.frames[w.frames.length - 1].gameState === "finished") break;
  }
  if (!lastW) return null;
  const wf = lastW.frames[lastW.frames.length - 1]; if (wf.gameState !== "finished") return null;
  const d = await liveGet(`/details/${gameId}?startingTime=${lastTs}`);
  return { meta: w0.gameMetadata, wf, df: d?.frames?.[d.frames.length - 1] || null, t0 };
}

// Construit le document fantasyGames d'une game terminée
function fxGameDoc(ev, match, game, fin) {
  const idCode = Object.fromEntries((match.teams || []).map(t => [t.id, fxCode(t.code)]));
  const sideTeam = { blue: idCode[fin.meta.blueTeamMetadata.esportsTeamId], red: idCode[fin.meta.redTeamMetadata.esportsTeamId] };
  const bo = match.strategy?.count || 1;
  let winner = null;
  if (bo === 1) { const w = (match.teams || []).find(t => t.result?.outcome === "win"); winner = w ? fxCode(w.code) : null; }
  if (!winner) { const b = fin.wf.blueTeam, r = fin.wf.redTeam; winner = (b.towers - r.towers || b.totalKills - r.totalKills) > 0 ? sideTeam.blue : sideTeam.red; }
  const det = Object.fromEntries((fin.df?.participants || []).map(p => [p.participantId, p]));
  const players = {}, obj = {};
  for (const side of ["blue", "red"]) {
    const team = sideTeam[side], tf = fin.wf[side + "Team"], meta = fin.meta[side + "TeamMetadata"].participantMetadata;
    obj[team] = { drag: (tf.dragons || []).length, baron: tf.barons || 0, towers: tf.towers || 0, kills: tf.totalKills || 0 };
    for (const pm of meta) {
      const p = tf.participants.find(x => x.participantId === pm.participantId) || {}, d = det[pm.participantId] || {};
      players[fxPlayer(pm.summonerName)] = { team, role: ROLE_FR[pm.role] || pm.role, champ: pm.championId, k: p.kills || 0, d: p.deaths || 0, a: p.assists || 0, cs: p.creepScore || 0,
        dmg: Math.round((d.championDamageShare || 0) * 1000) / 1000, kp: Math.round((d.killParticipation || 0) * 1000) / 1000, wp: d.wardsPlaced || 0, wk: d.wardsDestroyed || 0, gold: p.totalGold || 0, win: team === winner };
    }
  }
  const teams = (match.teams || []).map(t => fxCode(t.code));
  return { phase: fxPhase(ev.blockName), at: Date.parse(fin.wf.rfc460Timestamp), start: fin.t0, label: `${{ swiss: "Phase suisse", quarts: "Quarts de finale", demis: "Demi-finales", finale: "Finale" }[fxPhase(ev.blockName)]}${bo > 1 ? " · game " + game.number : ""}`,
    teams, winner, bo, n: game.number, obj, players, src: "lolesports", gameId: game.id, matchId: match.id };
}

// MVP officiel depuis Leaguepedia (une requête pour toutes les games récentes sans MVP)
async function fxMvps(env, games, tk, log) {
  const need = games.filter(g => !g.mvp && g.src === "lolesports" && Date.now() - g.at < 4 * 86400e3);
  if (!need.length) return;
  const last = env.CDS_KV ? +(await env.CDS_KV.get("fx-lp-last")) || 0 : 0;
  if (Date.now() - last < 20 * 60e3) return;                   // Leaguepedia limite fort : au plus toutes les 20 min
  if (env.CDS_KV) await env.CDS_KV.put("fx-lp-last", String(Date.now()));
  const since = new Date(Math.min(...need.map(g => g.at)) - 36 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
  const q = new URLSearchParams({ action: "cargoquery", format: "json", tables: "MatchSchedule=MS,MatchScheduleGame=MSG", join_on: "MS.MatchId=MSG.MatchId",
    fields: "MS.Team1,MS.Team2,MS.DateTime_UTC=DT,MSG.N_GameInMatch=N,MSG.MVP", where: `MS.DateTime_UTC >= '${since}' AND MS.OverviewPage LIKE 'Season World Championship/2026%'`, limit: "100" });
  const r = await fetch("https://lol.fandom.com/api.php?" + q, { headers: { "User-Agent": "CDS-TV fan site (Conseil des Sages)" } });
  const j = await r.json().catch(() => null);
  if (!j?.cargoquery) { log.push("MVP Leaguepedia : " + (j?.error?.code || r.status)); return; }
  for (const row of j.cargoquery.map(x => x.title)) {
    if (!row.MVP) continue;
    const a = FX_LP_TEAMS[row.Team1], b = FX_LP_TEAMS[row.Team2], n = +row.N || 1, dt = Date.parse(row.DT.replace(" ", "T") + "Z");
    const g = need.find(x => x.teams.includes(a) && x.teams.includes(b) && (x.n || 1) === n && Math.abs(x.start - dt) < 12 * 3600e3);
    if (!g) continue;
    const mvp = fxPlayer("x " + row.MVP.replace(/\s*\(.*\)\s*$/, ""));
    const res = await fsPatch(`fantasyGames/${g.id}`, { mvp }, tk);
    log.push(`MVP ${g.teams.join("-")} game ${n} : ${mvp}${res.ok ? "" : " (échec " + res.status + ")"}`);
  }
}


// Résultats des matchs (Matchs & pronos, Pick'em) depuis lolesports, sans dépendre de Leaguepedia
async function resultsRun(env, tk, sch, log) {
  const raw = await fsGetRaw("results/state", tk); if (!raw?.fields?.matches) return;
  const matches = fromFs(raw.fields.matches) || []; let changed = 0; const used = new Set();
  const evs = (sch.data?.schedule?.events || []).filter(e => e.type === "match" && Math.abs(Date.parse(e.startTime) - Date.now()) < 12 * 86400e3);
  for (const ev of evs) {
    const ts = ev.match?.teams || []; if (ts.length !== 2) continue;
    const codes = ts.map(t => fxCode(t.code)); if (codes.some(c => !c || c === "TBD")) continue;
    const t = Date.parse(ev.startTime);
    let m = matches.find(x => !used.has(x.id) && ((x.a === codes[0] && x.b === codes[1]) || (x.a === codes[1] && x.b === codes[0])) && Math.abs(Date.parse(x.date) - t) < 2 * 86400e3);
    if (!m) m = matches.find(x => !used.has(x.id) && x.a === "TBD" && x.b === "TBD" && Math.abs(Date.parse(x.date) - t) < 45 * 60e3);
    if (!m) continue; used.add(m.id);
    const flip = m.a === codes[1] && m.b === codes[0];
    const A = flip ? ts[1] : ts[0], B = flip ? ts[0] : ts[1];
    const upd = { a: fxCode(A.code), b: fxCode(B.code), sa: A.result?.gameWins || 0, sb: B.result?.gameWins || 0,
      status: ev.state === "completed" ? "done" : ev.state === "inProgress" ? "live" : "upcoming",
      winner: ev.state === "completed" ? (A.result?.outcome === "win" ? fxCode(A.code) : B.result?.outcome === "win" ? fxCode(B.code) : null) : null,
      bo: ev.match.strategy?.count || m.bo || 1 };
    if (Object.keys(upd).some(k => String(m[k] ?? "") !== String(upd[k] ?? ""))) { Object.assign(m, upd); changed++; }
  }
  if (!changed) return;
  const res = await fsPatch("results/state", { matches, updatedAt: new Date().toISOString() }, tk);
  log.push(`Résultats : ${changed} match(s) mis à jour${res.ok ? "" : " (échec " + res.status + ")"}`);
}

async function fantasyRun(env, log = []) {
  const tk = (await fbToken(env)).token;
  const sch = await leGet(`/getSchedule?hl=en-US&leagueId=${FX_LEAGUE}`);
  await resultsRun(env, tk, sch, log).catch(e => log.push("Résultats : " + e.message));
  const evs = (sch.data?.schedule?.events || []).filter(e => e.type === "match" && e.state !== "unstarted" && Date.now() - Date.parse(e.startTime) < 3 * 86400e3 && Date.parse(e.startTime) < Date.now());
  let budget = 4;
  for (const ev of evs) {
    if (budget <= 0) break;
    const kDone = "fx2-match-done:" + ev.match.id;
    if (env.CDS_KV && await env.CDS_KV.get(kDone)) continue;
    const det = await leGet(`/getEventDetails?hl=en-US&id=${ev.match.id}`);
    const match = det.data?.event?.match; if (!match) continue;
    const mFull = { ...match, teams: (ev.match.teams || []).map((t, i) => ({ ...(match.teams?.[i] || {}), ...t, id: match.teams?.[i]?.id || t.id })) };
    let allDone = ev.state === "completed";
    for (const game of match.games || []) {
      if (game.state === "unneeded") continue;
      const kG = "fx2-game:" + game.id;
      if (env.CDS_KV && await env.CDS_KV.get(kG)) continue;
      if (game.state !== "completed" && game.state !== "inProgress") { allDone = false; continue; }
      if (budget <= 0) { allDone = false; break; }
      budget--;
      const fin = await fxFinal(game.id);
      if (!fin) { allDone = false; continue; }
      const doc = fxGameDoc(ev, mFull, game, fin);
      const res = await fsPatch(`fantasyGames/lol_${game.id}`, doc, tk);
      log.push(`${doc.teams.join("-")} game ${doc.n} : ${res.ok ? "enregistrée" : "échec " + res.status}`);
      if (res.ok && env.CDS_KV) await env.CDS_KV.put(kG, "1");
      else allDone = false;
    }
    if (allDone && env.CDS_KV) await env.CDS_KV.put(kDone, "1", { expirationTtl: 30 * 86400 });
  }
  const games = await fsList("fantasyGames", tk);
  await fxMvps(env, games, tk, log).catch(e => log.push("MVP : " + e.message));
  return log;
}

export default {
  async scheduled(event, env, ctx) { KV = env.CDS_KV || null; ctx.waitUntil(event.cron === "3-59/10 * * * *" ? bankRun(env).catch(() => {}).then(() => fantasyRun(env)).catch(e => console.log("fantasy", e.message)) : autoRun(env)); },
  async fetch(request, env) { KV = env.CDS_KV || null;
    if (new URL(request.url).pathname === "/bank") {
      // lancé par la page Banque juste après un achat (et utilisable pour vérifier la banque)
      const origin = request.headers.get("Origin") || "";
      let last = env.CDS_KV ? +(await env.CDS_KV.get("bank-last")) || 0 : 0, wait = 15e3 - (Date.now() - last);
      if (wait > 0) return new Response(JSON.stringify({ log: ["trop tôt"], retryIn: Math.ceil(wait / 1000) }), { headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" } });
      if (env.CDS_KV) await env.CDS_KV.put("bank-last", String(Date.now()));
      const log = await bankRun(env).catch(e => ["erreur : " + e.message]);
      return new Response(JSON.stringify({ log }, null, 1), { headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" } });
    }
    if (new URL(request.url).pathname === "/fantasy") {
      // stats des games de la Fantasy : lancé toutes les 10 min par le cron, et à la main pour vérifier
      const log = await fantasyRun(env).catch(e => ["erreur : " + e.message]);
      return new Response(JSON.stringify({ log }, null, 1), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (new URL(request.url).pathname === "/robot") {
      const log = await autoRun(env).catch(e => ["erreur : " + e.message]);
      return new Response(JSON.stringify({ log }, null, 1), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    const origin = request.headers.get("Origin") || "";
    const headers = { ...cors(origin), "Content-Type": "application/json; charset=utf-8" };
    if (request.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(request.url);
    if (!env.RIOT_KEY) return json({ error: "RIOT_KEY manquante" }, headers, 500, 0);
    const key = env.RIOT_KEY;
    const list = () => [...new Set((url.searchParams.get("players") || "").split(",").map(s => s.trim()).filter(Boolean))].slice(0, MAX_PLAYERS);

    try {
      if (url.pathname === "/live" || url.pathname === "/ranks") {
        const fn = url.pathname === "/live" ? live : ranks;
        const out = {}, errors = {};
        for (const entry of list()) {
          const k = entry.split("|")[0].toLowerCase();
          try { out[k] = await fn(parsePlayer(entry), key); } catch (e) { out[k] = null; errors[k] = String(e.message || e); }
        }
        return json(url.pathname === "/live" ? { games: out, errors, at: Date.now() } : { ranks: out, errors, at: Date.now() }, headers, 200, url.pathname === "/live" ? 30 : 120);
      }
      if (url.pathname === "/week") {
        const since = Math.max(Number(url.searchParams.get("since")) || 0, Date.now() - 8 * 86400e3);
        const out = {}, errors = {}, budget = { n: 20 };
        for (const entry of list()) {
          const k = entry.split("|")[0].toLowerCase();
          try { out[k] = await weekStats(parsePlayer(entry), since, key, budget); } catch (e) { out[k] = null; errors[k] = String(e.message || e); }
        }
        return json({ week: out, errors, since, at: Date.now() }, headers, 200, 60);
      }
      if (url.pathname === "/result") {
        const pl = parsePlayer(url.searchParams.get("player") || "");
        const r = await result(pl, url.searchParams.get("gameId"), Number(url.searchParams.get("after")) || Date.now() - 3600e3, key);
        return json(r, headers, 200, r.done ? 3600 : 30);
      }
      if (url.pathname === "/clash") {
        const p = (url.searchParams.get("platform") || "euw1").toLowerCase();
        if (!PLATFORM_TO_REGION[p]) return json({ error: "Région inconnue" }, headers, 400, 0);
        return json({ tournaments: await clash(p, key) }, headers, 200, 600);
      }
      return json({ ok: true, routes: ["/live", "/ranks", "/week", "/result", "/clash"] }, headers, 200, 60);
    } catch (e) {
      return json({ error: String(e.message || e) }, headers, 502, 0);
    }
  },
};
