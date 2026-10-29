// ===================== Arène de la Faille : serveur temps réel (Cloudflare Worker + Durable Objects) =====================
// Chaque salon est un Durable Object : il garde les joueurs connectés en WebSocket et fait tourner la simulation 30 fois par seconde.
//   GET /ws?room=CDS   -> WebSocket du salon (le premier message du client est {t:"hello", name, champ, token})
//   GET /rooms         -> salons publics actifs (nombre de joueurs)
// Variables : MAIN_URL (adresse du robot conseil-riot), secret ARENA_KEY (le même que dans le robot) pour créditer les PO.
// En local (wrangler dev), DEV=1 autorise les joueurs sans compte.
import * as SIM from "./sim.js";

const ORIGINS = [/^https:\/\/conseil-des-sages\.pages\.dev$/, /^https:\/\/[a-z0-9-]+\.conseil-des-sages\.pages\.dev$/, /^https:\/\/conseil-des-sages\.netlify\.app$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^https:\/\/[a-z0-9-]+\.claudeusercontent\.com$/];
const FB_KEY = "AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I";
const PUBLIC_ROOMS = ["CDS", "FAILLE", "ICATHIA"];
const cors = o => ({ "Access-Control-Allow-Origin": ORIGINS.some(r => r.test(o || "")) ? o : "https://conseil-des-sages.pages.dev", "Vary": "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS" });

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket attendu", { status: 426 });
      if (origin && !ORIGINS.some(r => r.test(origin))) return new Response("Origine refusée", { status: 403 });
      const room = String(url.searchParams.get("room") || "CDS").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CDS";
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(new Request(url.origin + "/ws?room=" + room, request));
    }
    if (url.pathname === "/rooms") {
      const out = await Promise.all(PUBLIC_ROOMS.map(async r => { try { return { room: r, ...(await (await env.ROOM.get(env.ROOM.idFromName(r)).fetch(url.origin + "/info")).json()) }; } catch (e) { return { room: r, n: 0 }; } }));
      return new Response(JSON.stringify({ rooms: out }), { headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    return new Response("Arène de la Faille", { headers: cors(origin) });
  },
};

async function verifyUser(token) {
  if (!token || token.length > 4096) return null;
  try { const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FB_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }) });
    if (!r.ok) return null; return (await r.json()).users?.[0]?.localId || null; } catch (e) { return null; }
}

export class ArenaRoom {
  constructor(state, env) { this.state = state; this.env = env; this.conns = new Map(); this.S = SIM.createSim(); this.timer = null; this.room = "CDS"; this.host = null; this.nb = 0; this.matchUids = null; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/info") return new Response(JSON.stringify({ n: this.conns.size, ph: this.S.phase, champs: [...this.S.players.values()].filter(p => !p.bot).map(p => p.champ) }));
    this.room = url.searchParams.get("room") || this.room;
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const c = { ws: server, id: null, uid: null, last: Date.now(), n: 0, nt: Date.now() };
    server.addEventListener("message", e => this.onMsg(c, e.data).catch(err => this.send(c, { t: "err", m: String(err && err.message || err) })));
    server.addEventListener("close", () => this.drop(c));
    server.addEventListener("error", () => this.drop(c));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(c, o) { try { c.ws.send(typeof o === "string" ? o : JSON.stringify(o)); } catch (e) { this.drop(c); } }
  broadcast(o) { const s = JSON.stringify(o); for (const c of this.conns.values()) this.send(c, s); }

  async onMsg(c, raw) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    // limite de débit : 60 messages par seconde
    const now = Date.now(); if (now - c.nt > 1000) { c.nt = now; c.n = 0; } if (++c.n > 60) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const S = this.S;
    if (m.t === "hello") {
      if (c.id) return;
      if (this.conns.size >= SIM.ARENA.maxPlayers && ![...this.conns.values()].some(x => x.uid && x.uid === m.uid)) return this.send(c, { t: "err", m: "Salon complet (8 joueurs)." });
      let uid = await verifyUser(String(m.token || ""));
      if (!uid && !this.env.DEV) return this.send(c, { t: "err", m: "Connecte-toi sur CDS.TV pour jouer." });
      if (!uid) uid = "dev-" + Math.random().toString(36).slice(2, 8);
      // une seule connexion par compte : l'ancienne est fermée
      for (const o of this.conns.values()) if (o.uid === uid) { this.send(o, { t: "err", m: "Connecté ailleurs." }); try { o.ws.close(4000, "dup"); } catch (e) {} this.drop(o); }
      c.uid = uid; c.id = "p" + (++this.nb);
      const P = SIM.addPlayer(S, c.id, m.name, m.champ); P.uid = uid;
      if (S.phase !== "lobby") P.ready = true;   // il entre à la manche suivante
      this.conns.set(c.id, c);
      if (!this.host || !this.conns.has(this.host)) this.host = c.id;
      this.send(c, { t: "hi", id: c.id, room: this.room, arena: SIM.ARENA, flash: SIM.FLASH, champs: SIM.CHAMPS });
      this.lobby(); this.ensureLoop(); return;
    }
    if (!c.id) return;
    const P = S.players.get(c.id); if (!P) return;
    switch (m.t) {
      case "in": SIM.input(S, P, m); break;
      case "c": SIM.cast(S, P, String(m.k), m.x, m.y); break;
      case "ping": this.send(c, { t: "pong", c: m.c, T: S.T }); break;
      case "champ": if (S.phase === "lobby" || !P.alive) { SIM.setChamp(P, String(m.c)); this.lobby(); } break;
      case "ready": P.ready = !!m.v; this.lobby(); break;
      case "chat": { const txt = String(m.m || "").replace(/\s+/g, " ").trim().slice(0, 140); if (txt) this.broadcast({ t: "chat", id: c.id, name: P.name, m: txt }); break; }
      case "bot": if (c.id === this.host && S.phase === "lobby") {
        if (m.add && S.players.size < SIM.ARENA.maxPlayers) { const id = "b" + (++this.nb), ch = SIM.CHAMP_IDS[Math.floor(Math.random() * SIM.CHAMP_IDS.length)]; SIM.addPlayer(S, id, "Bot " + ch, ch, true); }
        else if (!m.add) { const b = [...S.players.values()].reverse().find(p => p.bot); if (b) S.players.delete(b.id); }
        this.lobby(); } break;
      case "start": if (c.id === this.host && S.phase === "lobby") {
        if (S.players.size < 2) return this.send(c, { t: "err", m: "Il faut au moins 2 joueurs (ajoute un bot)." });
        const notReady = [...S.players.values()].filter(p => !p.ready && p.id !== c.id); if (notReady.length) return this.send(c, { t: "err", m: "Pas encore prêts : " + notReady.map(p => p.name).join(", ") });
        this.matchUids = new Map([...S.players.values()].filter(p => !p.bot).map(p => [p.id, p.uid]));
        SIM.startMatch(S); this.lobby(); } break;
    }
  }

  drop(c) {
    if (!c.id || !this.conns.has(c.id) || this.conns.get(c.id) !== c) return;
    this.conns.delete(c.id); this.S.players.delete(c.id);
    if (this.host === c.id) this.host = [...this.conns.keys()][0] || null;
    if (!this.conns.size) { this.S = SIM.createSim(); this.stopLoop(); return; }
    // plus personne contre qui jouer : retour au salon
    if (this.S.phase !== "lobby" && this.S.players.size < 2) { this.S.phase = "lobby"; for (const P of this.S.players.values()) P.alive = false; }
    this.lobby();
  }

  lobby() {
    const S = this.S;
    this.broadcast({ t: "lobby", room: this.room, host: this.host, ph: S.phase,
      players: [...S.players.values()].map(P => ({ id: P.id, name: P.name, champ: P.champ, bot: P.bot, ready: P.ready, wins: P.wins, kills: P.kills, deaths: P.deaths })) });
  }

  ensureLoop() { if (this.timer) return; this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.tick(), 1000 / 30); }
  stopLoop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  tick() {
    const S = this.S, now = Date.now(); this.acc += Math.min(250, now - this.last) / 1000; this.last = now;
    let steps = 0; while (this.acc >= SIM.DT && steps < 4) { this.acc -= SIM.DT; steps++; SIM.step(S); }
    if (!steps) return;
    const snap = SIM.snapshot(S);
    // le salon (scores à jour) part avant l'instantané qui annonce la fin de manche
    if (snap.E.some(e => e[0] === "lobby" || e[0] === "rend" || e[0] === "round")) this.lobby();
    if (S.phase !== "lobby" || snap.E.length) this.broadcast(snap);
    for (const e of snap.E) if (e[0] === "mend") this.reward(e[1]);
  }

  // fin de match : le robot de CDS.TV crédite les PO (plafonnées) aux joueurs humains
  async reward(winnerId) {
    const S = this.S, env = this.env; if (!env.MAIN_URL || !env.ARENA_KEY || !this.matchUids) return;
    const humans = [...S.players.values()].filter(p => !p.bot && this.matchUids.has(p.id));
    const rows = [...S.players.values()].sort((a, b) => b.wins - a.wins || b.kills - a.kills).map((p, i) => ({ uid: p.bot ? null : this.matchUids.get(p.id) || null, place: i + 1, wins: p.wins, kills: p.kills, champ: p.champ, bot: p.bot }));
    if (humans.length < 1) return;
    try { const r = await fetch(env.MAIN_URL.replace(/\/$/, "") + "/arena", { method: "POST", headers: { "Content-Type": "application/json", "X-Arena-Key": env.ARENA_KEY }, body: JSON.stringify({ room: this.room, at: Date.now(), winner: rows[0].uid, rows, humans: humans.length }) });
      const j = await r.json().catch(() => ({}));
      // chacun reçoit ce qu'il a gagné
      for (const c of this.conns.values()) { const po = (j.po || {})[c.uid] || 0, note = (j.notes || {})[c.uid] || null; if (po || note) this.send(c, { t: "po", po, note }); }
    } catch (e) {}
    this.matchUids = null;
  }
}
