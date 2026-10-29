// ===================== Arène de la Faille : simulation (autorité du serveur) =====================
// Unités : celles de LoL (distance) et secondes. Le serveur fait tourner sim.step() 30 fois par seconde.
// Le client ne fait que prédire son propre déplacement et afficher l'état reçu.

export const DT = 1 / 30;
export const ARENA = { R: 1300, zoneStart: 40, zoneEnd: 100, zoneMin: 320, zoneDps: 9, wins: 3, countdown: 3, roundEndT: 3.5, matchEndT: 9, maxPlayers: 8 };
export const FLASH = { range: 400, cd: 15 };

// caractéristiques : pv, vitesse, rayon ; sorts : temps de recharge (s) et portée (pour l'interface et les bots)
export const CHAMPS = {
  Ashe:        { hp: 130, spd: 330, rad: 55, q: { cd: 3,   range: 1000 }, e: { cd: 14, range: 2600 } },
  Diana:       { hp: 130, spd: 345, rad: 55, q: { cd: 3.5, range: 850 },  e: { cd: 7,  range: 550 } },
  Azir:        { hp: 130, spd: 335, rad: 55, q: { cd: 3.5, range: 850 },  e: { cd: 14, range: 400 } },
  Gangplank:   { hp: 140, spd: 340, rad: 58, q: { cd: 2.5, range: 700 },  e: { cd: 14, range: 1600 } },
  Kled:        { hp: 140, spd: 345, rad: 60, q: { cd: 4,   range: 800 },  e: { cd: 14, range: 1500 } },
  Galio:       { hp: 155, spd: 335, rad: 75, q: { cd: 4,   range: 825 },  e: { cd: 8,  range: 500 } },
  Mordekaiser: { hp: 155, spd: 330, rad: 70, q: { cd: 4,   range: 600 },  e: { cd: 9,  range: 700 } },
  Tryndamere:  { hp: 130, spd: 350, rad: 55, q: { cd: 4,   range: 600 },  e: { cd: 20, range: 0 } },
  Graves:      { hp: 130, spd: 330, rad: 55, q: { cd: 3.5, range: 750 },  e: { cd: 12, range: 1000 } },
};
// quel sort du kit complet occupe chaque touche (Q = sort rapide, E = sort puissant)
const SLOTS = { Ashe: { q: "q", e: "r" }, Diana: { q: "q", e: "e" }, Azir: { q: "q", e: "r" }, Gangplank: { q: "q", e: "r" }, Kled: { q: "q", e: "r" },
  Galio: { q: "q", e: "e" }, Mordekaiser: { q: "q", e: "e" }, Tryndamere: { q: "q", e: "r" }, Graves: { q: "q", e: "r" } };
export const CHAMP_IDS = Object.keys(CHAMPS);
const WIND = 0.12;   // délai entre l'appui et l'effet : l'animation est calée pour frapper à ce moment

const hyp = Math.hypot, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function norm(dx, dy) { const d = hyp(dx, dy) || 1; return [dx / d, dy / d, d]; }
// point le plus proche d'un segment
function segDist(px, py, ax, ay, bx, by) { const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1, t = clamp(((px - ax) * vx + (py - ay) * vy) / L, 0, 1); return [hyp(px - ax - vx * t, py - ay - vy * t), ax + vx * t, ay + vy * t, t]; }

export function createSim(rand = Math.random) {
  const S = { T: 0, players: new Map(), proj: [], areas: [], walls: [], timers: [], E: [], uid: 1, phase: "lobby", phaseT: 0, round: 0, rt: 0, zr: ARENA.R, rand, winner: null };
  return S;
}

// ---------- joueurs ----------
export function addPlayer(S, id, name, champ, bot = false) {
  const P = { id, name: String(name || "Invocateur").slice(0, 18), champ: CHAMPS[champ] ? champ : "Ashe", bot, x: 0, y: 0, face: 0, hp: 0, mhp: 100, r: 55, spd: 340,
    alive: false, cd: { q: 0, e: 0, r: 0, f: 0 }, mv: null, to: null, aim: [0, 0], st: {}, force: null, act: null, wins: 0, kills: 0, deaths: 0, ready: bot, ai: bot ? { t: 0 } : null };
  S.players.set(id, P); return P;
}
export function setChamp(P, c) { if (CHAMPS[c]) P.champ = c; }
function resetPlayer(S, P, x, y) {
  const C = CHAMPS[P.champ]; Object.assign(P, { x, y, hp: C.hp, mhp: C.hp, r: C.rad, spd: C.spd, alive: true, mv: null, to: null, st: {}, force: null, act: null, face: Math.atan2(-y, -x) });
  P.cd = { q: S.T + 1, e: S.T + 6, f: S.T + 3 };   // le sort puissant se recharge en début de manche
}

// ---------- déroulé d'un match ----------
export function startMatch(S) {
  for (const P of S.players.values()) { P.wins = 0; P.kills = 0; P.deaths = 0; }
  S.round = 0; S.winner = null; startRound(S);
}
function startRound(S) {
  S.round++; S.proj = []; S.areas = []; S.walls = []; S.timers = []; S.zr = ARENA.R; S.rt = -ARENA.countdown;
  const list = [...S.players.values()], n = list.length, off = S.rand() * Math.PI * 2;
  list.forEach((P, i) => { const a = off + i / n * Math.PI * 2; resetPlayer(S, P, Math.cos(a) * 760, Math.sin(a) * 760); });
  S.phase = "count"; S.phaseT = S.T + ARENA.countdown; S.E.push(["round", S.round]);
}
function endRound(S, winner) {
  S.phase = "rend"; S.phaseT = S.T + ARENA.roundEndT;
  if (winner) winner.wins++;
  S.E.push(["rend", winner ? winner.id : null]);
  if (winner && winner.wins >= ARENA.wins) { S.phase = "mend"; S.phaseT = S.T + ARENA.matchEndT; S.winner = winner.id; S.E.push(["mend", winner.id]); }
}

// ---------- état : effets, dégâts ----------
const can = (a, b) => a !== b && b.alive && (a.st.realm || null) === (b.st.realm || null);
const targetable = (S, b) => b.alive && !(b.st.untargU > S.T);
function enemies(S, P, realm = P.st.realm || null) { const out = []; for (const Q of S.players.values()) if (Q !== P && Q.alive && (Q.st.realm || null) === realm && targetable(S, Q)) out.push(Q); return out; }
export function hurt(S, Q, amt, src) {
  if (!Q.alive || Q.st.untargU > S.T || amt <= 0) return 0;
  if (Q.st.shieldU > S.T && Q.st.shield > 0) { const a = Math.min(Q.st.shield, amt); Q.st.shield -= a; amt -= a; }
  Q.hp -= amt;
  if (Q.st.undyingU > S.T && Q.hp < 1) Q.hp = 1;
  S.E.push(["dmg", Q.id, Math.round(amt * 10) / 10, src ? src.id : null]);
  if (Q.hp <= 0) kill(S, Q, src);
  return amt;
}
function kill(S, Q, src) {
  Q.hp = 0; Q.alive = false; Q.force = null; Q.deaths++; if (src && src !== Q) src.kills++;
  // le royaume des morts se referme si l'un des deux tombe
  if (Q.st.realm) for (const R of S.players.values()) if (R.st.realm === Q.st.realm) { R.st.realm = null; R.st.realmU = 0; }
  S.E.push(["die", Q.id, src ? src.id : null]);
}
const slow = (S, Q, m, d) => { if (Q.st.unstopU > S.T) return; if (!(Q.st.slowU > S.T) || m < Q.st.slowM) Q.st.slowM = m; Q.st.slowU = Math.max(Q.st.slowU || 0, S.T + d); };
const stun = (S, Q, d) => { if (Q.st.unstopU > S.T) return; Q.st.stunU = Math.max(Q.st.stunU || 0, S.T + d); Q.to = null; if (Q.force && Q.force.kind === "dash") Q.force = null; };
const shield = (S, Q, a, d) => { Q.st.shield = (Q.st.shieldU > S.T ? Q.st.shield : 0) + a; Q.st.shieldU = S.T + d; };
// déplacement forcé (ruée ou projection) d'un point à un autre
function force(S, Q, kind, tx, ty, dur, opt = {}) {
  if (kind === "knock" && Q.st.unstopU > S.T) return;
  const [ex, ey] = clampArena(tx, ty, Q.r);
  Q.force = { kind, sx: Q.x, sy: Q.y, ex, ey, t0: S.T, dur: Math.max(.05, dur), ...opt }; Q.to = null;
  if (kind === "knock") stun(S, Q, dur);
}
function clampArena(x, y, r) { const d = hyp(x, y), m = ARENA.R - r; return d > m ? [x / d * m, y / d * m] : [x, y]; }
const later = (S, d, fn) => S.timers.push({ at: S.T + d, fn });
const fx = (S, ...a) => S.E.push(["fx", ...a]);

// ---------- projectiles ----------
function shoot(S, P, kind, ang, o) {
  const p = { id: S.uid++, kind, owner: P.id, realm: P.st.realm || null, x: P.x + Math.cos(ang) * 40, y: P.y + Math.sin(ang) * 40, vx: Math.cos(ang) * o.speed * .82, vy: Math.sin(ang) * o.speed * .82,
    w: (o.w || 50) * 1.25, left: o.range, hit: new Set(), pierce: !!o.pierce, onHit: o.onHit, onEnd: o.onEnd, keg: o.keg !== false };
  S.proj.push(p); return p;
}
function stepProj(S) {
  const keep = [];
  for (const p of S.proj) {
    const owner = S.players.get(p.owner); let dead = false;
    const sub = 3, sx = p.vx * DT / sub, sy = p.vy * DT / sub, sl = hyp(sx, sy);
    for (let i = 0; i < sub && !dead; i++) {
      p.x += sx; p.y += sy; p.left -= sl;
      // barils de Gangplank : tout projectile les fait sauter
      if (p.keg) for (const k of S.areas) if (k.kind === "keg" && !k.boom && k.armU <= S.T && hyp(k.x - p.x, k.y - p.y) < 45 + p.w / 2) { kegBoom(S, k, owner); if (!p.pierce) dead = true; break; }
      if (dead) break;
      for (const Q of S.players.values()) {
        if (!owner || Q === owner || !Q.alive || p.hit.has(Q.id) || (Q.st.realm || null) !== p.realm || !targetable(S, Q)) continue;
        if (hyp(Q.x - p.x, Q.y - p.y) < Q.r + p.w / 2) { p.hit.add(Q.id); if (p.onHit) p.onHit(Q, p); if (!p.pierce) { dead = true; break; } }
      }
      // murs d'Azir : arrêtent les projectiles ennemis
      for (const w of S.walls) if (w.owner !== p.owner && segDist(p.x, p.y, w.ax, w.ay, w.bx, w.by)[0] < 40) { dead = true; break; }
      if (p.left <= 0 || hyp(p.x, p.y) > ARENA.R + 200) dead = true;
    }
    if (dead) { if (p.onEnd) p.onEnd(p); S.E.push(["pend", p.id, Math.round(p.x), Math.round(p.y)]); } else keep.push(p);
  }
  S.proj = keep;
}
function kegBoom(S, k, by) {
  if (k.boom) return; k.boom = true; k.until = S.T;
  const gp = S.players.get(k.owner); fx(S, "kegboom", Math.round(k.x), Math.round(k.y), 260);
  for (const Q of S.players.values()) if (Q.alive && Q !== gp && Q !== by && (Q.st.realm || null) === (k.realm || null) && hyp(Q.x - k.x, Q.y - k.y) < 260 + Q.r * .5) { hurt(S, Q, 28, gp || by); slow(S, Q, .6, 1.2); }
  // réaction en chaîne vers les barils proches
  for (const k2 of S.areas) if (k2.kind === "keg" && !k2.boom && hyp(k2.x - k.x, k2.y - k.y) < 470) later(S, .12, () => kegBoom(S, k2, by));
}
// zone rectangulaire devant un point : renvoie les ennemis touchés
function inRect(S, P, x0, y0, ang, len, w, realm) {
  const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len;
  return enemies(S, P, realm).filter(Q => segDist(Q.x, Q.y, x0, y0, ex, ey)[0] < w / 2 + Q.r * .6);
}
const inCircle = (S, P, x, y, r, realm) => enemies(S, P, realm).filter(Q => hyp(Q.x - x, Q.y - y) < r + Q.r * .5);

// ---------- les sorts ----------
// chaque sort reçoit l'angle et le point visé (déjà limités à la portée) ; il renvoie false pour refuser le lancement
const KITS = {
  Ashe: {
    q(S, P, a) { later(S, WIND, () => { const hitBy = new Set(); for (let i = -3; i <= 3; i++) shoot(S, P, "arrow", a + i * .145, { speed: 1700, range: 1000, w: 40, onHit: Q => { if (hitBy.has(Q.id)) return; hitBy.add(Q.id); hurt(S, Q, 14, P); slow(S, Q, .65, 1.5); } }); }); },
    e(S, P) { P.st.sprintU = S.T + 2.5; P.st.sprintM = 1.45; fx(S, "sprint", P.id); },
    r(S, P, a) { later(S, WIND, () => { const x0 = P.x, y0 = P.y; shoot(S, P, "crystal", a, { speed: 1500, range: 2600, w: 130, onHit: Q => { const d = hyp(Q.x - x0, Q.y - y0); hurt(S, Q, 30, P); stun(S, Q, clamp(1 + d / 1000, 1, 2.5)); fx(S, "frost", Math.round(Q.x), Math.round(Q.y), 220); inCircle(S, P, Q.x, Q.y, 220).forEach(Z => { if (Z !== Q) { hurt(S, Z, 12, P); slow(S, Z, .5, 2); } }); } }); }); },
  },
  Diana: {
    q(S, P, a, tx, ty) { later(S, WIND, () => shoot(S, P, "moon", a, { speed: 1400, range: Math.max(200, hyp(tx - P.x, ty - P.y)), w: 70, pierce: true,
      onHit: Q => { hurt(S, Q, 18, P); Q.st.markU = S.T + 3; Q.st.markBy = P.id; },
      onEnd: p => { fx(S, "moonburst", Math.round(p.x), Math.round(p.y), 170); inCircle(S, P, p.x, p.y, 170, p.realm).forEach(Q => { if (!p.hit.has(Q.id)) { hurt(S, Q, 18, P); Q.st.markU = S.T + 3; Q.st.markBy = P.id; } }); } })); },
    e(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1600, { hitR: 110, dmg: 12, onPass(Q) { if (Q.st.markU > S.T && Q.st.markBy === P.id) { Q.st.markU = 0; P.cd.e = S.T + .4; fx(S, "reset", P.id); } } }); },
    r(S, P) { later(S, .1, () => { for (const Q of inCircle(S, P, P.x, P.y, 380)) { const [nx, ny] = norm(P.x - Q.x, P.y - Q.y); const d = hyp(P.x - Q.x, P.y - Q.y); force(S, Q, "knock", Q.x + nx * Math.max(0, d - 130), Q.y + ny * Math.max(0, d - 130), .25); }
      fx(S, "moonfall", P.id, 380); later(S, .6, () => { if (!P.alive) return; fx(S, "moonblast", Math.round(P.x), Math.round(P.y), 380); inCircle(S, P, P.x, P.y, 380).forEach(Q => hurt(S, Q, 30, P)); }); }); },
  },
  Azir: {
    q(S, P, a, tx, ty) { const x0 = P.x, y0 = P.y, len = Math.max(250, hyp(tx - x0, ty - y0)), realm = P.st.realm || null; fx(S, "tele", "rect", Math.round(x0), Math.round(y0), +a.toFixed(3), Math.round(len), 140, .35);
      later(S, .35, () => { if (!P.alive) return; fx(S, "spears", Math.round(x0), Math.round(y0), +a.toFixed(3), Math.round(len)); for (const Q of inRect(S, P, x0, y0, a, len, 140, realm)) { hurt(S, Q, 22, P); force(S, Q, "knock", Q.x + Math.cos(a) * 120, Q.y + Math.sin(a) * 120, .15); } }); },
    e(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1500, { onEnd() { shield(S, P, 15, 2); } }); },
    r(S, P, a) { later(S, WIND, () => { const cx = P.x + Math.cos(a) * 260, cy = P.y + Math.sin(a) * 260, px = -Math.sin(a), py = Math.cos(a), L = 310;
      const w = { id: S.uid++, owner: P.id, ax: cx + px * L, ay: cy + py * L, bx: cx - px * L, by: cy - py * L, until: S.T + 3 }; S.walls.push(w);
      fx(S, "wall", w.id, Math.round(w.ax), Math.round(w.ay), Math.round(w.bx), Math.round(w.by), 3);
      for (const Q of enemies(S, P)) { const along = (Q.x - P.x) * Math.cos(a) + (Q.y - P.y) * Math.sin(a), lat = Math.abs((Q.x - P.x) * px + (Q.y - P.y) * py);
        if (along > -60 && along < 420 && lat < L + Q.r) { hurt(S, Q, 26, P); force(S, Q, "knock", Q.x + Math.cos(a) * (420 - along + 80), Q.y + Math.sin(a) * (420 - along + 80), .4); } } }); },
  },
  Gangplank: {
    q(S, P, a, tx, ty) { later(S, WIND, () => {
      // le tir cible le baril le plus proche de la ligne s'il y en a un
      shoot(S, P, "bullet", a, { speed: 2200, range: 700, w: 50, onHit: Q => hurt(S, Q, 20, P) }); }); },
    e(S, P, a, tx, ty) { const mine = S.areas.filter(k => k.kind === "keg" && k.owner === P.id && !k.boom); if (mine.length >= 3) { mine[0].boom = true; mine[0].until = S.T; }
      later(S, WIND, () => S.areas.push({ id: S.uid++, kind: "keg", owner: P.id, realm: P.st.realm || null, x: tx, y: ty, r: 45, armU: S.T + .7, until: S.T + 14 })); },
    r(S, P, a, tx, ty) { later(S, .2, () => { const z = { id: S.uid++, kind: "barrage", owner: P.id, realm: P.st.realm || null, x: tx, y: ty, r: 450, until: S.T + 3, tick: S.T + .3 }; S.areas.push(z); }); },
  },
  Kled: {
    q(S, P, a) { later(S, WIND, () => shoot(S, P, "trap", a, { speed: 1500, range: 800, w: 70, onHit: Q => { hurt(S, Q, 12, P); const tid = S.uid++; S.E.push(["tether", tid, P.id, Q.id, 1.6]);
      later(S, 1.6, () => { if (!P.alive || !Q.alive) return; const d = hyp(Q.x - P.x, Q.y - P.y); if (d > 750 || (P.st.realm || null) !== (Q.st.realm || null)) return; const [nx, ny] = norm(P.x - Q.x, P.y - Q.y); force(S, Q, "knock", Q.x + nx * Math.min(350, d - 100), Q.y + ny * Math.min(350, d - 100), .3); hurt(S, Q, 16, P); }); } })); },
    e(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1700, { hitR: 90, dmg: 14 }); },
    r(S, P, a) { P.st.unstopU = S.T + 1.6; const tx = P.x + Math.cos(a) * 1500, ty = P.y + Math.sin(a) * 1500;
      dashTo(S, P, tx, ty, 1050, { unstop: true, stopOn: true, hitR: 70, onHitStop(Q) { fx(S, "charge", Math.round(P.x), Math.round(P.y), 220); inCircle(S, P, P.x, P.y, 220).forEach(Z => { hurt(S, Z, 30, P); force(S, Z, "knock", Z.x + Math.cos(a) * 300, Z.y + Math.sin(a) * 300, .45); }); shield(S, P, 25, 4); S.E.push(["act", P.id, "ultEnd"]); },
        onEnd() { S.E.push(["act", P.id, "ultEnd"]); } }); },
  },
  Galio: {
    q(S, P, a, tx, ty) { later(S, WIND, () => shoot(S, P, "wind", a, { speed: 1300, range: Math.max(200, hyp(tx - P.x, ty - P.y)), w: 80, pierce: true, keg: true, onHit: Q => hurt(S, Q, 12, P),
      onEnd: p => S.areas.push({ id: S.uid++, kind: "tornado", owner: P.id, realm: p.realm, x: p.x, y: p.y, r: 220, until: S.T + 1.6, tick: S.T + .1 }) })); },
    e(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1500, { stopOn: true, hitR: 90, onHitStop(Q) { hurt(S, Q, 16, P); force(S, Q, "knock", Q.x + Math.cos(a) * 80, Q.y + Math.sin(a) * 80, .75); } }); },
    r(S, P, a, tx, ty) { const [lx, ly] = clampArena(tx, ty, P.r); S.areas.push({ id: S.uid++, kind: "galio", owner: P.id, realm: P.st.realm || null, x: lx, y: ly, r: 320, until: S.T + 1.5 });
      P.st.rootU = S.T + 1.0; P.st.chanU = S.T + 1.5; later(S, 1.0, () => { if (!P.alive) return; P.st.untargU = S.T + .5; force(S, P, "leap", lx, ly, .5); S.E.push(["act", P.id, "ultEnd"]);
        later(S, .5, () => { if (!P.alive) return; fx(S, "galioland", Math.round(lx), Math.round(ly), 320); inCircle(S, P, lx, ly, 320).forEach(Q => { hurt(S, Q, 30, P); const [nx, ny] = norm(Q.x - lx, Q.y - ly); force(S, Q, "knock", Q.x + nx * 120, Q.y + ny * 120, .75); }); }); }); },
  },
  Mordekaiser: {
    q(S, P, a) { const x0 = P.x, y0 = P.y, realm = P.st.realm || null; P.st.rootU = S.T + .3; fx(S, "tele", "rect", Math.round(x0), Math.round(y0), +a.toFixed(3), 600, 180, .5);
      later(S, .5, () => { if (!P.alive) return; fx(S, "mace", Math.round(x0), Math.round(y0), +a.toFixed(3), 600); const hit = inRect(S, P, x0, y0, a, 600, 180, realm); hit.forEach(Q => hurt(S, Q, hit.length === 1 ? 34 : 24, P)); }); },
    e(S, P, a) { const x0 = P.x, y0 = P.y, realm = P.st.realm || null; fx(S, "tele", "rect", Math.round(x0), Math.round(y0), +a.toFixed(3), 700, 140, .6);
      later(S, .6, () => { if (!P.alive) return; fx(S, "grasp", Math.round(x0), Math.round(y0), +a.toFixed(3), 700); for (const Q of inRect(S, P, x0, y0, a, 700, 140, realm)) { hurt(S, Q, 10, P); force(S, Q, "knock", P.x + Math.cos(a) * 160, P.y + Math.sin(a) * 160, .3); } }); },
    r(S, P, a, tx, ty) { if (P.st.realm) return false; let best = null, bd = 1e9; for (const Q of enemies(S, P)) { if (Q.st.realm) continue; const d = hyp(Q.x - P.x, Q.y - P.y); if (d > 650) continue; const dc = hyp(Q.x - tx, Q.y - ty); if (dc < bd) { bd = dc; best = Q; } }
      if (!best) return false; const realm = "r" + P.id; later(S, .25, () => { if (!P.alive || !best.alive) return; for (const Z of [P, best]) { Z.st.realm = realm; Z.st.realmU = S.T + 6; } fx(S, "realm", P.id, best.id, 6); }); },
  },
  Tryndamere: {
    q(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1300, { hitR: 125, dmg: 20 }); },
    e(S, P) { fx(S, "shout", P.id, 450); for (const Q of inCircle(S, P, P.x, P.y, 450)) slow(S, Q, .6, 2); },
    r(S, P) { P.st.undyingU = S.T + 4; fx(S, "rage", P.id, 4); },
  },
  Graves: {
    q(S, P, a, tx, ty) { const x0 = P.x, y0 = P.y, realm = P.st.realm || null, len = 750; later(S, WIND, () => { fx(S, "gline", Math.round(x0), Math.round(y0), +a.toFixed(3), len); for (const Q of inRect(S, P, x0, y0, a, len, 90, realm)) hurt(S, Q, 16, P); });
      later(S, .9, () => { if (!P.alive) return; fx(S, "gboom", Math.round(x0), Math.round(y0), +a.toFixed(3), len); for (const Q of inRect(S, P, x0, y0, a, len, 110, realm)) hurt(S, Q, 14, P); }); },
    e(S, P, a, tx, ty) { dashTo(S, P, tx, ty, 1500, { onEnd() { shield(S, P, 10, 2); } }); },
    r(S, P, a) { later(S, .08, () => { const bx = P.x - Math.cos(a) * 300, by = P.y - Math.sin(a) * 300; force(S, P, "dash", bx, by, .3); S.E.push(["act", P.id, "ultEnd"]);
      shoot(S, P, "shell", a, { speed: 2100, range: 1000, w: 100, onHit: (Q, p) => { hurt(S, Q, 34, P); cone(Q); }, onEnd: p => { if (!p.hit.size) cone(p); } });
      function cone(o) { fx(S, "shellboom", Math.round(o.x), Math.round(o.y), +a.toFixed(3), 400); for (const Z of enemies(S, P)) { if (o.id === Z.id) continue; const dx = Z.x - o.x, dy = Z.y - o.y, al = dx * Math.cos(a) + dy * Math.sin(a), lat = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); if (al > -30 && al < 400 && lat < 80 + al * .45) hurt(S, Z, 20, P); } } }); },
  },
};
// ruée jusqu'à un point ; options : dégâts aux ennemis traversés, arrêt sur le premier touché
function dashTo(S, P, tx, ty, speed, o = {}) {
  const d = hyp(tx - P.x, ty - P.y); force(S, P, "dash", tx, ty, d / speed, { hitR: o.hitR, dmg: o.dmg, stopOn: o.stopOn, onHitStop: o.onHitStop, onPass: o.onPass, onEnd: o.onEnd, unstop: o.unstop, hits: new Set() });
}

// lancement d'un sort par un joueur (Q, E, R ou F = Saut éclair)
export function cast(S, P, k, x, y) {
  if (S.phase !== "round" || !P.alive || !["q", "e", "f"].includes(k)) return false;
  if (P.st.stunU > S.T || P.st.chanU > S.T) return false;
  if (P.force && (k !== "f" || P.force.kind !== "dash")) return false;
  if (P.cd[k] > S.T + .05) return false;
  x = +x || 0; y = +y || 0;
  const C = CHAMPS[P.champ], range = k === "f" ? FLASH.range : C[k].range;
  let [nx, ny, d] = norm(x - P.x, y - P.y); if (d < 1) { nx = Math.cos(P.face); ny = Math.sin(P.face); d = 0; }
  const a = Math.atan2(ny, nx), r = range ? Math.min(d, range) : 0;
  let [tx, ty] = clampArena(P.x + nx * r, P.y + ny * r, P.r);
  if (k === "f") { P.force = null; [P.x, P.y] = clampArena(P.x + nx * Math.max(r, 120), P.y + ny * Math.max(r, 120), P.r); P.face = a; P.cd.f = S.T + FLASH.cd; S.E.push(["cast", P.id, "f", Math.round(P.x), Math.round(P.y)]); return true; }
  const ok = KITS[P.champ][SLOTS[P.champ][k]](S, P, a, tx, ty);
  if (ok === false) return false;
  P.face = a; P.to = null; P.cd[k] = S.T + C[k].cd; P.act = { k, s: S.uid++ };
  S.E.push(["cast", P.id, k, Math.round(tx), Math.round(ty)]);
  if (!P.force && !(P.st.rootU > S.T)) P.st.rootU = Math.max(P.st.rootU || 0, S.T + WIND);
  return true;
}

// entrées du joueur : direction (ZQSD/flèches), point de destination (clic droit), point visé (souris)
export function input(S, P, m) {
  if (Array.isArray(m.mv)) { const [dx, dy] = m.mv.map(Number), d = hyp(dx, dy); P.mv = d > .01 ? [dx / d, dy / d] : null; if (P.mv) P.to = null; }
  if (Array.isArray(m.to)) { P.to = [clamp(+m.to[0] || 0, -2000, 2000), clamp(+m.to[1] || 0, -2000, 2000)]; P.mv = null; }
  if (m.stop) { P.to = null; P.mv = null; }
  if (Array.isArray(m.a)) P.aim = [+m.a[0] || 0, +m.a[1] || 0];
}

export function moveSpeed(S, P) { let s = P.spd; if (P.st.sprintU > S.T) s *= P.st.sprintM; if (P.st.slowU > S.T && !(P.st.unstopU > S.T)) s *= P.st.slowM; return s; }

// ---------- un pas de simulation ----------
export function step(S) {
  S.T += DT;
  // phases du match
  if (S.phase === "count" && S.T >= S.phaseT) { S.phase = "round"; S.rt = 0; S.E.push(["go"]); }
  else if (S.phase === "rend" && S.T >= S.phaseT) startRound(S);
  else if (S.phase === "mend" && S.T >= S.phaseT) { S.phase = "lobby"; for (const P of S.players.values()) { P.alive = false; if (!P.bot) P.ready = false; } S.E.push(["lobby"]); }
  if (S.phase === "lobby") return;
  if (S.phase === "count") { S.rt = S.T - S.phaseT; return; }
  if (S.phase === "round") S.rt += DT;
  // la zone du Néant se resserre
  const z = clamp((S.rt - ARENA.zoneStart) / (ARENA.zoneEnd - ARENA.zoneStart), 0, 1); S.zr = ARENA.R - (ARENA.R - ARENA.zoneMin) * z;
  // minuteries des sorts
  if (S.timers.length) { const due = S.timers.filter(t => t.at <= S.T); S.timers = S.timers.filter(t => t.at > S.T); for (const t of due) t.fn(); }
  for (const P of S.players.values()) {
    if (P.bot && P.alive && S.phase === "round") botThink(S, P);
    if (!P.alive) continue;
    if (P.st.realm && P.st.realmU <= S.T) { P.st.realm = null; }
    if (P.force) stepForce(S, P);
    else if (!(P.st.stunU > S.T) && !(P.st.rootU > S.T)) {
      let dx = 0, dy = 0; const sp = moveSpeed(S, P) * DT;
      if (P.mv) { dx = P.mv[0] * sp; dy = P.mv[1] * sp; }
      else if (P.to) { const [nx, ny, d] = norm(P.to[0] - P.x, P.to[1] - P.y); if (d <= sp) { dx = P.to[0] - P.x; dy = P.to[1] - P.y; P.to = null; } else { dx = nx * sp; dy = ny * sp; } }
      if (dx || dy) { P.x += dx; P.y += dy; P.face = Math.atan2(dy, dx); }
    }
    [P.x, P.y] = clampArena(P.x, P.y, P.r);
    for (const w of S.walls) if (w.owner !== P.id) { const [d, cx, cy] = segDist(P.x, P.y, w.ax, w.ay, w.bx, w.by), m = P.r + 30; if (d < m) { const [nx, ny] = norm(P.x - cx, P.y - cy); P.x = cx + nx * m; P.y = cy + ny * m; if (P.force && P.force.kind === "dash") endForce(S, P); } }
    // hors de la zone : le Néant ronge
    if (S.phase === "round" && hyp(P.x, P.y) > S.zr && !(P.st.realm)) hurt(S, P, ARENA.zoneDps * DT, null);
  }
  stepProj(S);
  // zones persistantes
  for (const A of S.areas) {
    const owner = S.players.get(A.owner);
    if (A.kind === "barrage" && S.T >= A.tick) { A.tick += .5; for (const Q of S.players.values()) if (owner && can(owner, Q) && (Q.st.realm || null) === (A.realm || null) && hyp(Q.x - A.x, Q.y - A.y) < A.r + Q.r * .5) { hurt(S, Q, 5, owner); slow(S, Q, .7, .6); } }
    if (A.kind === "tornado" && S.T >= A.tick) { A.tick += .4; for (const Q of S.players.values()) if (owner && can(owner, Q) && (Q.st.realm || null) === (A.realm || null) && hyp(Q.x - A.x, Q.y - A.y) < A.r + Q.r * .5) { hurt(S, Q, 4, owner); slow(S, Q, .75, .5); } }
  }
  S.areas = S.areas.filter(A => A.until > S.T && !(A.kind === "keg" && A.boom));
  S.walls = S.walls.filter(w => w.until > S.T);
  // fin de manche : il ne reste qu'un survivant (ou personne)
  if (S.phase === "round") { const alive = [...S.players.values()].filter(P => P.alive); if (alive.length <= 1 && S.players.size > 1) endRound(S, alive[0] || null); else if (S.players.size === 1 && alive.length === 0) endRound(S, null); }
}
function stepForce(S, P) {
  const F = P.force, u = clamp((S.T - F.t0) / F.dur, 0, 1), e = F.kind === "leap" ? u : u;
  const ox = P.x, oy = P.y; P.x = F.sx + (F.ex - F.sx) * e; P.y = F.sy + (F.ey - F.sy) * e;
  if (F.kind === "dash") { P.face = Math.atan2(F.ey - F.sy, F.ex - F.sx);
    if (F.hitR) for (const Q of enemies(S, P)) { if (F.hits.has(Q.id)) continue; if (segDist(Q.x, Q.y, ox, oy, P.x, P.y)[0] < F.hitR + Q.r * .5) { F.hits.add(Q.id);
      if (F.dmg) hurt(S, Q, F.dmg, P); if (F.onPass) F.onPass(Q); if (F.stopOn) { const cb = F.onHitStop; P.force = null; if (cb) cb(Q); return; } } } }
  if (u >= 1) endForce(S, P);
}
function endForce(S, P) { const F = P.force; P.force = null; if (F && F.onEnd) F.onEnd(); }

// ---------- bots ----------
function botThink(S, P) {
  const ai = P.ai; if (S.T < ai.t) return; ai.t = S.T + .2 + S.rand() * .15;
  const foes = enemies(S, P); if (!foes.length) { P.to = [0, 0]; return; }
  let tgt = foes[0], bd = 1e9; for (const Q of foes) { const d = hyp(Q.x - P.x, Q.y - P.y); if (d < bd) { bd = d; tgt = Q; } }
  const C = CHAMPS[P.champ], lead = .25, ax = tgt.x + (tgt.to || tgt.mv ? Math.cos(tgt.face) * moveSpeed(S, tgt) * lead : 0), ay = tgt.y + (tgt.to || tgt.mv ? Math.sin(tgt.face) * moveSpeed(S, tgt) * lead : 0);
  // les bots visent un peu au hasard pour laisser une chance aux humains
  const err = 70 + S.rand() * 90, ea = S.rand() * Math.PI * 2; P.aim = [ax + Math.cos(ea) * err * S.rand(), ay + Math.sin(ea) * err * S.rand()];
  // esquive : un projectile ennemi arrive droit dessus
  for (const p of S.proj) { if (p.owner === P.id) continue; const [nx, ny] = norm(p.vx, p.vy), rx = P.x - p.x, ry = P.y - p.y, al = rx * nx + ry * ny, lat = rx * ny - ry * nx;
    if (al > 0 && al < 550 && Math.abs(lat) < P.r + p.w / 2 + 30 && !(ai.miss && ai.miss.has(p.id))) { if (S.rand() < .45) { (ai.miss = ai.miss || new Set()).add(p.id); if (ai.miss.size > 60) ai.miss.clear(); continue; } const side = lat >= 0 ? 1 : -1; if (S.rand() < .2 && P.cd.f <= S.T) cast(S, P, "f", P.x + ny * side * 400, P.y - nx * side * 400); P.to = [P.x + ny * side * 260, P.y - nx * side * 260]; return; } }
  const pref = C.q.range * .75, [nx, ny] = norm(tgt.x - P.x, tgt.y - P.y);
  if (S.rand() < .35 && P.cd.q <= S.T && bd < C.q.range * 1.05) { cast(S, P, "q", P.aim[0], P.aim[1]); return; }
  if (S.rand() < .12 && P.cd.e <= S.T && (C.e.range === 0 ? bd < 450 : bd < C.e.range)) { cast(S, P, "e", P.aim[0], P.aim[1]); return; }
  // garder la distance préférée, en tournant autour de la cible et en restant dans la zone
  const strafe = (P.id.charCodeAt(P.id.length - 1) % 2 ? 1 : -1) * 220, back = bd < pref * .7 ? -1 : bd > pref ? 1 : 0;
  let gx = P.x + nx * back * 250 - ny * strafe, gy = P.y + ny * back * 250 + nx * strafe;
  const gd = hyp(gx, gy); if (gd > S.zr - 150) { gx *= (S.zr - 200) / gd; gy *= (S.zr - 200) / gd; }
  P.to = [gx, gy];
}

// ---------- instantané envoyé aux joueurs ----------
export function snapshot(S) {
  const r = v => Math.round(v);
  return {
    t: "s", T: +S.T.toFixed(3), ph: S.phase, rd: S.round, rt: +S.rt.toFixed(2), zr: r(S.zr),
    P: [...S.players.values()].map(P => [P.id, r(P.x), r(P.y), +P.hp.toFixed(1), P.mhp, +P.face.toFixed(2), flags(S, P), r(P.st.shieldU > S.T ? P.st.shield : 0),
      [P.cd.q, P.cd.e, P.cd.f].map(c => +Math.max(0, c - S.T).toFixed(2)), P.st.realm || 0, P.force ? P.force.kind[0] : 0]),
    X: S.proj.map(p => [p.id, p.kind, r(p.x), r(p.y), r(p.vx), r(p.vy), p.owner]),
    A: S.areas.map(A => [A.id, A.kind, r(A.x), r(A.y), A.r, +(A.until - S.T).toFixed(2), A.owner]),
    E: S.E.splice(0),
  };
}
// drapeaux d'état : 1 vivant, 2 étourdi, 4 ralenti, 8 bouclier, 16 increvable, 32 marqué, 64 intouchable, 128 sprint
function flags(S, P) { const s = P.st; return (P.alive ? 1 : 0) | (s.stunU > S.T ? 2 : 0) | (s.slowU > S.T ? 4 : 0) | (s.shieldU > S.T && s.shield > 0 ? 8 : 0) | (s.undyingU > S.T ? 16 : 0) | (s.markU > S.T ? 32 : 0) | (s.untargU > S.T ? 64 : 0) | (s.sprintU > S.T ? 128 : 0); }
