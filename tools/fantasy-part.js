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
  return { phase: fxPhase(ev.blockName), at: Date.parse(fin.wf.rfc460Timestamp), start: fin.t0, label: `${ev.blockName || "Worlds"}${bo > 1 ? " · game " + game.number : ""}`,
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

async function fantasyRun(env, log = []) {
  const tk = (await fbToken(env)).token;
  const sch = await leGet(`/getSchedule?hl=en-US&leagueId=${FX_LEAGUE}`);
  const evs = (sch.data?.schedule?.events || []).filter(e => e.type === "match" && e.state !== "unstarted" && Date.now() - Date.parse(e.startTime) < 3 * 86400e3 && Date.parse(e.startTime) < Date.now());
  let budget = 4;
  for (const ev of evs) {
    if (budget <= 0) break;
    const kDone = "fx-match-done:" + ev.match.id;
    if (env.CDS_KV && await env.CDS_KV.get(kDone)) continue;
    const det = await leGet(`/getEventDetails?hl=en-US&id=${ev.match.id}`);
    const match = det.data?.event?.match; if (!match) continue;
    const mFull = { ...match, teams: (ev.match.teams || []).map((t, i) => ({ ...(match.teams?.[i] || {}), ...t, id: match.teams?.[i]?.id || t.id })) };
    let allDone = ev.state === "completed";
    for (const game of match.games || []) {
      if (game.state === "unneeded") continue;
      const kG = "fx-game:" + game.id;
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
