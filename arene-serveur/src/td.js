// ===================== Défense du Nexus : simulation du tower defense en coop (autorité du serveur) =====================
// Les joueurs dirigent un champion (2 sorts + attaque automatique) et posent des tourelles sur des emplacements.
// Les vagues du Néant et les monstres de la Faille suivent des chemins jusqu'au Nexus.
import { CHAMPS as AR, CHAMP_IDS } from "./sim.js";

export const DT = 1 / 30;
export { CHAMP_IDS };
export const MAP = { W: 1800, H: 1300, nexus: [0, 980], nexusHp: 30 };
export const ARENA = { maxPlayers: 4, wins: 0, R: 0 };   // pour le salon commun avec l'arène
export const FLASH = { range: 400, cd: 15 };

const hyp = Math.hypot, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function norm(dx, dy) { const d = hyp(dx, dy) || 1; return [dx / d, dy / d, d]; }
function segDist(px, py, ax, ay, bx, by) { const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1, t = clamp(((px - ax) * vx + (py - ay) * vy) / L, 0, 1); return [hyp(px - ax - vx * t, py - ay - vy * t), ax + vx * t, ay + vy * t, t]; }
// chemins : du portail du Néant au Nexus
export const LANES = [
  [[-1500, -1080], [-1500, -300], [-820, -300], [-820, 380], [0, 380], [0, 900]],
  [[1500, -1080], [1500, -680], [620, -680], [620, 380], [0, 380], [0, 900]],
  [[0, -1150], [0, -760], [-260, -760], [-260, 380], [0, 380], [0, 900]],
];
const LEN = LANES.map(L => { const segs = []; let tot = 0; for (let i = 1; i < L.length; i++) { const l = Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); segs.push(l); tot += l; } return { segs, tot }; });
function lanePos(li, d, off) {
  const L = LANES[li], { segs } = LEN[li]; let i = 0; while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
  const a = L[i], b = L[i + 1], u = Math.min(1, Math.max(0, d / segs[i])), dx = (b[0] - a[0]) / segs[i], dy = (b[1] - a[1]) / segs[i];
  return [a[0] + (b[0] - a[0]) * u - dy * off, a[1] + (b[1] - a[1]) * u + dx * off, Math.atan2(dy, dx)];
}
// emplacements de tourelles : le long des chemins, à distance des routes
export const PADS = (() => {
  const out = [], near = (x, y, m) => LANES.some((L, li) => { for (let i = 1; i < L.length; i++) if (segDist(x, y, L[i - 1][0], L[i - 1][1], L[i][0], L[i][1])[0] < m) return true; return false; });
  LANES.forEach((L, li) => { for (let d = 260, k = 0; d < LEN[li].tot - 160; d += 330, k++) { for (const side of [1, -1]) { const [x, y] = lanePos(li, d, 215 * side);
    if (Math.abs(x) > MAP.W - 120 || Math.abs(y) > MAP.H - 120 || near(x, y, 170) || Math.hypot(x - MAP.nexus[0], y - MAP.nexus[1]) < 260) continue;
    if (out.some(p => Math.hypot(p[0] - x, p[1] - y) < 260)) continue; out.push([Math.round(x), Math.round(y)]); } } });
  return out;
})();

// tourelles : coût de chaque niveau, dégâts, portée, cadence (s)
export const TOWERS = {
  tour:  { name: "Tourelle", cost: [150, 120, 220], dmg: [32, 58, 100], range: [700, 760, 830], rate: [1, .9, .8] },
  explo: { name: "Tourelle explosive", cost: [175, 150, 260], dmg: [26, 46, 80], range: [620, 660, 700], rate: [1.6, 1.5, 1.4], splash: 190 },
  sable: { name: "Soldats de sable", cost: [125, 110, 200], dmg: [11, 19, 32], range: [430, 460, 500], rate: [.42, .38, .34] },
  givre: { name: "Fleur de givre", cost: [100, 100, 170], dmg: [4, 7, 12], range: [380, 420, 470], rate: [.5, .5, .5], slow: [.65, .55, .45] },
};
// monstres : pv, vitesse, rayon, or, dégâts au Nexus, dégâts aux champions
export const MONS = {
  voidspawn: { hp: 40, spd: 170, r: 32, gold: 4, leak: 1, dmg: 6 },
  voidling:  { hp: 62, spd: 145, r: 38, gold: 5, leak: 1, dmg: 8 },
  voidmite:  { hp: 32, spd: 235, r: 30, gold: 4, leak: 1, dmg: 5 },
  minB:      { hp: 95, spd: 150, r: 42, gold: 7, leak: 1, dmg: 9 },
  minR:      { hp: 135, spd: 140, r: 44, gold: 9, leak: 1, dmg: 11 },
  raptorS:   { hp: 52, spd: 220, r: 36, gold: 5, leak: 1, dmg: 7 },
  wolfS:     { hp: 85, spd: 195, r: 42, gold: 7, leak: 1, dmg: 9 },
  krug3:     { hp: 360, spd: 95, r: 70, gold: 18, leak: 3, dmg: 18, split: ["krug2", 2] },
  krug2:     { hp: 150, spd: 115, r: 52, gold: 8, leak: 2, dmg: 12, split: ["krug1", 2] },
  krug1:     { hp: 60, spd: 135, r: 34, gold: 3, leak: 1, dmg: 7 },
  gromp:     { hp: 260, spd: 110, r: 64, gold: 18, leak: 2, dmg: 16 },
  superB:    { hp: 520, spd: 112, r: 66, gold: 30, leak: 3, dmg: 22 },
  superR:    { hp: 440, spd: 118, r: 64, gold: 28, leak: 3, dmg: 24 },
  herald:    { hp: 3200, spd: 95, r: 120, gold: 150, leak: 10, dmg: 40, boss: 1 },
  dragon:    { hp: 4200, spd: 90, r: 130, gold: 200, leak: 12, dmg: 45, boss: 1 },
  atakhan:   { hp: 6500, spd: 80, r: 150, gold: 300, leak: 15, dmg: 55, boss: 1 },
  baron:     { hp: 9500, spd: 70, r: 170, gold: 500, leak: 30, dmg: 65, boss: 1 },
};
const DRAGONS = ["infernal", "ocean", "nuage", "montagne", "hextech", "chemtech"];
// les 20 vagues : [type, nombre, intervalle (s), chemin (0 gauche, 1 droite, 2 milieu, -1 alterné)]
export const WAVES = [
  [["voidspawn", 10, .9, -1]],
  [["voidling", 12, .8, -1], ["voidspawn", 4, .6, -1]],
  [["minB", 8, 1, -1], ["voidmite", 6, .5, -1]],
  [["raptorS", 10, .6, -1], ["voidling", 6, .7, -1]],
  [["herald", 1, 0, 0], ["voidling", 10, .8, -1]],
  [["minR", 8, 1, -1], ["superB", 2, 3, 2], ["voidspawn", 8, .5, 2]],
  [["voidmite", 14, .4, -1], ["wolfS", 6, .8, -1]],
  [["krug3", 4, 3, -1], ["voidling", 10, .6, -1]],
  [["gromp", 4, 2.2, -1], ["minB", 8, .8, -1], ["superR", 2, 3, 2]],
  [["dragon", 1, 0, 2], ["voidling", 8, .6, 0], ["voidspawn", 8, .6, 1]],
  [["voidspawn", 20, .35, -1], ["superB", 4, 2.5, -1]],
  [["wolfS", 6, .6, 0], ["raptorS", 6, .6, 1], ["voidmite", 8, .4, 2]],
  [["superR", 6, 2, -1], ["minR", 10, .7, -1]],
  [["krug3", 4, 2.5, -1], ["gromp", 4, 2, -1], ["voidling", 12, .5, -1]],
  [["atakhan", 1, 0, 2], ["minB", 10, .6, -1], ["voidmite", 8, .4, -1]],
  [["voidmite", 25, .3, -1]],
  [["superB", 8, 1.5, -1], ["superR", 8, 1.5, -1]],
  [["dragon", 2, 8, -1], ["wolfS", 10, .6, -1]],
  [["voidling", 15, .35, -1], ["minR", 10, .6, -1], ["krug3", 4, 2, -1], ["superB", 4, 2, 2]],
  [["baron", 1, 0, 2], ["superR", 6, 2, -1], ["voidling", 16, .4, -1]],
];
// au-delà de la vague 20 (mode infini) : vagues tirées au hasard, de plus en plus fournies, un boss toutes les 5 vagues
function genWave(n, rand) {
  const pool = ["voidspawn", "voidling", "voidmite", "minB", "minR", "raptorS", "wolfS", "krug3", "gromp", "superB", "superR"], g = [];
  const k = 2 + Math.floor(rand() * 2); for (let i = 0; i < k; i++) { const t = pool[Math.floor(rand() * pool.length)], big = ["krug3", "gromp", "superB", "superR"].includes(t);
    g.push([t, Math.round((big ? 4 : 12) * (1 + (n - 20) * .08)), big ? 1.6 : .4, -1]); }
  if (n % 5 === 0) g.unshift([["herald", "dragon", "atakhan", "baron"][Math.floor(n / 5) % 4], 1 + Math.floor((n - 20) / 20), 6, 2]);
  return g;
}
const BUILD_FIRST = 25, BUILD_T = 15, END_T = 12;

// champions : pv plus hauts que dans l'arène, attaque automatique (portée, dégâts de base)
const AUTO = { Ashe: [620, 13], Diana: [190, 19], Azir: [560, 13], Gangplank: [470, 15], Kled: [200, 19], Galio: [210, 20], Mordekaiser: [220, 21], Tryndamere: [200, 22], Graves: [460, 16] };
export const CHAMPS = Object.fromEntries(CHAMP_IDS.map(id => [id, { ...AR[id], hp: Math.round(AR[id].hp * 2.6), auto: AUTO[id] }]));

export function createSim(rand = Math.random) {
  return { T: 0, players: new Map(), mons: [], proj: [], areas: [], towers: new Map(), timers: [], E: [], uid: 1, phase: "lobby", phaseT: 0, wave: 0, spawnQ: [], nexus: MAP.nexusHp, rand, opts: { mode: "20" }, result: null };
}
export function addPlayer(S, id, name, champ, bot = false) {
  const P = { id, name: String(name || "Invocateur").slice(0, 18), champ: CHAMPS[champ] ? champ : "Ashe", bot: false, x: 0, y: 0, face: 0, hp: 0, mhp: 1, r: 55, spd: 340, alive: false,
    cd: { q: 0, e: 0, f: 0 }, mv: null, to: null, aim: [0, 0], st: {}, force: null, gold: 0, wins: 0, kills: 0, deaths: 0, dmg: 0, built: 0, ready: false, respawnAt: 0, atkT: 0, lastHurt: 0 };
  S.players.set(id, P); if (S.phase !== "lobby") spawnPlayer(S, P, true); return P;
}
export function setChamp(P, c) { if (CHAMPS[c]) P.champ = c; }
export function setOpts(S, o) { if (S.phase === "lobby" && (o.mode === "20" || o.mode === "inf")) S.opts.mode = o.mode; }
function spawnPlayer(S, P, fresh) {
  const C = CHAMPS[P.champ], n = [...S.players.keys()].indexOf(P.id);
  Object.assign(P, { x: MAP.nexus[0] - 150 + n * 100, y: MAP.nexus[1] - 220, hp: C.hp, mhp: C.hp, r: C.rad, spd: C.spd, alive: true, mv: null, to: null, st: {}, force: null });
  if (fresh) { P.cd = { q: S.T + 1, e: S.T + 4, f: S.T + 2 }; P.gold = 250; }
}
const nP = S => Math.max(1, S.players.size);
const power = S => 1 + .1 * Math.max(0, S.wave - 1);

// ---------- déroulé ----------
export function startMatch(S) {
  S.wave = 0; S.mons = []; S.proj = []; S.areas = []; S.towers = new Map(); S.timers = []; S.spawnQ = []; S.nexus = MAP.nexusHp; S.result = null;
  for (const P of S.players.values()) { P.kills = 0; P.deaths = 0; P.dmg = 0; P.built = 0; spawnPlayer(S, P, true); P.ready = false; }
  S.phase = "build"; S.phaseT = S.T + BUILD_FIRST; S.E.push(["build", 1, BUILD_FIRST]);
}
function startWave(S) {
  S.wave++; S.phase = "wave"; for (const P of S.players.values()) P.ready = false;
  const def = S.wave <= WAVES.length ? WAVES[S.wave - 1] : genWave(S.wave, S.rand);
  let t = S.T + 1; const lanes = S.wave >= 6 ? 3 : 2;
  for (const [type, count, gap, lane] of def) { let tt = t; for (let i = 0; i < count; i++) { S.spawnQ.push({ at: tt, type, lane: lane < 0 ? (i % lanes) : lane }); tt += gap; } t += .5; }
  S.spawnQ.sort((a, b) => a.at - b.at);
  S.E.push(["wave", S.wave, def.some(g => MONS[g[0]].boss) ? def.find(g => MONS[g[0]].boss)[0] : null]);
}
function endGame(S, win) {
  S.phase = "end"; S.phaseT = S.T + END_T; S.result = { win, wave: win ? S.wave : S.wave - 1, mode: S.opts.mode };
  S.E.push(["end", win ? 1 : 0, S.result.wave]);
}
// les joueurs prêts lancent la vague sans attendre la fin du compte à rebours
// test local uniquement (DEV) : or et saut de vague
export function cheat(S, P, m) { if (m.gold) P.gold += +m.gold || 0; if (m.wave && S.phase === "build") { S.wave = Math.max(0, (+m.wave || 1) - 1); S.phaseT = S.T + .3; } }
export function action(S, P, m) {
  if (m.t === "go" && S.phase === "build") { P.ready = true; const all = [...S.players.values()].every(p => p.ready); if (all) S.phaseT = Math.min(S.phaseT, S.T + .5); S.E.push(["ready", P.id]); return; }
  if (m.t === "b") return build(S, P, +m.pad, String(m.k));
  if (m.t === "u") return upgrade(S, P, +m.pad);
  if (m.t === "sell") return sell(S, P, +m.pad);
}
function build(S, P, pad, k) {
  if (!(S.phase === "build" || S.phase === "wave") || !PADS[pad] || S.towers.has(pad) || !TOWERS[k]) return;
  const c = TOWERS[k].cost[0]; if (P.gold < c) return S.E.push(["msg", P.id, "Pas assez d'or"]);
  P.gold -= c; P.built++; S.towers.set(pad, { id: S.uid++, pad, k, lvl: 0, owner: P.id, cd: 0, face: 0, spent: c });
  S.E.push(["tb", pad, k, P.id]);
}
function upgrade(S, P, pad) {
  const T = S.towers.get(pad); if (!T || T.lvl >= 2) return; const c = TOWERS[T.k].cost[T.lvl + 1]; if (P.gold < c) return S.E.push(["msg", P.id, "Pas assez d'or"]);
  P.gold -= c; T.lvl++; T.spent += c; S.E.push(["tu", pad, T.lvl, P.id]);
}
function sell(S, P, pad) {
  const T = S.towers.get(pad); if (!T) return; P.gold += Math.floor(T.spent * .7); S.towers.delete(pad); S.E.push(["ts", pad]);
}

// ---------- monstres ----------
function spawnMon(S, type, lane, d = 0, off = null) {
  const M = MONS[type], sc = (1 + .13 * Math.max(0, S.wave - 1)) * (.55 + .45 * nP(S)) * (S.wave > 20 ? 1 + (S.wave - 20) * .06 : 1);
  const m = { id: S.uid++, type, lane, d, off: off ?? (S.rand() - .5) * 90, hp: M.hp * sc, mhp: M.hp * sc, spd: M.spd, r: M.r, gold: M.gold, leak: M.leak, dmg: M.dmg * (1 + .05 * S.wave), boss: !!M.boss,
    x: 0, y: 0, face: 0, st: {}, atkT: 0, skillT: S.T + 4, sub: type === "dragon" ? DRAGONS[Math.floor(S.rand() * DRAGONS.length)] : 0 };
  [m.x, m.y, m.face] = lanePos(lane, d, m.off); S.mons.push(m);
  if (m.boss) S.E.push(["boss", m.id, type, m.sub || 0]);
  return m;
}
export function hurtMon(S, m, amt, src) {
  if (m.dead || amt <= 0) return; m.hp -= amt; if (src && src.dmg != null) src.dmg += amt;
  S.E.push(["md", m.id, Math.round(amt)]);
  if (m.hp <= 0) killMon(S, m, src);
}
function killMon(S, m, src) {
  m.dead = true; m.hp = 0; S.E.push(["mk", m.id]);
  if (src && src.kills != null) src.kills++;
  // l'or est partagé : chaque joueur touche sa part
  const each = Math.max(1, Math.round(m.gold / Math.pow(nP(S), .8))); for (const P of S.players.values()) P.gold += each;
  const sp = MONS[m.type].split; if (sp) for (let i = 0; i < sp[1]; i++) spawnMon(S, sp[0], m.lane, Math.max(0, m.d - 30 * i), m.off + (i ? 40 : -40));
}
const slowMon = (S, m, f, d) => { if (!(m.st.slowU > S.T) || f < m.st.slowM) m.st.slowM = f; m.st.slowU = Math.max(m.st.slowU || 0, S.T + d); };
const stunMon = (S, m, d) => { m.st.stunU = Math.max(m.st.stunU || 0, S.T + (m.boss ? d * .4 : d)); };
const pushMon = (S, m, dist) => { m.d = Math.max(0, m.d - (m.boss ? dist * .3 : dist)); };
const alive = S => S.mons.filter(m => !m.dead);
const monsIn = (S, x, y, r) => alive(S).filter(m => hyp(m.x - x, m.y - y) < r + m.r * .6);
function monsRect(S, x0, y0, a, len, w) { const ex = x0 + Math.cos(a) * len, ey = y0 + Math.sin(a) * len; return alive(S).filter(m => segDist(m.x, m.y, x0, y0, ex, ey)[0] < w / 2 + m.r * .6); }
function stepMons(S) {
  for (const m of S.mons) {
    if (m.dead) continue;
    let sp = m.spd * (m.st.slowU > S.T ? m.st.slowM : 1); if (m.st.stunU > S.T) sp = 0;
    // un champion au contact : le monstre frappe en passant
    let fighting = false;
    for (const P of S.players.values()) { if (!P.alive || P.st.untargU > S.T) continue; if (hyp(P.x - m.x, P.y - m.y) < m.r + P.r + 25) { fighting = true; if (S.T >= m.atkT && sp > 0) { m.atkT = S.T + (m.boss ? 1.4 : 1); hurtPlayer(S, P, m.dmg); S.E.push(["ma", m.id, P.id]); } } }
    if (fighting && !m.boss) sp *= .35;
    // boss : coup de zone régulier
    if (m.boss && S.T >= m.skillT) { m.skillT = S.T + 5; S.E.push(["slam", m.id, Math.round(m.x), Math.round(m.y), 320]); for (const P of S.players.values()) if (P.alive && hyp(P.x - m.x, P.y - m.y) < 320 + P.r) { hurtPlayer(S, P, m.dmg * 1.2); stunP(S, P, .6); } }
    m.d += sp * DT; [m.x, m.y, m.face] = lanePos(m.lane, m.d, m.off);
    if (m.d >= LEN[m.lane].tot) { m.dead = true; S.nexus -= m.leak; S.E.push(["leak", m.id, m.leak]); if (S.nexus <= 0) { S.nexus = 0; endGame(S, false); return; } }
  }
  S.mons = S.mons.filter(m => !m.dead);
}

// ---------- champions ----------
function hurtPlayer(S, P, amt) {
  if (!P.alive || P.st.untargU > S.T) return;
  if (P.st.shieldU > S.T && P.st.shield > 0) { const a = Math.min(P.st.shield, amt); P.st.shield -= a; amt -= a; }
  P.hp -= amt; P.lastHurt = S.T; if (P.st.undyingU > S.T && P.hp < 1) P.hp = 1;
  S.E.push(["dmg", P.id, Math.round(amt), null]);
  if (P.hp <= 0) { P.hp = 0; P.alive = false; P.force = null; P.deaths++; P.respawnAt = S.T + 6 + S.wave * .25; S.E.push(["die", P.id, null, Math.round(P.respawnAt - S.T)]); }
}
const stunP = (S, P, d) => { if (P.st.unstopU > S.T) return; P.st.stunU = Math.max(P.st.stunU || 0, S.T + d); P.to = null; };
const shieldP = (S, P, a, d) => { P.st.shield = (P.st.shieldU > S.T ? P.st.shield : 0) + a; P.st.shieldU = S.T + d; };
function clampMap(x, y, r = 55) { return [clamp(x, -MAP.W + r, MAP.W - r), clamp(y, -MAP.H + r, MAP.H - r)]; }
const later = (S, d, fn) => S.timers.push({ at: S.T + d, fn });
const fx = (S, ...a) => S.E.push(["fx", ...a]);
function shoot(S, P, kind, ang, o) {
  const p = { id: S.uid++, kind, owner: P.id, x: P.x + Math.cos(ang) * 40, y: P.y + Math.sin(ang) * 40, vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed, w: o.w || 50, left: o.range, hit: new Set(), pierce: !!o.pierce, onHit: o.onHit, onEnd: o.onEnd };
  S.proj.push(p); return p;
}
function stepProj(S) {
  const keep = [];
  for (const p of S.proj) { let dead = false; const sub = 3, sx = p.vx * DT / sub, sy = p.vy * DT / sub, sl = hyp(sx, sy);
    for (let i = 0; i < sub && !dead; i++) { p.x += sx; p.y += sy; p.left -= sl;
      for (const m of S.mons) { if (m.dead || p.hit.has(m.id)) continue; if (hyp(m.x - p.x, m.y - p.y) < m.r + p.w / 2) { p.hit.add(m.id); if (p.onHit) p.onHit(m, p); if (!p.pierce) { dead = true; break; } } }
      if (p.left <= 0 || Math.abs(p.x) > MAP.W + 200 || Math.abs(p.y) > MAP.H + 200) dead = true; }
    if (dead) { if (p.onEnd) p.onEnd(p); S.E.push(["pend", p.id, Math.round(p.x), Math.round(p.y)]); } else keep.push(p); }
  S.proj = keep;
}
function dashTo(S, P, tx, ty, speed, o = {}) { const [ex, ey] = clampMap(tx, ty, P.r), d = hyp(ex - P.x, ey - P.y); P.force = { kind: "dash", sx: P.x, sy: P.y, ex, ey, t0: S.T, dur: Math.max(.05, d / speed), hits: new Set(), ...o }; P.to = null; }
function stepForce(S, P) {
  const F = P.force, u = clamp((S.T - F.t0) / F.dur, 0, 1), ox = P.x, oy = P.y; P.x = F.sx + (F.ex - F.sx) * u; P.y = F.sy + (F.ey - F.sy) * u;
  if (F.kind === "dash") { P.face = Math.atan2(F.ey - F.sy, F.ex - F.sx);
    if (F.hitR) for (const m of alive(S)) { if (F.hits.has(m.id)) continue; if (segDist(m.x, m.y, ox, oy, P.x, P.y)[0] < F.hitR + m.r * .5) { F.hits.add(m.id); if (F.dmg) hurtMon(S, m, F.dmg, P); if (F.onPass) F.onPass(m);
      if (F.stopOn) { P.force = null; if (F.onHitStop) F.onHitStop(m); return; } } } }
  if (u >= 1) { P.force = null; if (F.onEnd) F.onEnd(); }
}
// sorts : Q rapide, E puissant (mêmes formes que dans l'arène, contre les monstres)
const KITS = {
  Ashe: { q(S, P, a) { const pw = power(S); later(S, .12, () => { for (let i = -3; i <= 3; i++) shoot(S, P, "arrow", a + i * .145, { speed: 1500, range: 1000, w: 50, onHit: m => { hurtMon(S, m, 18 * pw, P); slowMon(S, m, .6, 1.5); } }); }); },
    e(S, P, a) { const pw = power(S); later(S, .12, () => shoot(S, P, "crystal", a, { speed: 1400, range: 2400, w: 170, pierce: true, onHit: m => { hurtMon(S, m, 70 * pw, P); stunMon(S, m, 1.6); fx(S, "frost", Math.round(m.x), Math.round(m.y), 200); } })); } },
  Diana: { q(S, P, a, tx, ty) { const pw = power(S); later(S, .12, () => shoot(S, P, "moon", a, { speed: 1250, range: Math.max(200, hyp(tx - P.x, ty - P.y)), w: 80, pierce: true, onHit: m => hurtMon(S, m, 26 * pw, P),
      onEnd: p => { fx(S, "moonburst", Math.round(p.x), Math.round(p.y), 190); monsIn(S, p.x, p.y, 190).forEach(m => hurtMon(S, m, 30 * pw, P)); } })); },
    e(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1600, { hitR: 120, dmg: 34 * power(S), onEnd() { fx(S, "moonblast", Math.round(P.x), Math.round(P.y), 220); monsIn(S, P.x, P.y, 220).forEach(m => hurtMon(S, m, 20 * power(S), P)); } }); } },
  Azir: { q(S, P, a, tx, ty) { const x0 = P.x, y0 = P.y, len = Math.max(250, hyp(tx - x0, ty - y0)), pw = power(S); fx(S, "tele", "rect", Math.round(x0), Math.round(y0), +a.toFixed(3), Math.round(len), 140, .35);
      later(S, .35, () => { fx(S, "spears", Math.round(x0), Math.round(y0), +a.toFixed(3), Math.round(len)); for (const m of monsRect(S, x0, y0, a, len, 160)) { hurtMon(S, m, 40 * pw, P); pushMon(S, m, 70); } }); },
    e(S, P, a) { const pw = power(S); later(S, .12, () => { const cx = P.x + Math.cos(a) * 260, cy = P.y + Math.sin(a) * 260, px = -Math.sin(a), py = Math.cos(a), L = 310;
      fx(S, "wall", S.uid++, Math.round(cx + px * L), Math.round(cy + py * L), Math.round(cx - px * L), Math.round(cy - py * L), 3);
      for (const m of alive(S)) { const al = (m.x - P.x) * Math.cos(a) + (m.y - P.y) * Math.sin(a), lat = Math.abs((m.x - P.x) * px + (m.y - P.y) * py); if (al > -60 && al < 440 && lat < L + m.r) { hurtMon(S, m, 55 * pw, P); pushMon(S, m, 320); stunMon(S, m, 1.5); } } }); } },
  Gangplank: { q(S, P, a) { const pw = power(S); later(S, .12, () => shoot(S, P, "bullet", a, { speed: 2000, range: 700, w: 60, onHit: m => hurtMon(S, m, 45 * pw, P) })); },
    e(S, P, a, tx, ty) { const pw = power(S); later(S, .2, () => S.areas.push({ id: S.uid++, kind: "barrage", owner: P.id, x: tx, y: ty, r: 450, until: S.T + 3, tick: S.T + .3, dmg: 13 * pw })); } },
  Kled: { q(S, P, a) { const pw = power(S); later(S, .12, () => shoot(S, P, "trap", a, { speed: 1400, range: 800, w: 85, onHit: m => { hurtMon(S, m, 30 * pw, P); const tid = S.uid++; S.E.push(["tether", tid, P.id, -m.id, 1.6]);
      later(S, 1.6, () => { if (m.dead || !P.alive) return; hurtMon(S, m, 35 * power(S), P); stunMon(S, m, 1); pushMon(S, m, 200); }); } })); },
    e(S, P, a) { P.st.unstopU = S.T + 1.6; const pw = power(S); dashTo(S, P, P.x + Math.cos(a) * 1500, P.y + Math.sin(a) * 1500, 1050, { stopOn: true, hitR: 80,
      onHitStop() { fx(S, "charge", Math.round(P.x), Math.round(P.y), 240); monsIn(S, P.x, P.y, 240).forEach(m => { hurtMon(S, m, 70 * pw, P); pushMon(S, m, 180); stunMon(S, m, .8); }); shieldP(S, P, 60, 4); S.E.push(["act", P.id, "ultEnd"]); },
      onEnd() { S.E.push(["act", P.id, "ultEnd"]); } }); } },
  Galio: { q(S, P, a, tx, ty) { const pw = power(S); later(S, .12, () => shoot(S, P, "wind", a, { speed: 1200, range: Math.max(200, hyp(tx - P.x, ty - P.y)), w: 90, pierce: true, onHit: m => hurtMon(S, m, 22 * pw, P),
      onEnd: p => S.areas.push({ id: S.uid++, kind: "tornado", owner: P.id, x: p.x, y: p.y, r: 230, until: S.T + 2, tick: S.T + .1, dmg: 9 * pw }) })); },
    e(S, P, a, tx, ty) { const pw = power(S); dashTo(S, P, tx, ty, 1500, { stopOn: true, hitR: 100, onHitStop(m) { fx(S, "galioland", Math.round(m.x), Math.round(m.y), 220); monsIn(S, m.x, m.y, 220).forEach(z => { hurtMon(S, z, 45 * pw, P); stunMon(S, z, 1); }); shieldP(S, P, 60, 3); } }); } },
  Mordekaiser: { q(S, P, a) { const x0 = P.x, y0 = P.y, pw = power(S); P.st.rootU = S.T + .3; fx(S, "tele", "rect", Math.round(x0), Math.round(y0), +a.toFixed(3), 600, 180, .5);
      later(S, .5, () => { fx(S, "mace", Math.round(x0), Math.round(y0), +a.toFixed(3), 600); const hit = monsRect(S, x0, y0, a, 600, 190); hit.forEach(m => hurtMon(S, m, (hit.length === 1 ? 80 : 50) * pw, P)); }); },
    e(S, P, a) { const x0 = P.x, y0 = P.y, pw = power(S); fx(S, "tele", "rect", Math.round(x0), Math.round(y0), +a.toFixed(3), 700, 140, .6);
      later(S, .6, () => { fx(S, "grasp", Math.round(x0), Math.round(y0), +a.toFixed(3), 700); for (const m of monsRect(S, x0, y0, a, 700, 150)) { hurtMon(S, m, 35 * pw, P); stunMon(S, m, 1.4); pushMon(S, m, 150); } }); } },
  Tryndamere: { q(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1300, { hitR: 130, dmg: 42 * power(S) }); },
    e(S, P) { P.st.undyingU = S.T + 4; P.st.rageU = S.T + 4; fx(S, "rage", P.id, 4); } },
  Graves: { q(S, P, a) { const x0 = P.x, y0 = P.y, len = 750, pw = power(S); later(S, .12, () => { fx(S, "gline", Math.round(x0), Math.round(y0), +a.toFixed(3), len); for (const m of monsRect(S, x0, y0, a, len, 120)) hurtMon(S, m, 30 * pw, P); });
      later(S, .9, () => { fx(S, "gboom", Math.round(x0), Math.round(y0), +a.toFixed(3), len); for (const m of monsRect(S, x0, y0, a, len, 130)) hurtMon(S, m, 26 * pw, P); }); },
    e(S, P, a) { const pw = power(S); later(S, .08, () => { const bx = P.x - Math.cos(a) * 300, by = P.y - Math.sin(a) * 300; dashTo(S, P, bx, by, 1000); S.E.push(["act", P.id, "ultEnd"]);
      const cone = o => { fx(S, "shellboom", Math.round(o.x), Math.round(o.y), +a.toFixed(3), 420); for (const m of alive(S)) { const dx = m.x - o.x, dy = m.y - o.y, al = dx * Math.cos(a) + dy * Math.sin(a), lat = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); if (al > -40 && al < 420 && lat < 90 + al * .45) hurtMon(S, m, 45 * pw, P); } };
      shoot(S, P, "shell", a, { speed: 1900, range: 1000, w: 110, onHit: (m, p) => { hurtMon(S, m, 90 * pw, P); cone(p); }, onEnd: p => { if (!p.hit.size) cone(p); } }); }); } },
};
export function cast(S, P, k, x, y) {
  if (!(S.phase === "build" || S.phase === "wave") || !P.alive || !["q", "e", "f"].includes(k)) return false;
  if (P.st.stunU > S.T) return false; if (P.force && (k !== "f" || P.force.kind !== "dash")) return false; if (P.cd[k] > S.T + .05) return false;
  x = +x || 0; y = +y || 0; const C = CHAMPS[P.champ], range = k === "f" ? FLASH.range : C[k].range;
  let [nx, ny, d] = norm(x - P.x, y - P.y); if (d < 1) { nx = Math.cos(P.face); ny = Math.sin(P.face); d = 0; }
  const a = Math.atan2(ny, nx), r = range ? Math.min(d, range) : 0, [tx, ty] = clampMap(P.x + nx * r, P.y + ny * r, P.r);
  if (k === "f") { P.force = null; [P.x, P.y] = clampMap(P.x + nx * Math.max(r, 120), P.y + ny * Math.max(r, 120), P.r); P.face = a; P.cd.f = S.T + FLASH.cd; S.E.push(["cast", P.id, "f", Math.round(P.x), Math.round(P.y)]); return true; }
  if (KITS[P.champ][k](S, P, a, tx, ty) === false) return false;
  P.face = a; P.to = null; P.cd[k] = S.T + C[k].cd; S.E.push(["cast", P.id, k, Math.round(tx), Math.round(ty)]);
  if (!P.force) P.st.rootU = Math.max(P.st.rootU || 0, S.T + .12);
  return true;
}
export function input(S, P, m) {
  if (Array.isArray(m.mv)) { const [dx, dy] = m.mv.map(Number), d = hyp(dx, dy); P.mv = d > .01 ? [dx / d, dy / d] : null; if (P.mv) P.to = null; }
  if (Array.isArray(m.to)) { P.to = [clamp(+m.to[0] || 0, -2400, 2400), clamp(+m.to[1] || 0, -2400, 2400)]; P.mv = null; }
  if (m.stop) { P.to = null; P.mv = null; }
}
export function moveSpeed(S, P) { return P.spd * (P.st.slowU > S.T ? P.st.slowM : 1); }

// ---------- un pas de simulation ----------
export function step(S) {
  S.T += DT;
  if (S.phase === "lobby") return;
  if (S.phase === "end") { if (S.T >= S.phaseT) { S.phase = "lobby"; for (const P of S.players.values()) { P.alive = false; P.ready = false; } S.E.push(["lobby"]); } return; }
  if (S.phase === "build" && S.T >= S.phaseT) startWave(S);
  if (S.timers.length) { const due = S.timers.filter(t => t.at <= S.T); S.timers = S.timers.filter(t => t.at > S.T); for (const t of due) t.fn(); }
  // apparitions
  while (S.spawnQ.length && S.spawnQ[0].at <= S.T) { const q = S.spawnQ.shift(); spawnMon(S, q.type, q.lane); }
  for (const P of S.players.values()) {
    if (!P.alive) { if (S.T >= P.respawnAt) { spawnPlayer(S, P, false); S.E.push(["respawn", P.id]); } continue; }
    if (P.force) stepForce(S, P);
    else if (!(P.st.stunU > S.T) && !(P.st.rootU > S.T)) {
      let dx = 0, dy = 0; const sp = moveSpeed(S, P) * DT;
      if (P.mv) { dx = P.mv[0] * sp; dy = P.mv[1] * sp; } else if (P.to) { const [nx, ny, d] = norm(P.to[0] - P.x, P.to[1] - P.y); if (d <= sp) { dx = P.to[0] - P.x; dy = P.to[1] - P.y; P.to = null; } else { dx = nx * sp; dy = ny * sp; } }
      if (dx || dy) { P.x += dx; P.y += dy; P.face = Math.atan2(dy, dx); }
    }
    [P.x, P.y] = clampMap(P.x, P.y, P.r);
    // régénération hors combat
    if (S.T - P.lastHurt > 4 && P.hp < P.mhp) P.hp = Math.min(P.mhp, P.hp + P.mhp * .04 * DT);
    // attaque automatique sur le monstre le plus proche
    const [rng, base] = CHAMPS[P.champ].auto;
    if (S.T >= P.atkT && !P.force) { let best = null, bd = 1e9; for (const m of S.mons) { if (m.dead) continue; const d = hyp(m.x - P.x, m.y - P.y) - m.r; if (d < rng && d < bd) { bd = d; best = m; } }
      if (best) { P.atkT = S.T + (P.st.rageU > S.T ? .45 : .8); const dmg = base * power(S) * (P.st.rageU > S.T ? 1.5 : 1); S.E.push(["aa", P.id, best.id]); if (!(P.mv || P.to)) P.face = Math.atan2(best.y - P.y, best.x - P.x); hurtMon(S, best, dmg, P); } }
  }
  stepProj(S);
  // zones (barrage, tornade)
  for (const A of S.areas) if (S.T >= A.tick) { A.tick += A.kind === "barrage" ? .5 : .4; const owner = S.players.get(A.owner); for (const m of monsIn(S, A.x, A.y, A.r)) { hurtMon(S, m, A.dmg, owner); slowMon(S, m, A.kind === "barrage" ? .65 : .7, .6); } }
  S.areas = S.areas.filter(A => A.until > S.T);
  // tourelles : visent le monstre le plus avancé à portée
  for (const T of S.towers.values()) {
    const D = TOWERS[T.k], [px, py] = PADS[T.pad], rng = D.range[T.lvl], owner = S.players.get(T.owner);
    if (T.k === "givre") { if (S.T >= T.cd) { T.cd = S.T + D.rate[T.lvl]; for (const m of monsIn(S, px, py, rng)) { slowMon(S, m, D.slow[T.lvl], .7); hurtMon(S, m, D.dmg[T.lvl], owner); } } continue; }
    if (S.T < T.cd) continue;
    let best = null, bd = -1; for (const m of S.mons) { if (m.dead) continue; if (hyp(m.x - px, m.y - py) > rng + m.r * .5) continue; const prog = m.d / LEN[m.lane].tot; if (prog > bd) { bd = prog; best = m; } }
    if (!best) continue; T.cd = S.T + D.rate[T.lvl]; T.face = Math.atan2(best.y - py, best.x - px);
    if (T.k === "tour") { S.E.push(["tw", T.pad, best.id]); hurtMon(S, best, D.dmg[T.lvl], owner); }
    else if (T.k === "sable") { S.E.push(["tw", T.pad, best.id]); hurtMon(S, best, D.dmg[T.lvl], owner); }
    else if (T.k === "explo") { const x = best.x, y = best.y, lvl = T.lvl; S.E.push(["tx", T.pad, Math.round(x), Math.round(y)]); later(S, .5, () => { fx(S, "kegboom", Math.round(x), Math.round(y), D.splash); for (const m of monsIn(S, x, y, D.splash)) hurtMon(S, m, D.dmg[lvl], owner); }); }
  }
  stepMons(S); if (S.phase === "end") return;
  // fin de vague : plus rien à faire apparaître ni à tuer
  if (S.phase === "wave" && !S.spawnQ.length && !S.mons.length) {
    const bonus = Math.round((40 + S.wave * 5) / Math.pow(nP(S), .5)); for (const P of S.players.values()) P.gold += bonus;
    S.E.push(["clear", S.wave, bonus]);
    if (S.opts.mode === "20" && S.wave >= WAVES.length) endGame(S, true);
    else { S.phase = "build"; S.phaseT = S.T + BUILD_T; S.E.push(["build", S.wave + 1, BUILD_T]); }
  }
}

export function snapshot(S) {
  const r = Math.round;
  return {
    t: "s", T: +S.T.toFixed(3), ph: S.phase, wave: S.wave, left: +Math.max(0, S.phaseT - S.T).toFixed(1), nexus: S.nexus, mode: S.opts.mode,
    P: [...S.players.values()].map(P => [P.id, r(P.x), r(P.y), r(P.hp), P.mhp, +P.face.toFixed(2), (P.alive ? 1 : 0) | (P.st.stunU > S.T ? 2 : 0) | (P.st.slowU > S.T ? 4 : 0) | (P.st.shieldU > S.T && P.st.shield > 0 ? 8 : 0) | (P.st.undyingU > S.T ? 16 : 0),
      r(P.st.shieldU > S.T ? P.st.shield : 0), [P.cd.q, P.cd.e, P.cd.f].map(c => +Math.max(0, c - S.T).toFixed(2)), 0, P.force ? P.force.kind[0] : 0, P.gold, P.alive ? 0 : +Math.max(0, P.respawnAt - S.T).toFixed(1), P.ready ? 1 : 0]),
    M: S.mons.map(m => [m.id, m.type, r(m.x), r(m.y), r(m.hp), r(m.mhp), +m.face.toFixed(2), (m.st.slowU > S.T ? 1 : 0) | (m.st.stunU > S.T ? 2 : 0), m.sub || 0]),
    X: S.proj.map(p => [p.id, p.kind, r(p.x), r(p.y), r(p.vx), r(p.vy), p.owner]),
    A: S.areas.map(A => [A.id, A.kind, r(A.x), r(A.y), A.r, +(A.until - S.T).toFixed(2), A.owner]),
    TW: [...S.towers.values()].map(T => [T.pad, T.k, T.lvl, T.owner, +T.face.toFixed(2)]),
    E: S.E.splice(0),
  };
}
