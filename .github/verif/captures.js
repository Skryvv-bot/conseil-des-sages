// Ouvre chaque page du site en ligne, relève les erreurs et prend une capture (ordinateur et téléphone).
const { chromium } = require("playwright");
const fs = require("fs");
const SITE = "https://conseil-des-sages.pages.dev/";
const PAGES = ["index.html", "lol.html", "newdawn.html", "mercato.html", "worlds.html", "tierlist.html", "fantasy.html", "fantasy.html#classement", "cartes.html", "cartes.html#sages", "ladder.html", "customs.html",
  "communaute.html#paris", "communaute.html#profil", "patch.html", "wow.html", "fortnite.html", "devinettes.html", "banque.html", "jeux.html"];
(async () => {
  fs.mkdirSync("out", { recursive: true });
  const b = await chromium.launch(), report = [];
  for (const [w, h, tag] of [[1280, 900, "pc"], [390, 844, "tel"]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, locale: "fr-FR", timezoneId: "Europe/Paris" });
    for (const pg of PAGES) {
      const p = await c.newPage(), errs = [], bad = [];
      p.on("pageerror", e => errs.push("JS: " + e.message));
      p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
      p.on("response", r => { if (r.status() >= 400) bad.push(r.status() + " " + r.url().slice(0, 140)); });
      p.on("requestfailed", r => bad.push("ECHEC " + r.url().slice(0, 140)));
      try { await p.goto(SITE + pg, { waitUntil: "domcontentloaded", timeout: 45000 }); await p.waitForTimeout(tag === "pc" ? 9000 : 6000); } catch (e) { errs.push("chargement: " + e.message.slice(0, 120)); }
      const info = await p.evaluate(() => {
        const cav = [...document.querySelectorAll(".cav")], withImg = cav.filter(e => e.querySelector("img") && e.querySelector("img").naturalWidth > 0).length;
        const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map(i => i.getAttribute("src").slice(0, 110));
        const over = [...document.querySelectorAll("body *")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 2 && !e.closest(".tv-ticker,.cnav-links,.tbox,.tw,.avgrid,.cdc-pop"); }).slice(0, 4).map(e => e.tagName + "." + String(e.className).slice(0, 40));
        const txt = document.body.innerText;
        return { avatars: cav.length, avatarsPhoto: withImg, initiales: cav.filter(e => !e.querySelector("img")).map(e => (e.dataset.avn || e.textContent).slice(0, 14)).slice(0, 40), broken: [...new Set(broken)].slice(0, 12), overflowX: document.documentElement.scrollWidth - innerWidth, over,
          suspects: (txt.match(/undefined|NaN|\[object Object\]|null pts|Chargement[^\n]{0,40}/g) || []).slice(0, 8), acc: (document.getElementById("cnavAcc") || {}).textContent || "" };
      }).catch(e => ({ err: e.message }));
      const name = pg.replace(/[#.]/g, "_") + "_" + tag;
      await p.screenshot({ path: "out/" + name + ".jpg", type: "jpeg", quality: 55, fullPage: true }).catch(() => {});
      report.push({ page: pg, vue: tag, errs: [...new Set(errs)].slice(0, 10), bad: [...new Set(bad)].slice(0, 12), ...info });
      await p.close();
    }
    await c.close();
  }
  fs.writeFileSync("out/rapport.json", JSON.stringify(report, null, 1));
  await b.close();
})();
