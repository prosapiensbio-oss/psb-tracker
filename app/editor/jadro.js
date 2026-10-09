
(() => {
  // ── ČISTÁ MATEMATIKA (rovnaká, ako pôjde do Kokpitu) ──
  const MAX_ZOOM = 6;
  const rozlozenie = (v, fw, fh, ow, oh) => {
    const s = Math.max(ow / fw, oh / fh) * v.zoom;
    const sirka = fw * s, vyska = fh * s;
    return { sirka, vyska, vlavo: ow / 2 + v.x * ow - sirka / 2, hore: oh / 2 + v.y * oh - vyska / 2 };
  };
  const obmedz = (v, fw, fh, ow, oh) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
    const s = Math.max(ow / fw, oh / fh) * zoom;
    const mx = Math.max(0, (fw * s - ow) / 2 / ow), my = Math.max(0, (fh * s - oh) / 2 / oh);
    return { zoom, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };
  const zoomOkolo = (v, z, bx, by) => {
    z = Math.min(MAX_ZOOM, Math.max(1, z));
    const k = z / v.zoom;
    return { zoom: z, x: bx - (bx - v.x) * k, y: by - (by - v.y) * k };
  };

  // ── STAV ──
  const okna = [...document.querySelectorAll(".okno")];
  // Polovice začínajú prázdne — klik do nich (alebo pretiahnutie) vloží fotku.
  const stav = [0, 1].map(() => ({ src: null, den: "", v: { zoom: 1, x: 0, y: 0 }, zrkadlo: false, fw: 1, fh: 1 }));
  let aktivne = 0;
  let rozdelenie = "vedla";
  let priehladnost = 0.5;
  const mriezka = { druh: "ziadna", hustota: 10, farba: "rgba(255,255,255,.75)" };
  /** Čiary mriežky v jednotkách 0–1 celého štvorca — rovnaké pre obrazovku aj export. */
  const ciaryMriezky = () => {
    if (mriezka.druh === "ziadna") return { zvisle: [], vodorovne: [] };
    const n = mriezka.hustota;
    const krok = Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);
    return { zvisle: mriezka.druh === "stvorce" ? krok : [], vodorovne: krok };
  };
  const svg = document.getElementById("mriezka");
  function kresliMriezku() {
    const { zvisle, vodorovne } = ciaryMriezky();
    svg.setAttribute("viewBox", "0 0 1000 1000");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = [
      ...zvisle.map((t) => `<line x1="${t * 1000}" y1="0" x2="${t * 1000}" y2="1000"/>`),
      ...vodorovne.map((t) => `<line x1="0" y1="${t * 1000}" x2="1000" y2="${t * 1000}"/>`),
    ].join("");
    svg.querySelectorAll("line").forEach((l) => { l.setAttribute("stroke", mriezka.farba); l.setAttribute("stroke-width", "1"); l.setAttribute("vector-effect", "non-scaling-stroke"); });
  }
  const stvorec = document.getElementById("stvorec");

  // ── ČIARY A UHLY ──
  // Bod čiary je uložený v súradniciach FOTKY (u, v ∈ 0–1), nie štvorca —
  // preto ide s fotkou, keď ju posunieš, zväčšíš alebo zrkadlíš.
  let ciary = [];       // { id, okno, a: {u,v}, b: {u,v}, farba }
  let rezimCiar = false;
  let vybrana = null;
  let farbaCiar = "#ff8a1f";
  let dalsieId = 1;
  const svgCiary = document.getElementById("ciary");
  const desatinne = (n) => n.toFixed(1).replace(".", ",");
  /** Obdĺžniky okien na obrazovke (px od rohu štvorca). */
  const oknaNaObrazovke = () => okna.map((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.clientWidth, h: el.clientHeight }));
  const bodVOkne = (i, p, R) => {
    const s = stav[i], r = rozlozenie(s.v, s.fw, s.fh, R[i].w, R[i].h);
    return { x: R[i].x + r.vlavo + (s.zrkadlo ? 1 - p.u : p.u) * r.sirka, y: R[i].y + r.hore + p.v * r.vyska };
  };
  const bodZOkna = (i, x, y, R) => {
    const s = stav[i], r = rozlozenie(s.v, s.fw, s.fh, R[i].w, R[i].h);
    const u = (x - R[i].x - r.vlavo) / r.sirka;
    return { u: s.zrkadlo ? 1 - u : u, v: (y - R[i].y - r.hore) / r.vyska };
  };
  const rovnakyBod = (p, q) => Math.abs(p.u - q.u) < 1e-9 && Math.abs(p.v - q.v) < 1e-9;
  /** Sklon čiary: k vodorovnej, ak je bližšie k nej, inak k zvislej. */
  const sklonCiary = (A, B) => {
    const k = Math.atan2(Math.abs(B.y - A.y), Math.abs(B.x - A.x)) * 180 / Math.PI;
    return k <= 45 ? `↔ ${desatinne(k)}°` : `↕ ${desatinne(90 - k)}°`;
  };

  /**
   * Čo nakresliť — spoločné pre obrazovku (k = 1) aj export (k = pomer).
   * Vracia zoznam tvarov, ktoré vie nakresliť SVG aj plátno.
   */
  function tvaryCiar(R, k, sSklonom) {
    const tvary = [];
    const body = ciary.filter((c) => stav[c.okno]?.src).map((c) => ({ c, A: bodVOkne(c.okno, c.a, R), B: bodVOkne(c.okno, c.b, R) }));
    for (const { c, A, B } of body) {
      tvary.push({ typ: "ciara", okno: c.okno, A, B, farba: c.farba, vybrana: c.id === vybrana });
      if (sSklonom) {
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
        // popiska kolmo od stredu čiary, vždy „nad" ňou
        let nx = -dy / d, ny = dx / d;
        if (ny > 0) { nx = -nx; ny = -ny; }
        tvary.push({ typ: "text", x: (A.x + B.x) / 2 + nx * 16 * k, y: (A.y + B.y) / 2 + ny * 16 * k, text: sklonCiary(A, B), velkost: 12, farba: c.farba });
      }
    }
    // Uhol medzi dvoma čiarami, ktoré majú spoločný koniec (v tej istej fotke).
    for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) {
      const p = body[i], q = body[j];
      if (p.c.okno !== q.c.okno) continue;
      const konce = [["a", "A", "B"], ["b", "B", "A"]];
      for (const [kp, Vp, Op] of konce) for (const [kq, , Oq] of konce) {
        if (!rovnakyBod(p.c[kp], q.c[kq])) continue;
        const V = p[Vp], P1 = p[Op], P2 = q[Oq];
        const a1 = Math.atan2(P1.y - V.y, P1.x - V.x), a2 = Math.atan2(P2.y - V.y, P2.x - V.x);
        let uhol = Math.abs(a2 - a1) * 180 / Math.PI;
        if (uhol > 180) uhol = 360 - uhol;
        const r = 26 * k;
        const kriz = (P1.x - V.x) * (P2.y - V.y) - (P1.y - V.y) * (P2.x - V.x);
        const z = { x: V.x + r * Math.cos(a1), y: V.y + r * Math.sin(a1) }, na = { x: V.x + r * Math.cos(a2), y: V.y + r * Math.sin(a2) };
        tvary.push({ typ: "oblúk", okno: p.c.okno, d: `M ${z.x} ${z.y} A ${r} ${r} 0 0 ${kriz > 0 ? 1 : 0} ${na.x} ${na.y}`, farba: p.c.farba });
        // os uhla — popiska ide do jeho vnútra
        let bx = Math.cos(a1) + Math.cos(a2), by = Math.sin(a1) + Math.sin(a2);
        const bd = Math.hypot(bx, by);
        if (bd < 1e-6) { bx = -Math.sin(a1); by = Math.cos(a1); } else { bx /= bd; by /= bd; }
        tvary.push({ typ: "text", x: V.x + bx * (r + 20 * k), y: V.y + by * (r + 20 * k), text: `${desatinne(uhol)}°`, velkost: 15, tucne: true, farba: p.c.farba });
      }
    }
    return tvary;
  }

  function kresliCiary() {
    const R = oknaNaObrazovke();
    const sSklonom = document.getElementById("sklon").checked;
    const tvary = tvaryCiar(R, 1, sSklonom);
    const klipy = rozdelenie === "cez" ? "" : R.map((r, i) => `<clipPath id="okno${i}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`).join("");
    const klip = (i) => (rozdelenie === "cez" ? "" : `clip-path="url(#okno${i})"`);
    const html = [`<defs>${klipy}</defs>`];
    for (const t of tvary) {
      if (t.typ === "ciara") {
        html.push(`<g ${klip(t.okno)}>
          <line x1="${t.A.x}" y1="${t.A.y}" x2="${t.B.x}" y2="${t.B.y}" stroke="rgba(0,0,0,.45)" stroke-width="${t.vybrana ? 6 : 4}" stroke-linecap="round"/>
          <line x1="${t.A.x}" y1="${t.A.y}" x2="${t.B.x}" y2="${t.B.y}" stroke="${t.farba}" stroke-width="${t.vybrana ? 3.5 : 2}" stroke-linecap="round" ${t.vybrana ? 'stroke-dasharray="8 5"' : ""}/>
          ${[t.A, t.B].map((b) => `<circle cx="${b.x}" cy="${b.y}" r="${rezimCiar ? 6 : 3.5}" fill="${rezimCiar ? "rgba(0,0,0,.35)" : t.farba}" stroke="${t.farba}" stroke-width="2"/>`).join("")}
        </g>`);
      } else if (t.typ === "oblúk") {
        html.push(`<path d="${t.d}" fill="none" stroke="${t.farba}" stroke-width="2" ${klip(t.okno)}/>`);
      } else {
        const sirka = t.text.length * t.velkost * 0.6 + 12;
        const v = t.velkost + 9;
        html.push(`<g transform="translate(${t.x} ${t.y})">
          <rect x="${-sirka / 2}" y="${-v / 2}" width="${sirka}" height="${v}" rx="6" fill="rgba(20,20,20,.72)"/>
          <text x="0" y="0" fill="#fff" font-size="${t.velkost}" font-weight="${t.tucne ? 700 : 600}" text-anchor="middle" dominant-baseline="central">${t.text}</text>
        </g>`);
      }
    }
    svgCiary.innerHTML = html.join("");
    document.getElementById("zmazVybranu").disabled = vybrana == null;
    document.getElementById("zmazVsetky").disabled = !ciary.length;
    window.poZmene?.();
  }

  /** Kreslenie na plátno pri exporte — tie isté tvary. */
  function ciaryNaPlatno(x, R, k, N) {
    const tvary = tvaryCiar(R, k, document.getElementById("sklon").checked);
    for (const t of tvary) {
      x.save();
      if (rozdelenie !== "cez" && t.okno != null) { x.beginPath(); x.rect(R[t.okno].x, R[t.okno].y, R[t.okno].w, R[t.okno].h); x.clip(); }
      if (t.typ === "ciara") {
        x.lineCap = "round";
        x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 4 * k;
        x.beginPath(); x.moveTo(t.A.x, t.A.y); x.lineTo(t.B.x, t.B.y); x.stroke();
        x.strokeStyle = t.farba; x.lineWidth = 2 * k;
        x.beginPath(); x.moveTo(t.A.x, t.A.y); x.lineTo(t.B.x, t.B.y); x.stroke();
        x.fillStyle = t.farba;
        for (const b of [t.A, t.B]) { x.beginPath(); x.arc(b.x, b.y, 3.5 * k, 0, Math.PI * 2); x.fill(); }
      } else if (t.typ === "oblúk") {
        // oblúk sa počíta s polomerom v px exportu, Path2D zoberie ten istý zápis
        x.strokeStyle = t.farba; x.lineWidth = 2 * k; x.stroke(new Path2D(t.d));
      } else {
        x.font = `${t.tucne ? 700 : 600} ${t.velkost * k}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const w = x.measureText(t.text).width + 12 * k, h = (t.velkost + 9) * k;
        x.fillStyle = "rgba(20,20,20,.72)";
        x.beginPath(); x.roundRect(t.x - w / 2, t.y - h / 2, w, h, 6 * k); x.fill();
        x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(t.text, t.x, t.y);
      }
      x.restore();
    }
  }

  // Ovládanie kreslenia — myš aj prst.
  (() => {
    let tah = null; // { druh: "nova" | "koniec", ciara, kluce: [[ciara, "a"|"b"], …] }
    const miesto = (e) => { const b = stvorec.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const oknoPodBodom = (P, R) => {
      if (rozdelenie === "cez") return aktivne;
      return R.findIndex((r) => P.x >= r.x && P.x <= r.x + r.w && P.y >= r.y && P.y <= r.y + r.h);
    };
    const vzdialenostOdUsecky = (P, A, B) => {
      const dx = B.x - A.x, dy = B.y - A.y, l = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / l));
      return Math.hypot(P.x - A.x - t * dx, P.y - A.y - t * dy);
    };
    svgCiary.addEventListener("pointerdown", (e) => {
      if (!rezimCiar) return;
      e.preventDefault();
      const R = oknaNaObrazovke(), P = miesto(e);
      // 1) chytil koniec existujúcej čiary → ťahá ho (aj spojené konce s ním)
      let najblizsi = null;
      for (const c of ciary) {
        if (!stav[c.okno]?.src) continue;
        for (const kl of ["a", "b"]) {
          const B = bodVOkne(c.okno, c[kl], R), d = Math.hypot(B.x - P.x, B.y - P.y);
          if (d < 12 && (!najblizsi || d < najblizsi.d)) najblizsi = { c, kl, d };
        }
      }
      // Koniec VYBRANEJ čiary sa ťahá (doladenie). Koniec nevybranej je
      // začiatok novej čiary — tak vzniká uhol (koleno, bedro, krk).
      // 2) klik na čiaru → vyberie ju; 3) inak nová čiara.
      const okno = oknoPodBodom(P, R);
      if (najblizsi && najblizsi.c.id === vybrana) {
        const bod = najblizsi.c[najblizsi.kl];
        const spojene = ciary.flatMap((c) => ["a", "b"].filter((kl) => c.okno === najblizsi.c.okno && rovnakyBod(c[kl], bod)).map((kl) => [c, kl]));
        tah = { druh: "koniec", kluce: spojene, okno: najblizsi.c.okno };
      } else {
        const naCiare = !najblizsi && ciary.find((c) => stav[c.okno]?.src && vzdialenostOdUsecky(P, bodVOkne(c.okno, c.a, R), bodVOkne(c.okno, c.b, R)) < 7);
        if (naCiare) { vybrana = naCiare.id; kresliCiary(); return; }
        if (okno < 0 || !stav[okno].src) return;
        let zaciatok = bodZOkna(okno, P.x, P.y, R);
        if (najblizsi && najblizsi.c.okno === okno) zaciatok = { ...najblizsi.c[najblizsi.kl] };
        const c = { id: dalsieId++, okno, a: zaciatok, b: { ...zaciatok }, farba: farbaCiar };
        ciary.push(c);
        vybrana = c.id;
        tah = { druh: "nova", kluce: [[c, "b"]], okno, ciara: c };
      }
      svgCiary.setPointerCapture(e.pointerId);
      kresliCiary();
    });
    svgCiary.addEventListener("pointermove", (e) => {
      if (!tah) return;
      const R = oknaNaObrazovke(), r = R[tah.okno];
      let P = miesto(e);
      if (rozdelenie !== "cez") P = { x: Math.max(r.x, Math.min(r.x + r.w, P.x)), y: Math.max(r.y, Math.min(r.y + r.h, P.y)) };
      // prichytenie ku koncu inej čiary v tej istej fotke
      let ciel = bodZOkna(tah.okno, P.x, P.y, R);
      for (const c of ciary) {
        if (c.okno !== tah.okno || tah.kluce.some(([cc]) => cc === c)) continue;
        for (const kl of ["a", "b"]) {
          const B = bodVOkne(c.okno, c[kl], R);
          if (Math.hypot(B.x - P.x, B.y - P.y) < 10) ciel = { ...c[kl] };
        }
      }
      // Shift = presne vodorovne/zvisle (olovnica)
      if (e.shiftKey && tah.druh === "nova") {
        const A = bodVOkne(tah.okno, tah.ciara.a, R);
        const Pp = Math.abs(P.x - A.x) > Math.abs(P.y - A.y) ? { x: P.x, y: A.y } : { x: A.x, y: P.y };
        ciel = bodZOkna(tah.okno, Pp.x, Pp.y, R);
      }
      for (const [c, kl] of tah.kluce) c[kl] = { ...ciel };
      kresliCiary();
    });
    const pusti = () => {
      if (!tah) return;
      if (tah.druh === "nova") {
        const R = oknaNaObrazovke(), A = bodVOkne(tah.okno, tah.ciara.a, R), B = bodVOkne(tah.okno, tah.ciara.b, R);
        if (Math.hypot(B.x - A.x, B.y - A.y) < 5) ciary = ciary.filter((c) => c !== tah.ciara);
        // Nová čiara sa po dokreslení nevyberá — ďalší ťah z jej konca má
        // začať novú čiaru (uhol), nie posúvať tento koniec.
        vybrana = null;
      }
      tah = null;
      kresliCiary();
    };
    svgCiary.addEventListener("pointerup", pusti);
    svgCiary.addEventListener("pointercancel", pusti);
  })();
  const nastavRezim = (zap) => {
    rezimCiar = zap;
    svgCiary.classList.toggle("kreslim", zap);
    const b = document.getElementById("kreslit");
    b.classList.toggle("hlavne", zap);
    b.textContent = zap ? "✓ kreslím — vypnúť" : "✎ kresliť čiary";
    kresliCiary();
  };
  /** Sklon a uhly vybranej čiary — pre panel. */
  function infoVybranej() {
    const c = ciary.find((q) => q.id === vybrana);
    if (!c || !stav[c.okno]?.src) return null;
    const R = oknaNaObrazovke(), A = bodVOkne(c.okno, c.a, R), B = bodVOkne(c.okno, c.b, R);
    const k = Math.atan2(Math.abs(B.y - A.y), Math.abs(B.x - A.x)) * 180 / Math.PI;
    const sklon = k <= 45 ? { znak: "↔", hodnota: desatinne(k), od: "od vodorovnej" } : { znak: "↕", hodnota: desatinne(90 - k), od: "od zvislej" };
    const uhly = [];
    for (const d of ciary) {
      if (d === c || d.okno !== c.okno) continue;
      for (const kc of ["a", "b"]) for (const kd of ["a", "b"]) {
        if (!rovnakyBod(c[kc], d[kd])) continue;
        const V = bodVOkne(c.okno, c[kc], R), P1 = bodVOkne(c.okno, c[kc === "a" ? "b" : "a"], R), P2 = bodVOkne(d.okno, d[kd === "a" ? "b" : "a"], R);
        let u = Math.abs(Math.atan2(P2.y - V.y, P2.x - V.x) - Math.atan2(P1.y - V.y, P1.x - V.x)) * 180 / Math.PI;
        if (u > 180) u = 360 - u;
        uhly.push(desatinne(u));
      }
    }
    return { sklon, uhly, farba: c.farba };
  }
  const zmazVybranu = () => { ciary = ciary.filter((c) => c.id !== vybrana); vybrana = null; kresliCiary(); };

  const denCz = (d) => { if (!d) return ""; const [r, m, dd] = d.split("-"); return `${Number(dd)}. ${Number(m)}. ${r}`; };
  // Po česky: hotová fotka ide klientovi alebo na sociálne siete (Jerry vybral
  // návrh D s českými štítkami, 9. 10. 2026).
  const popisky = () => {
    const [a, b] = [stav[0].den, stav[1].den];
    return a && b && a > b ? ["potom", "předtím"] : ["předtím", "potom"];
  };
  const rozmerOkna = (el) => ({ ow: el.clientWidth, oh: el.clientHeight });

  function kresli() {
    const pop = popisky();
    okna.forEach((el, i) => {
      const s = stav[i];
      el.classList.toggle("aktivne", i === aktivne);
      if (!s.src) {
        el.innerHTML = `<div class="prazdne"><b>+</b>vložiť fotku</div>`;
        return;
      }
      let img = el.querySelector("img");
      if (!img || img.dataset.src !== s.src) {
        el.innerHTML = `<img alt=""><div class="popiska"></div>`;
        img = el.querySelector("img");
        img.dataset.src = s.src;
        img.onload = () => { s.fw = img.naturalWidth; s.fh = img.naturalHeight; kresli(); };
        img.src = s.src;
      }
      const { ow, oh } = rozmerOkna(el);
      s.v = obmedz(s.v, s.fw, s.fh, ow, oh);
      const r = rozlozenie(s.v, s.fw, s.fh, ow, oh);
      img.style.width = `${r.sirka}px`;
      img.style.height = `${r.vyska}px`;
      img.style.transform = s.zrkadlo
        ? `translate(${r.vlavo + r.sirka}px, ${r.hore}px) scaleX(-1)`
        : `translate(${r.vlavo}px, ${r.hore}px)`;
      el.querySelector(".popiska").innerHTML = `${pop[i]}<small>${denCz(s.den)}</small>`;
      img.style.opacity = rozdelenie === "cez" && i === 1 ? String(priehladnost) : "1";
    });
    kresliMriezku();
    kresliCiary();
    // panel
    const s = stav[aktivne];
    document.getElementById("zoom").value = s.v.zoom;
    document.getElementById("den").value = s.den || "";
    const nazvy = rozdelenie === "vedla" ? ["ľavá", "pravá"] : rozdelenie === "pod" ? ["horná", "dolná"] : ["spodná", "vrchná"];
    const pop2 = popisky();
    document.querySelectorAll("#vyberOkna button").forEach((b, i) => {
      (b.querySelector(".t") || b).textContent = `${nazvy[i]} · ${pop2[i]}`;
      const d = b.querySelector(".d");
      if (d) d.textContent = denCz(stav[i].den) || "bez dňa";
      b.classList.toggle("on", i === aktivne);
    });
    document.querySelectorAll("[data-nahlad]").forEach((img) => {
      const src = stav[Number(img.dataset.nahlad)].src;
      if (src && img.getAttribute("src") !== src) img.src = src;
    });
    window.poZmene?.();
  }

  // ── ŤAHANIE A ŠTIPNUTIE (pointer events: myš, prst, pero) ──
  okna.forEach((el, i) => {
    const prsty = new Map();
    let posledne = null; // { x, y, d } – stred a vzdialenosť prstov
    const stredPrstov = () => {
      const p = [...prsty.values()];
      const x = p.reduce((a, q) => a + q.x, 0) / p.length, y = p.reduce((a, q) => a + q.y, 0) / p.length;
      const d = p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
      return { x, y, d };
    };
    el.addEventListener("pointerdown", (e) => {
      aktivne = i;
      if (!stav[i].src) { kresli(); otvorVyber(); return; }
      el.setPointerCapture(e.pointerId);
      prsty.set(e.pointerId, { x: e.clientX, y: e.clientY });
      posledne = stredPrstov();
      el.classList.add("tahanie");
      kresli();
    });
    el.addEventListener("pointermove", (e) => {
      if (!prsty.has(e.pointerId)) return;
      prsty.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const teraz = stredPrstov();
      const s = stav[i];
      const { ow, oh } = rozmerOkna(el);
      let v = { ...s.v, x: s.v.x + (teraz.x - posledne.x) / ow, y: s.v.y + (teraz.y - posledne.y) / oh };
      if (prsty.size > 1 && posledne.d > 0) {
        const box = el.getBoundingClientRect();
        v = zoomOkolo(v, v.zoom * (teraz.d / posledne.d), (teraz.x - box.left) / ow - 0.5, (teraz.y - box.top) / oh - 0.5);
      }
      s.v = obmedz(v, s.fw, s.fh, ow, oh);
      posledne = teraz;
      kresli();
    });
    const koniec = (e) => {
      prsty.delete(e.pointerId);
      posledne = prsty.size ? stredPrstov() : null;
      if (!prsty.size) el.classList.remove("tahanie");
    };
    el.addEventListener("pointerup", koniec);
    el.addEventListener("pointercancel", koniec);
    // Touchpad: dva prsty = posun, roztiahnutie (ctrl) = zväčšenie.
    el.addEventListener("wheel", (e) => {
      const s = stav[i];
      if (!s.src) return;
      e.preventDefault();
      aktivne = i;
      const { ow, oh } = rozmerOkna(el);
      const box = el.getBoundingClientRect();
      let v = s.v;
      if (e.ctrlKey) v = zoomOkolo(v, v.zoom * Math.exp(-e.deltaY * 0.01), (e.clientX - box.left) / ow - 0.5, (e.clientY - box.top) / oh - 0.5);
      else v = { ...v, x: v.x - e.deltaX / ow, y: v.y - e.deltaY / oh };
      s.v = obmedz(v, s.fw, s.fh, ow, oh);
      kresli();
    }, { passive: false });
    // Safari na Macu posiela štipnutie ako gesture*.
    let gz = 1;
    el.addEventListener("gesturestart", (e) => { e.preventDefault(); gz = stav[i].v.zoom; });
    el.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      const s = stav[i]; const { ow, oh } = rozmerOkna(el);
      s.v = obmedz({ ...s.v, zoom: gz * e.scale }, s.fw, s.fh, ow, oh); kresli();
    });
    el.addEventListener("dblclick", () => { stav[i].v = { zoom: 1, x: 0, y: 0 }; kresli(); });
  });

  // ── PANEL ──
  const subor = document.getElementById("subor");
  const otvorVyber = () => subor.click();
  /** Vloží obrázok (adresu) do polovice i. Fotka zo súboru aj snímka z videa. */
  function vlozObrazok(i, src, den, vlastny) {
    const s = stav[i];
    if (s.src && s.src.startsWith("blob:") && s.vlastny) URL.revokeObjectURL(s.src);
    Object.assign(s, { src, vlastny: !!vlastny, v: { zoom: 1, x: 0, y: 0 }, zrkadlo: false });
    if (den) s.den = den;
    ciary = ciary.filter((c) => c.okno !== i); // čiary patrili starej fotke
    aktivne = i;
    kresli();
  }
  /**
   * DÁTUM ODFOTENIA ZO SÚBORU (EXIF DateTimeOriginal).
   *
   * Jerry, 9. 10. 2026: „uprav to, nech berie dátum z fotky." Dátum súboru
   * (`lastModified`) pri výbere z galérie iPhonu často nie je deň odfotenia,
   * ale chvíľa výberu — a z neho sa píše štítok PŘEDTÍM/POTOM aj nadpis karty
   * „N týdnů práce". EXIF nesie skutočný deň: hľadá sa blok „Exif\0\0" + TIFF
   * hlavička (JPEG aj HEIC ho majú rovnako) a v ňom tag 0x9003, potom 0x9004
   * a 0x0132. Nič z toho nie je = prázdny reťazec, nastúpi dátum súboru.
   */
  function datumExif(b) {
    const n = Math.min(b.length, 1 << 19);
    let t = -1;
    for (let i = 0; i + 10 < n; i++) {
      if (b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66 && b[i + 4] === 0 && b[i + 5] === 0
        && ((b[i + 6] === 0x49 && b[i + 7] === 0x49) || (b[i + 6] === 0x4d && b[i + 7] === 0x4d))) { t = i + 6; break; }
    }
    if (t < 0) return "";
    const le = b[t] === 0x49;
    const u16 = (o) => (t + o + 1 < b.length ? (le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1]) : 0);
    const u32 = (o) => (t + o + 3 < b.length ? (le ? (b[t + o] | (b[t + o + 1] << 8) | (b[t + o + 2] << 16)) + b[t + o + 3] * 2 ** 24 : b[t + o] * 2 ** 24 + ((b[t + o + 1] << 16) | (b[t + o + 2] << 8) | b[t + o + 3])) : 0);
    const precitajIfd = (o) => {
      const tagy = {};
      if (!o || t + o + 2 > b.length) return tagy;
      const pocet = u16(o);
      for (let k = 0; k < pocet && k < 400; k++) {
        const e = o + 2 + k * 12;
        tagy[u16(e)] = { typ: u16(e + 2), pocet: u32(e + 4), hodnota: u32(e + 8) };
      }
      return tagy;
    };
    const text = (z) => {
      if (!z || z.typ !== 2 || z.pocet < 10) return "";
      const o = z.pocet <= 4 ? -1 : z.hodnota;
      if (o < 0) return "";
      let s = "";
      for (let k = 0; k < Math.min(z.pocet, 20); k++) s += String.fromCharCode(b[t + o + k] || 0);
      const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(s);
      return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : "";
    };
    const ifd0 = precitajIfd(u32(4));
    const exif = ifd0[0x8769] ? precitajIfd(ifd0[0x8769].hodnota) : {};
    return text(exif[0x9003]) || text(exif[0x9004]) || text(ifd0[0x0132]);
  }
  async function vlozSubor(i, f) {
    if (!f || !f.type.startsWith("image/")) return;
    // Deň odfotenia z EXIF; keď chýba, dátum súboru. Dá sa prepísať v „deň fotky".
    let den = "";
    try { den = datumExif(new Uint8Array(await f.slice(0, 1 << 19).arrayBuffer())); } catch { /* bez EXIF */ }
    if (!den && f.lastModified) den = new Date(f.lastModified).toISOString().slice(0, 10);
    vlozObrazok(i, URL.createObjectURL(f), den, true);
  }
  subor.addEventListener("change", () => { vlozSubor(aktivne, subor.files?.[0]); subor.value = ""; });
  // Pretiahnutie z Findera alebo zo zásobníka snímok priamo do polovice.
  okna.forEach((el, i) => {
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const sn = e.dataTransfer?.getData("text/x-snimka");
      if (sn) window.snimkaDoPolovice?.(Number(sn), i);
      else vlozSubor(i, e.dataTransfer?.files?.[0]);
    });
  });
  document.getElementById("vlozit").onclick = otvorVyber;
  document.querySelectorAll("#vyberOkna button").forEach((b) => b.onclick = () => { aktivne = Number(b.dataset.i); kresli(); });
  document.getElementById("zoom").oninput = (e) => {
    const s = stav[aktivne]; const { ow, oh } = rozmerOkna(okna[aktivne]);
    s.v = obmedz(zoomOkolo(s.v, Number(e.target.value), 0, 0), s.fw, s.fh, ow, oh); kresli();
  };
  document.getElementById("den").onchange = (e) => { stav[aktivne].den = e.target.value; kresli(); };
  document.getElementById("zrkadlo").onclick = () => { stav[aktivne].zrkadlo = !stav[aktivne].zrkadlo; kresli(); };
  document.getElementById("reset").onclick = () => { stav[aktivne].v = { zoom: 1, x: 0, y: 0 }; kresli(); };
  document.getElementById("vymenit").onclick = () => { stav.reverse(); ciary.forEach((c) => { c.okno = 1 - c.okno; }); okna.forEach((el) => el.innerHTML = ""); aktivne = 1 - aktivne; kresli(); };
  document.getElementById("popisky").onchange = (e) => stvorec.classList.toggle("skryte-popisky", !e.target.checked);
  document.getElementById("medzera").oninput = (e) => stvorec.style.setProperty("--medzera", `${e.target.value}px`);
  document.querySelectorAll("#rozdelenie button").forEach((b) => b.onclick = () => {
    rozdelenie = b.dataset.v;
    document.querySelectorAll("#rozdelenie button").forEach((x) => x.classList.toggle("on", x === b));
    stvorec.classList.toggle("pod", rozdelenie === "pod");
    stvorec.classList.toggle("cez", rozdelenie === "cez");
    document.getElementById("riadokMedzera").hidden = rozdelenie === "cez";
    document.getElementById("riadokPriehladnost").hidden = rozdelenie !== "cez";
    document.getElementById("napovedaCez").hidden = rozdelenie !== "cez";
    requestAnimationFrame(kresli);
  });
  document.getElementById("priehladnost").oninput = (e) => {
    priehladnost = Number(e.target.value) / 100;
    document.getElementById("priehladnostH").textContent = `${e.target.value} %`;
    kresli();
  };
  const prepinac = (id, nastav) => document.querySelectorAll(`#${id} button`).forEach((b) => b.onclick = () => {
    document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
    nastav(b.dataset.v);
    kresliMriezku();
  });
  prepinac("mriezkaDruh", (v) => { mriezka.druh = v; });
  prepinac("mriezkaFarba", (v) => { mriezka.farba = v; });
  document.getElementById("hustota").oninput = (e) => {
    mriezka.hustota = Number(e.target.value);
    document.getElementById("hustotaH").textContent = e.target.value;
    kresliMriezku();
  };
  document.getElementById("kreslit").onclick = () => nastavRezim(!rezimCiar);
  document.getElementById("zmazVybranu").onclick = zmazVybranu;
  document.getElementById("zmazVsetky").onclick = () => { if (confirm("Zmazať všetky čiary?")) { ciary = []; vybrana = null; kresliCiary(); } };
  document.getElementById("sklon").onchange = kresliCiary;
  document.querySelectorAll("#farbaCiar button").forEach((b) => b.onclick = () => {
    document.querySelectorAll("#farbaCiar button").forEach((x) => x.classList.toggle("on", x === b));
    farbaCiar = b.dataset.v;
    const c = ciary.find((q) => q.id === vybrana);
    if (c) c.farba = farbaCiar; // farba sa dá zmeniť aj vybranej čiare
    kresliCiary();
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input")) return;
    if (e.key === "Escape" && rezimCiar) nastavRezim(false);
    if ((e.key === "Delete" || e.key === "Backspace") && vybrana != null) { e.preventDefault(); zmazVybranu(); }
  });
  addEventListener("resize", kresli);

  // ── ZNAČKA DO EXPORTU (návrh D a karta na Instagram, Jerry 9. 10. 2026) ──
  // Písmo Agrandir a postavička/nápis z /public. Načítajú sa raz; keď niečo
  // nedorazí, export ide ďalej bez toho (systémové písmo, bez vodoznaku).
  const ZNACKA = { pismo: false, figura: null, napis: null };
  const obrazok = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const znackaHotova = (async () => {
    try { const f = new FontFace("Agrandir", "url(/agrandir.woff2)"); await f.load(); document.fonts.add(f); ZNACKA.pismo = true; } catch { /* systémové písmo */ }
    ZNACKA.figura = await obrazok("/znacka-figura-biela.svg");
    ZNACKA.napis = await obrazok("/znacka-napis-zelena.svg");
  })();
  const pismo = (vaha, px) => `${vaha} ${px}px ${ZNACKA.pismo ? "Agrandir, " : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  // ── EXPORT: ten istý výrez vo veľkom rozlíšení ──
  /** Nakreslí celý štvorec (fotky, popisky, mriežku, čiary) do plátna c. */
  function kresliCelok(c) {
    const N = c.width;
    const medzeraObr = Number(document.getElementById("medzera").value);
    const pomer = N / stvorec.clientWidth;
    const g = Math.round(medzeraObr * pomer);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, N, N);
    const vedla = rozdelenie === "vedla", cez = rozdelenie === "cez";
    const ow = cez ? N : vedla ? (N - g) / 2 : N, oh = cez ? N : vedla ? N : (N - g) / 2;
    const pop = popisky();
    const sPopiskami = document.getElementById("popisky").checked;
    okna.forEach((el, i) => {
      const s = stav[i];
      const ox = cez ? 0 : vedla ? i * (ow + g) : 0, oy = cez ? 0 : vedla ? 0 : i * (oh + g);
      const img = el.querySelector("img");
      x.save();
      x.beginPath(); x.rect(ox, oy, ow, oh); x.clip();
      if (cez && i === 1) x.globalAlpha = priehladnost;
      if (img && s.src) {
        const r = rozlozenie(s.v, s.fw, s.fh, ow, oh);
        if (s.zrkadlo) { x.translate(ox + r.vlavo + r.sirka, oy + r.hore); x.scale(-1, 1); x.drawImage(img, 0, 0, r.sirka, r.vyska); }
        else x.drawImage(img, ox + r.vlavo, oy + r.hore, r.sirka, r.vyska);
      } else { x.fillStyle = "#ddd"; x.fillRect(ox, oy, ow, oh); }
      x.restore();
      if (sPopiskami && s.src) {
        // Návrh D: biely štítok v hornom rohu polovice — PŘEDTÍM 3. 6. 2026.
        // Pri prekrytí („cez") stojí druhý štítok vpravo, aby sa neprekryli.
        const k = N / 2000;
        const t1 = pop[i].toUpperCase(), t2 = denCz(s.den);
        x.font = pismo(600, 40 * k);
        const w1 = x.measureText(t1).width + (ZNACKA.pismo ? 3 * k * t1.length : 0);
        x.font = pismo(400, 36 * k);
        const w2 = t2 ? x.measureText(t2).width + 30 * k : 0;
        const bw = w1 + w2 + 80 * k, bh = 84 * k;
        const bx = cez && i === 1 ? ox + ow - 50 * k - bw : ox + 50 * k, by = oy + 50 * k;
        x.fillStyle = "rgba(251,250,246,.94)";
        x.beginPath(); x.roundRect(bx, by, bw, bh, bh / 2); x.fill();
        x.textBaseline = "middle"; x.textAlign = "left";
        x.fillStyle = "#141513"; x.font = pismo(600, 40 * k);
        if ("letterSpacing" in x) x.letterSpacing = `${3 * k}px`;
        x.fillText(t1, bx + 40 * k, by + bh / 2 + 2 * k);
        if ("letterSpacing" in x) x.letterSpacing = "0px";
        if (t2) { x.fillStyle = "#8A8C85"; x.font = pismo(400, 36 * k); x.fillText(t2, bx + 40 * k + w1 + 30 * k, by + bh / 2 + 2 * k); }
      }
    });
    // Postavička ako nenápadný vodoznak vpravo dole (návrh D).
    if (ZNACKA.figura) {
      const k = N / 2000, fw = 70 * k, fh = fw * ZNACKA.figura.height / ZNACKA.figura.width;
      x.globalAlpha = 0.85; x.drawImage(ZNACKA.figura, N - 60 * k - fw, N - 60 * k - fh, fw, fh); x.globalAlpha = 1;
    }
    if (document.getElementById("mriezkaExport").checked) {
      const { zvisle, vodorovne } = ciaryMriezky();
      x.strokeStyle = mriezka.farba; x.lineWidth = Math.max(1, pomer);
      for (const t of zvisle) { x.beginPath(); x.moveTo(t * N, 0); x.lineTo(t * N, N); x.stroke(); }
      for (const t of vodorovne) { x.beginPath(); x.moveTo(0, t * N); x.lineTo(N, t * N); x.stroke(); }
    }
    if (document.getElementById("ciaryExport").checked && ciary.length) {
      const R = [0, 1].map((i) => ({ x: cez ? 0 : vedla ? i * (ow + g) : 0, y: cez ? 0 : vedla ? 0 : i * (oh + g), w: ow, h: oh }));
      const predVyber = vybrana; vybrana = null; // vybraná (prerušovaná) čiara nemá ísť do fotky
      ciaryNaPlatno(x, R, pomer, N);
      vybrana = predVyber;
    }
  }
  /** Hotový štvorec ako JPEG — na stiahnutie aj do kartotéky klienta. */
  async function vyrobJpeg(N = 2000) {
    await znackaHotova;
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    kresliCelok(c);
    return new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
  }

  /** „12 týdnů práce" z dátumov fotiek; bez dátumov všeobecný nadpis. */
  function nadpisKarty() {
    const [a, b] = [stav[0].den, stav[1].den].filter(Boolean).sort();
    if (!a || !b) return "Předtím a potom";
    const t = Math.round((Date.parse(b) - Date.parse(a)) / (7 * 86400000));
    if (t < 1) return "Předtím a potom";
    return `${t} ${t === 1 ? "týden" : t < 5 ? "týdny" : "týdnů"} práce`;
  }

  /**
   * KARTA NA INSTAGRAM 4 : 5 (návrh E). Nadpis z dátumov, štvorec z návrhu D
   * v zaoblenom okne, dole nápis a web. Zverejnenie chce samostatný súhlas
   * klienta — súhlas v anamnéze hovorí „nikde se nezveřejňují".
   */
  async function vyrobInstagram() {
    await znackaHotova;
    const W = 1600, H = 2000, m = 80, S = W - 2 * m, Y = 330;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#F2EFE7"; x.fillRect(0, 0, W, H);
    x.textBaseline = "alphabetic"; x.textAlign = "left";
    x.fillStyle = "#16483A"; x.font = pismo(700, 104); x.fillText(nadpisKarty(), m, 190);
    const dni = [stav[0].den, stav[1].den].filter(Boolean).sort().map(denCz);
    if (dni.length) { x.fillStyle = "#8A8C85"; x.font = pismo(400, 42); x.fillText(dni.join("  →  "), m, 262); }
    const sq = document.createElement("canvas"); sq.width = S; sq.height = S;
    kresliCelok(sq);
    x.save(); x.beginPath(); x.roundRect(m, Y, S, S, 36); x.clip(); x.drawImage(sq, m, Y); x.restore();
    if (ZNACKA.napis) { const w = 380, h = w * ZNACKA.napis.height / ZNACKA.napis.width; x.drawImage(ZNACKA.napis, m, H - 110 - h / 2, w, h); }
    x.fillStyle = "#141513"; x.font = pismo(500, 40); x.textAlign = "right"; x.fillText("prosapiens.cz", W - m, H - 96);
    return new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
  }
  const stiahni = (blob, nazov) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nazov; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const tlIg = document.getElementById("stiahnutIg");
  if (tlIg) tlIg.onclick = async () => stiahni(await vyrobInstagram(), "predtim-potom-instagram.jpg");
  document.getElementById("stiahnut").onclick = async () => stiahni(await vyrobJpeg(), "predtim-potom.jpg");

  window.skladacka = {
    nastavRezim, infoVybranej, kresli, vlozObrazok, vlozSubor, vyrobJpeg, vyrobInstagram, datumExif,
    get rezimCiar() { return rezimCiar; },
    get vybrana() { return vybrana; },
    get pocetCiar() { return ciary.length; },
    get rozdelenie() { return rozdelenie; },
    get mriezka() { return { ...mriezka }; },
    get aktivne() { return aktivne; },
    get stav() { return stav; },
    denCz,
  };
  kresli();
})();
