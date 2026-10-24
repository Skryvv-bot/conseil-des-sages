// Service worker du Conseil : rend le site installable et utilisable hors connexion (pages déjà visitées).
const CACHE="conseil-v75";
const CORE=["index.html","worlds.html","tierlist.html","jeux.html","devinettes.html","echauffement.html","customs.html","communaute.html","patch.html","ladder.html","potes.html","potes.js","banque.html","fantasy.html","fantasy/score.js","cartes.html","conseil.js","conseil.css","theme-tv.css","champions.js","icon-192.png","icon-512.png","manifest.webmanifest"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin)return;   // Firebase, Leaguepedia, Discord : toujours en direct
  // Réseau d'abord (pour avoir la dernière version), cache en secours.
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r})
    .catch(()=>caches.match(e.request).then(m=>m||caches.match("index.html"))));
});
