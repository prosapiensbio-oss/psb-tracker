
(() => {
  // ── ČISTÁ MATEMATIKA (rovnaká, ako pôjde do Kokpitu) ──
  const MAX_ZOOM = 6;
  const RAD = Math.PI / 180;
  const rozlozenie = (v, fw, fh, ow, oh) => {
    const s = Math.max(ow / fw, oh / fh) * v.zoom;
    const sirka = fw * s, vyska = fh * s;
    return { sirka, vyska, vlavo: ow / 2 + v.x * ow - sirka / 2, hore: oh / 2 + v.y * oh - vyska / 2 };
  };
  /** CSS transformácia fotky v okne (otočenie okolo stredu, zrkadlo) — obrazovka aj priesvitný presah. */
  const transformaciaFotky = (r, t, dx = 0, dy = 0) =>
    `translate(${dx + r.vlavo + r.sirka / 2}px, ${dy + r.hore + r.vyska / 2}px) rotate(${t.v.rot || 0}deg) scaleX(${t.zrkadlo ? -1 : 1}) translate(${-r.sirka / 2}px, ${-r.vyska / 2}px)`;
  /** To isté na plátno — export a lupa. */
  const fotkaNaPlatno = (x, img, t, ox, oy, r) => {
    x.translate(ox + r.vlavo + r.sirka / 2, oy + r.hore + r.vyska / 2);
    x.rotate((t.v.rot || 0) * RAD);
    x.scale(t.zrkadlo ? -1 : 1, 1);
    x.drawImage(img, -r.sirka / 2, -r.vyska / 2, r.sirka, r.vyska);
  };
  const obmedz = (v, fw, fh, ow, oh) => {
    // Skrytý editor (karta v Kokpite bez rozmerov) má okná 0 × 0 — delenie
    // nulou by dalo NaN a fotka by zmizla z obrazovky aj z exportu.
    if (!(ow > 0 && oh > 0 && fw > 0 && fh > 0)) return v;
    // Oddialiť sa dá, až kým nie je vidno celú fotku (12. 10. 2026: „oddialenú
    // fotku mám v rámčeku") — zoom 1 = fotka práve vyplní okno.
    // Otočená fotka (12. 10. 2026) sa meria svojím obaľujúcim obdĺžnikom.
    const uhol = (v.rot || 0) * RAD, cs = Math.abs(Math.cos(uhol)), sn = Math.abs(Math.sin(uhol));
    const bw = fw * cs + fh * sn, bh = fw * sn + fh * cs;
    const pokryt = Math.max(ow / fw, oh / fh), celu = Math.min(ow / bw, oh / bh);
    const zoom = Math.min(MAX_ZOOM, Math.max(celu / pokryt, v.zoom));
    const s = pokryt * zoom;
    // Väčšia fotka musí okno pokryť; menšia sa môže hýbať len vnútri okna.
    const mx = Math.abs(bw * s - ow) / 2 / ow, my = Math.abs(bh * s - oh) / 2 / oh;
    return { ...v, zoom, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };
  const zoomOkolo = (v, z, bx, by) => {
    z = Math.min(MAX_ZOOM, Math.max(0.05, z)); // dolnú hranicu (celá fotka) stráži obmedz
    const k = z / v.zoom;
    // (otočenie ostáva — zoomOkolo mení len mierku a posun)
    return { ...v, zoom: z, x: bx - (bx - v.x) * k, y: by - (by - v.y) * k };
  };

  // ── STAV ──
  /**
   * JEMNÝ POSUN (Jerry, 19. 10. 2026: „posuny sú o veľa pixelov naraz, skáče
   * to, často potrebujem posunúť len o milimetríky"). Pri zapnutom „jemne"
   * (alebo drž Alt/Option) ide ťahanie fotky, rohov aj ⟳ 10× pomalšie.
   * jemnyTah() premieta skutočný bod prsta na účinný; pri prepnutí režimu
   * uprostred ťahu sa základ presunie, takže nič neodskočí.
   */
  let jemneZap = false;
  const jemne = (e) => jemneZap || !!e?.altKey;
  const jemnyTah = () => {
    let ref = null;
    return (P, f) => {
      const k = f ? 0.1 : 1;
      if (!ref || ref.k !== k) ref = { P, E: ref ? ref.E2 : P, k };
      const E = { x: ref.E.x + (P.x - ref.P.x) * k, y: ref.E.y + (P.y - ref.P.y) * k };
      ref.E2 = E;
      return E;
    };
  };
  const okna = [...document.querySelectorAll(".okno")];
  // Polovice začínajú prázdne — klik do nich (alebo pretiahnutie) vloží fotku.
  const stav = [0, 1].map(() => ({ src: null, den: "", v: { zoom: 1, x: 0, y: 0 }, zrkadlo: false, fw: 1, fh: 1 }));
  let aktivne = 0;
  let rozdelenie = "vedla";
  let priehladnost = 0.5;
  const mriezka = { druh: "ziadna", hustota: 10, farba: "rgba(255,255,255,.75)" };
  /** Rozmery obrázka podľa adresy — po kroku späť či otvorení návrhu sa fotka nemusí čakať na načítanie, aby sedel výrez. */
  const rozmery = new Map(); // src → { fw, fh }
  /**
   * ŠTÍTOK PŘEDTÍM / POTOM s dátumom (Jerry, 12. 10. 2026: „chcel by som ho
   * zapnúť aj vypnúť, presunúť do iného rohu alebo dať rôzne dizajny").
   * Obrazovka aj stiahnutá fotka ho kreslia z tých istých rozmerov
   * (rozmerStitku) — predtým bol na obrazovke tmavý vľavo dole a v exporte
   * biely vľavo hore.
   */
  const stitok = { zap: true, roh: "lh", dizajn: "biely", velkost: "m" };
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
    zmena();
  }
  const stvorec = document.getElementById("stvorec");

  // ── ČIARY A UHLY ──
  // Bod čiary je uložený v súradniciach FOTKY (u, v ∈ 0–1), nie štvorca —
  // preto ide s fotkou, keď ju posunieš, zväčšíš alebo zrkadlíš.
  let ciary = [];       // { id, okno, a: {u,v}, b: {u,v}, farba }
  /**
   * VOĽNÁ KRESBA (Jerry, 12. 10. 2026: „možnosť aj kreslenia, aby som mohol
   * klientom zakresliť kyfózu alebo lordózu"). Ťah je zoznam bodov v
   * súradniciach fotky — ide s ňou pri posune, zväčšení aj zrkadle, ako čiary.
   */
  let kresby = [];      // { id, okno, body: [{u,v}], farba, hrubka }
  /**
   * KRÚŽOK SO ZVÄČŠENINOU (Jerry, 15. 10. 2026: „vyznačil by som oblasť
   * a v ňom by sa objavilo vyzoomované miesto"). Miesto (zdroj) je v
   * súradniciach fotky — ide s ňou ako čiary. Veľký krúžok so zväčšeninou
   * stojí v okne (kam, 0–1 okna), dá sa odložiť nabok a za okraj zväčšiť.
   * Polomer zdroja je zlomok šírky okna, takže export ho zväčší rovnako.
   */
  let detaily = [];     // { id, okno, zdroj: {u,v}, r, kam: {x,y}, zoom, farba }
  let vybranyDetail = null;
  let nastroj = "ciara"; // "ciara" | "sipka" | "uhol" | "kresba" | "detail"
  /** Uhol: prvé rameno je hotové, druhé začne vo vrchole. { okno, vrchol: {u,v} } */
  let cakaUhol = null;
  let hrubkaKresby = 4;
  let rezimCiar = false;
  let vybrana = null;
  let farbaCiar = "#ff8a1f";
  let dalsieId = 1;
  const svgCiary = document.getElementById("ciary");
  const platnoDetailov = document.createElement("canvas");
  platnoDetailov.className = "detaily";
  platnoDetailov.setAttribute("aria-hidden", "true");
  stvorec.insertBefore(platnoDetailov, svgCiary);
  const desatinne = (n) => n.toFixed(1).replace(".", ",");
  /** Obdĺžniky okien na obrazovke (px od rohu štvorca). */
  const oknaNaObrazovke = () => okna.map((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.clientWidth, h: el.clientHeight }));
  // Bod fotky (u, v ∈ 0–1) ↔ bod štvorca. Zrkadlo a otočenie okolo stredu fotky.
  const bodVOkne = (i, p, R) => {
    const s = stav[i], r = rozlozenie(s.v, s.fw, s.fh, R[i].w, R[i].h);
    const lx = ((s.zrkadlo ? 1 - p.u : p.u) - 0.5) * r.sirka, ly = (p.v - 0.5) * r.vyska;
    const a = (s.v.rot || 0) * RAD, c = Math.cos(a), n = Math.sin(a);
    return { x: R[i].x + r.vlavo + r.sirka / 2 + lx * c - ly * n, y: R[i].y + r.hore + r.vyska / 2 + lx * n + ly * c };
  };
  const bodZOkna = (i, x, y, R) => {
    const s = stav[i], r = rozlozenie(s.v, s.fw, s.fh, R[i].w, R[i].h);
    const dx = x - (R[i].x + r.vlavo + r.sirka / 2), dy = y - (R[i].y + r.hore + r.vyska / 2);
    const a = (s.v.rot || 0) * RAD, c = Math.cos(a), n = Math.sin(a);
    const u = (dx * c + dy * n) / r.sirka + 0.5, v = (-dx * n + dy * c) / r.vyska + 0.5;
    return { u: s.zrkadlo ? 1 - u : u, v };
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
    const vsetky = ciary.filter((c) => stav[c.okno]?.src).map((c) => ({ c, A: bodVOkne(c.okno, c.a, R), B: bodVOkne(c.okno, c.b, R) }));
    // Šípka (12. 10. 2026) ukazuje smer — nemá sklon ani uhol s inými čiarami.
    const body = vsetky.filter((x) => !x.c.sipka);
    for (const { c, A, B } of vsetky) {
      tvary.push({ typ: "ciara", okno: c.okno, A, B, farba: c.farba, vybrana: c.id === vybrana, sipka: !!c.sipka });
      if (sSklonom && !c.sipka) {
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
    odtlacPopisky(tvary.filter((t) => t.typ === "text"), k, vsetky.map(({ A, B }) => ({ A, B })));
    return tvary;
  }

  /**
   * POPISKY SA ODTLÁČAJÚ (Jerry, 15. 10. 2026: „čísla uhlov sa prekrývajú —
   * môžeme to nastaviť tak, že sa budú navzájom odpudzovať?"). Dva štítky,
   * ktoré sa prekrývajú, sa rozídu po kratšej osi prekryvu — každý o polovicu.
   * Opakuje sa, kým sa niečo hýbe (najviac 60 kôl), takže sa rozídu aj tri
   * a viac pri sebe. Rozmer je ten istý odhad, akým sa kreslí pozadie štítku;
   * export (k = pomer) dopadne rovnako ako obrazovka.
   */
  function odtlacPopisky(texty, k, usecky = []) {
    // Šírka o trochu väčšia než odhad pozadia — na plátne meria písmo širšie.
    const rozmer = (t) => ({ w: (t.text.length * t.velkost * 0.65 + 14) * k, h: (t.velkost + 9) * k });
    const medzera = 6 * k;
    /**
     * ŠTÍTOK NESMIE LEŽAŤ NA ČIARE (Jerry, 15. 10. 2026: „stupne nejdú cez
     * seba, ale idú cez čiary, a tým pádom nie je vidieť stupne"). Ktorá
     * čiara prechádza obdĺžnikom štítku (Liang–Barsky orezanie úsečky),
     * od tej sa štítok posunie kolmo preč — po malých krokoch, kým je voľný.
     */
    const cezStitok = (A, B, t, r, pad) => {
      const x0 = t.x - r.w / 2 - pad, x1 = t.x + r.w / 2 + pad, y0 = t.y - r.h / 2 - pad, y1 = t.y + r.h / 2 + pad;
      const dx = B.x - A.x, dy = B.y - A.y;
      let u0 = 0, u1 = 1;
      for (const [p, q] of [[-dx, A.x - x0], [dx, x1 - A.x], [-dy, A.y - y0], [dy, y1 - A.y]]) {
        if (p === 0) { if (q < 0) return false; continue; }
        const u = q / p;
        if (p < 0) { if (u > u1) return false; if (u > u0) u0 = u; } else { if (u < u0) return false; if (u < u1) u1 = u; }
      }
      return true;
    };
    for (let kolo = 0; kolo < 120; kolo++) {
      let pohyb = false;
      for (let i = 0; i < texty.length; i++) for (let j = i + 1; j < texty.length; j++) {
        const a = texty[i], b = texty[j], ra = rozmer(a), rb = rozmer(b);
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (ra.w + rb.w) / 2 + medzera - Math.abs(dx), oy = (ra.h + rb.h) / 2 + medzera - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        pohyb = true;
        if (oy <= ox) {
          const sm = dy > 0 ? 1 : dy < 0 ? -1 : (i % 2 ? -1 : 1);
          a.y -= sm * oy / 2; b.y += sm * oy / 2;
        } else {
          const sm = dx > 0 ? 1 : dx < 0 ? -1 : 1;
          a.x -= sm * ox / 2; b.x += sm * ox / 2;
        }
      }
      for (const t of texty) {
        const r = rozmer(t);
        for (const { A, B } of usecky) {
          if (!cezStitok(A, B, t, r, 4 * k)) continue;
          // Kolmo od čiary, na stranu, kde štítok už je (stred štítku vs. čiara).
          const ddx = B.x - A.x, ddy = B.y - A.y, d = Math.hypot(ddx, ddy) || 1;
          let nx = -ddy / d, ny = ddx / d;
          if ((t.x - A.x) * nx + (t.y - A.y) * ny < 0) { nx = -nx; ny = -ny; }
          t.x += nx * 3 * k; t.y += ny * 3 * k;
          pohyb = true;
        }
      }
      if (!pohyb) break;
    }
  }


  /** Hrot šípky v bode B (smer A → B): tri body trojuholníka, veľkosť v px × k. */
  function hrotSipky(A, B, k) {
    const d = Math.hypot(B.x - A.x, B.y - A.y) || 1, ux = (B.x - A.x) / d, uy = (B.y - A.y) / d;
    const dl = 16 * k, sir = 8 * k;
    return [{ x: B.x, y: B.y }, { x: B.x - ux * dl - uy * sir, y: B.y - uy * dl + ux * sir }, { x: B.x - ux * dl + uy * sir, y: B.y - uy * dl - ux * sir }];
  }
  /** Hladká cesta cez body ťahu (krivky cez stredy úsekov) — pre SVG aj plátno (Path2D). */
  function cestaKresby(P) {
    if (P.length < 3) return `M ${P[0].x} ${P[0].y} L ${P[P.length - 1].x} ${P[P.length - 1].y}`;
    let d = `M ${P[0].x} ${P[0].y}`;
    for (let i = 1; i < P.length - 1; i++) {
      const mx = (P[i].x + P[i + 1].x) / 2, my = (P[i].y + P[i + 1].y) / 2;
      d += ` Q ${P[i].x} ${P[i].y} ${mx} ${my}`;
    }
    const z = P[P.length - 1];
    return `${d} L ${z.x} ${z.y}`;
  }

  function kresliCiary() {
    const R = oknaNaObrazovke();
    const sSklonom = document.getElementById("sklon").checked;
    const tvary = tvaryCiar(R, 1, sSklonom);
    const klipy = rozdelenie === "cez" ? "" : R.map((r, i) => `<clipPath id="okno${i}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`).join("");
    const klip = (i) => (rozdelenie === "cez" ? "" : `clip-path="url(#okno${i})"`);
    const html = [`<defs>${klipy}</defs>`];
    for (const k of kresby) {
      if (!stav[k.okno]?.src || k.body.length < 2) continue;
      const d = cestaKresby(k.body.map((b) => bodVOkne(k.okno, b, R)));
      html.push(`<g ${klip(k.okno)}><path d="${d}" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="${k.hrubka + 2}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${k.farba}" stroke-width="${k.hrubka}" stroke-linecap="round" stroke-linejoin="round"/></g>`);
    }
    for (const t of tvary) {
      if (t.typ === "ciara") {
        html.push(`<g ${klip(t.okno)}>
          <line x1="${t.A.x}" y1="${t.A.y}" x2="${t.B.x}" y2="${t.B.y}" stroke="rgba(0,0,0,.45)" stroke-width="${t.vybrana ? 6 : 4}" stroke-linecap="round"/>
          <line x1="${t.A.x}" y1="${t.A.y}" x2="${t.B.x}" y2="${t.B.y}" stroke="${t.farba}" stroke-width="${t.vybrana ? 3.5 : 2}" stroke-linecap="round" ${t.vybrana ? 'stroke-dasharray="8 5"' : ""}/>
          ${t.sipka ? `<polygon points="${hrotSipky(t.A, t.B, 1).map((b) => `${b.x},${b.y}`).join(" ")}" fill="${t.farba}" stroke="rgba(0,0,0,.45)" stroke-width="1"/>` : ""}
          ${(t.sipka ? [t.A] : [t.A, t.B]).map((b) => `<circle cx="${b.x}" cy="${b.y}" r="${rezimCiar ? 6 : 3.5}" fill="${rezimCiar ? "rgba(0,0,0,.35)" : t.farba}" stroke="${t.farba}" stroke-width="2"/>`).join("")}
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
    // Uhol čaká na druhé rameno — vrchol svieti, aby bolo jasné, odkiaľ pôjde.
    if (cakaUhol && stav[cakaUhol.okno]?.src) {
      const V = bodVOkne(cakaUhol.okno, cakaUhol.vrchol, R);
      html.push(`<circle cx="${V.x}" cy="${V.y}" r="11" fill="none" stroke="${farbaCiar}" stroke-width="2.5" class="vrchol-caka"/>`);
    }
    const un = document.getElementById("uholNapoveda");
    if (un) un.hidden = !cakaUhol;
    svgCiary.innerHTML = html.join("");
    kresliDetaily();
    document.getElementById("zmazVybranu").disabled = vybrana == null && vybranyDetail == null;
    document.getElementById("zmazVsetky").disabled = !ciary.length && !kresby.length && !detaily.length;
    window.poZmene?.();
    zmena();
  }

  /** Kreslenie na plátno pri exporte — tie isté tvary. */
  function ciaryNaPlatno(x, R, k, N) {
    for (const kr of kresby) {
      if (!stav[kr.okno]?.src || kr.body.length < 2) continue;
      const p = new Path2D(cestaKresby(kr.body.map((b) => bodVOkne(kr.okno, b, R))));
      x.save();
      if (rozdelenie !== "cez") { x.beginPath(); x.rect(R[kr.okno].x, R[kr.okno].y, R[kr.okno].w, R[kr.okno].h); x.clip(); }
      x.lineCap = "round"; x.lineJoin = "round";
      x.strokeStyle = "rgba(0,0,0,.4)"; x.lineWidth = (kr.hrubka + 2) * k; x.stroke(p);
      x.strokeStyle = kr.farba; x.lineWidth = kr.hrubka * k; x.stroke(p);
      x.restore();
    }
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
        if (t.sipka) {
          const h = hrotSipky(t.A, t.B, k);
          x.beginPath(); x.moveTo(h[0].x, h[0].y); x.lineTo(h[1].x, h[1].y); x.lineTo(h[2].x, h[2].y); x.closePath(); x.fill();
          x.beginPath(); x.arc(t.A.x, t.A.y, 3.5 * k, 0, Math.PI * 2); x.fill();
        } else {
          for (const b of [t.A, t.B]) { x.beginPath(); x.arc(b.x, b.y, 3.5 * k, 0, Math.PI * 2); x.fill(); }
        }
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

  /** Geometria krúžku v px štvorca (obrazovka aj export — podľa R). */
  const geomDetailu = (d, R) => {
    const o = R[d.okno], P = bodVOkne(d.okno, d.zdroj, R), rs = d.r * o.w;
    return { P, rs, C: { x: o.x + d.kam.x * o.w, y: o.y + d.kam.y * o.h }, rc: rs * d.zoom };
  };
  function fotkaOknaNaPlatno(x, i, R, orezat) {
    const t = stav[i], img = okna[i].querySelector("img");
    if (!t.src || !img || !img.complete) return;
    const r = rozlozenie(t.v, t.fw, t.fh, R[i].w, R[i].h);
    x.save();
    if (orezat) { x.beginPath(); x.rect(R[i].x, R[i].y, R[i].w, R[i].h); x.clip(); }
    if (rozdelenie === "cez" && i === 1) x.globalAlpha = priehladnost;
    fotkaNaPlatno(x, img, t, R[i].x, R[i].y, r);
    x.restore();
  }
  /** Úchyt na zväčšenie: bodka na okraji krúžku vpravo dole (na obrazovke, nie v exporte). */
  const UCHYT = Math.PI / 4;
  const bodUchytu = (S, r) => ({ x: S.x + r * Math.cos(UCHYT), y: S.y + r * Math.sin(UCHYT) });
  /** Krúžky so zväčšeninou — tie isté pre obrazovku (k = 1, s úchytmi) aj export (k = pomer). */
  function detailyNaPlatno(x, R, k, uchopy = false) {
    const kruh = (C, r) => { x.beginPath(); x.arc(C.x, C.y, r, 0, Math.PI * 2); };
    for (const d of detaily) {
      if (!stav[d.okno]?.src) continue;
      const { P, rs, C, rc } = geomDetailu(d, R);
      // Bez orezania oknom: zväčšenina sa smie odložiť aj cez deliacu čiaru
      // alebo k okraju (Jerry, 15. 10. 2026: „prečo sa nedá s krúžkom pohybovať").
      x.save();
      const dx = C.x - P.x, dy = C.y - P.y, dl = Math.hypot(dx, dy);
      if (dl > rs + rc + 2) {
        const ux = dx / dl, uy = dy / dl;
        x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 4 * k;
        x.beginPath(); x.moveTo(P.x + ux * rs, P.y + uy * rs); x.lineTo(C.x - ux * rc, C.y - uy * rc); x.stroke();
        x.strokeStyle = d.farba; x.lineWidth = 2 * k;
        x.beginPath(); x.moveTo(P.x + ux * rs, P.y + uy * rs); x.lineTo(C.x - ux * rc, C.y - uy * rc); x.stroke();
      }
      x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 4 * k; kruh(P, rs); x.stroke();
      x.strokeStyle = d.farba; x.lineWidth = 2 * k; kruh(P, rs); x.stroke();
      // Zväčšenina: to isté miesto fotky (aj s čiarami), zväčšené okolo stredu krúžku.
      x.save();
      kruh(C, rc); x.clip();
      x.fillStyle = "#fff"; x.fillRect(C.x - rc, C.y - rc, 2 * rc, 2 * rc);
      x.translate(C.x, C.y); x.scale(d.zoom, d.zoom); x.translate(-P.x, -P.y);
      if (rozdelenie === "cez") { fotkaOknaNaPlatno(x, 0, R, false); fotkaOknaNaPlatno(x, 1, R, false); }
      else fotkaOknaNaPlatno(x, d.okno, R, true);
      ciaryNaPlatno(x, R, k / d.zoom);
      x.restore();
      x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 10 * k;
      x.strokeStyle = "#fff"; x.lineWidth = 5 * k; kruh(C, rc); x.stroke();
      x.shadowBlur = 0;
      x.strokeStyle = d.farba; x.lineWidth = (d.id === vybranyDetail ? 3 : 2) * k;
      if (d.id === vybranyDetail) x.setLineDash([8 * k, 5 * k]);
      kruh(C, rc); x.stroke();
      x.setLineDash([]);
      if (uchopy) {
        for (const U of [bodUchytu(C, rc), bodUchytu(P, rs)]) {
          x.fillStyle = "#fff"; x.strokeStyle = d.farba; x.lineWidth = 2;
          x.beginPath(); x.arc(U.x, U.y, 6, 0, Math.PI * 2); x.fill(); x.stroke();
        }
      }
      x.restore();
    }
  }
  function kresliDetaily() {
    const dpr = window.devicePixelRatio || 1, W = stvorec.clientWidth, H = stvorec.clientHeight;
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (platnoDetailov.width !== w || platnoDetailov.height !== h) { platnoDetailov.width = w; platnoDetailov.height = h; }
    const x = platnoDetailov.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    if (!detaily.length) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    detailyNaPlatno(x, oknaNaObrazovke(), 1, true);
  }

  /**
   * LUPA PRI KRESLENÍ (Jerry, 12. 10. 2026: „pri zakresľovaní čiar potrebujem
   * aj zoom automaticky"). Kým drží prst/pero/myš, nad miestom dotyku sa
   * ukáže kruh so zväčšeným výrezom fotky, čiarami a zameriavačom — prst
   * inak zakrýva presne ten bod, ktorý sa kladie. Kreslí sa na plátno z tých
   * istých súradníc ako obrazovka (bodVOkne), takže lupa sedí aj pri zrkadle.
   */
  const LUPA = { strana: 140, zvacsenie: 2.6 };
  const lupa = document.createElement("canvas");
  lupa.className = "lupa";
  lupa.hidden = true;
  stvorec.appendChild(lupa);
  function ukazLupu(P, okno, celaFotka = false) {
    const L = LUPA.strana, Z = LUPA.zvacsenie, dpr = window.devicePixelRatio || 1;
    if (lupa.width !== L * dpr) { lupa.width = L * dpr; lupa.height = L * dpr; lupa.style.width = `${L}px`; lupa.style.height = `${L}px`; }
    const x = lupa.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, L, L);
    x.save();
    x.beginPath(); x.arc(L / 2, L / 2, L / 2 - 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = "#222"; x.fillRect(0, 0, L, L);
    // Bod obrazovky → bod lupy: posun na stred a zväčšenie.
    x.translate(L / 2, L / 2); x.scale(Z, Z); x.translate(-P.x, -P.y);
    const R = oknaNaObrazovke();
    const kresliOkno = (i) => {
      const t = stav[i], img = okna[i].querySelector("img");
      if (!t.src || !img || !img.complete) return;
      const r = rozlozenie(t.v, t.fw, t.fh, R[i].w, R[i].h);
      x.save();
      if (rozdelenie !== "cez" && !celaFotka) { x.beginPath(); x.rect(R[i].x, R[i].y, R[i].w, R[i].h); x.clip(); }
      if (rozdelenie === "cez" && i === 1) x.globalAlpha = priehladnost;
      fotkaNaPlatno(x, img, t, R[i].x, R[i].y, r);
      x.restore();
    };
    if (rozdelenie === "cez") { kresliOkno(0); kresliOkno(1); } else if (okno >= 0) kresliOkno(okno);
    ciaryNaPlatno(x, R, 1 / Z, 0);
    x.restore();
    // Zameriavač a okraj — v pixeloch lupy, nie zväčšené.
    x.strokeStyle = "rgba(255,255,255,.95)"; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(L / 2 - 10, L / 2); x.lineTo(L / 2 - 3, L / 2); x.moveTo(L / 2 + 3, L / 2); x.lineTo(L / 2 + 10, L / 2);
    x.moveTo(L / 2, L / 2 - 10); x.lineTo(L / 2, L / 2 - 3); x.moveTo(L / 2, L / 2 + 3); x.lineTo(L / 2, L / 2 + 10); x.stroke();
    x.strokeStyle = "rgba(0,0,0,.6)"; x.lineWidth = 3; x.beginPath(); x.arc(L / 2, L / 2, L / 2 - 2, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.beginPath(); x.arc(L / 2, L / 2, L / 2 - 2, 0, Math.PI * 2); x.stroke();
    // Poloha: nad prstom (vľavo hore); pri hornom okraji pod neho.
    const W = stvorec.clientWidth;
    let lx = P.x - L / 2, ly = P.y - L - 36;
    if (ly < 4) ly = P.y + 36;
    lx = Math.max(4, Math.min(W - L - 4, lx));
    lupa.style.left = `${lx}px`; lupa.style.top = `${ly}px`;
    lupa.hidden = false;
  }
  const skryLupu = () => { lupa.hidden = true; };

  // Ovládanie kreslenia — myš aj prst.
  /**
   * ÚPRAVA ČIAR, ŠÍPOK A UHLOV (Jerry, 12. 10. 2026: „keď upravujem šípky
   * alebo uhly, moc dobre to nefunguje"). Čo bolo zle a čo platí teraz:
   *   • upraviť sa dalo len pri otvorenej skupine „Čiary" — inak prst chytil
   *     fotku. Teraz sa koniec aj čiara chytí VŽDY; nová čiara len pri kreslení,
   *   • miesto na chytenie bolo 12 bodov — na prst málo. Teraz podľa toho,
   *     čím ťukáš (prst 26, pero 16, myš 12),
   *   • uhol sa kreslil ťahom z konca inej čiary, a ten istý ťah koniec posúva.
   *     Teraz má uhol vlastný nástroj: ťah po prvom ramene, potom druhé
   *     rameno začne samo vo vrchole,
   *   • ťah po ramene uhla ho odtrhol — teraz sa posunie celý spojený útvar.
   */
  (() => {
    let tah = null; // { druh: "nova" | "koniec" | "cela" | "kresba", … }
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
    const polomer = (e) => (e.pointerType === "touch" ? { koniec: 26, ciara: 16 } : e.pointerType === "pen" ? { koniec: 16, ciara: 10 } : { koniec: 12, ciara: 8 });
    /** Čiary spojené s c cez spoločné konce (uhol, lomená čiara) — posúvajú sa spolu. */
    const spojeneCiary = (c) => {
      const von = new Set([c]);
      let pribudlo = true;
      while (pribudlo) {
        pribudlo = false;
        for (const d of ciary) {
          if (von.has(d) || d.okno !== c.okno) continue;
          if ([...von].some((x) => ["a", "b"].some((k1) => ["a", "b"].some((k2) => rovnakyBod(x[k1], d[k2]))))) { von.add(d); pribudlo = true; }
        }
      }
      return [...von];
    };
    /** Čo je pod prstom: koniec čiary (najbližší) alebo čiara sama. */
    const coPodPrstom = (P, R, e) => {
      const r = polomer(e);
      let koniec = null;
      for (const c of ciary) {
        if (!stav[c.okno]?.src) continue;
        for (const kl of ["a", "b"]) {
          const B = bodVOkne(c.okno, c[kl], R), d = Math.hypot(B.x - P.x, B.y - P.y);
          if (d < r.koniec && (!koniec || d < koniec.d)) koniec = { c, kl, d };
        }
      }
      if (koniec) return { koniec };
      let ciara = null;
      for (const c of ciary) {
        if (!stav[c.okno]?.src) continue;
        const d = vzdialenostOdUsecky(P, bodVOkne(c.okno, c.a, R), bodVOkne(c.okno, c.b, R));
        if (d < r.ciara && (!ciara || d < ciara.d)) ciara = { c, d };
      }
      return ciara ? { ciara } : {};
    };
    const zacniTah = (t, e, P) => {
      tah = t;
      try { stvorec.setPointerCapture(e.pointerId); } catch { /* bez zachytenia ide ťah aj tak */ }
      kresliCiary();
      if (P) ukazLupu(P, t.okno);
    };

    /** Ktorá časť ktorého krúžku je pod bodom (zväčšenina má prednosť). */
    const detailPodBodom = (P, R, tol) => {
      for (const d of [...detaily].reverse()) {
        if (!stav[d.okno]?.src) continue;
        const g = geomDetailu(d, R), dC = Math.hypot(P.x - g.C.x, P.y - g.C.y), dP = Math.hypot(P.x - g.P.x, P.y - g.P.y);
        const blizko = (U) => Math.hypot(P.x - U.x, P.y - U.y) < Math.max(10, tol);
        // Zväčšuje sa LEN za bodku na okraji; celý krúžok sa chytá na posun
        // (keď bol na zväčšenie celý okraj, ťah ho často zväčšil namiesto posunu).
        const cast = blizko(bodUchytu(g.C, g.rc)) ? "okrajKruhu" : dC <= g.rc + 2 ? "kruh"
          : blizko(bodUchytu(g.P, g.rs)) ? "okrajZdroja" : dP <= g.rs + 2 ? "zdroj" : null;
        if (cast) return { d, cast };
      }
      return null;
    };
    // Kurzor povie, že krúžok sa dá chytiť — bez neho nebolo vidno, kde.
    stvorec.addEventListener("pointermove", (e) => {
      if (tah || e.buttons || e.pointerType === "touch") return;
      const hit = detaily.length ? detailPodBodom(miesto(e), oknaNaObrazovke(), 8) : null;
      const k = !hit ? "" : hit.cast.startsWith("okraj") ? "nwse-resize" : "move";
      if (stvorec.style.cursor !== k) { stvorec.style.cursor = k; svgCiary.style.cursor = k; }
    });

    // Zachytávanie na štvorci: čiara má prednosť pred fotkou pod ňou.
    stvorec.addEventListener("pointerdown", (e) => {
      if (e.target.closest?.(".roh, .otoc")) return;
      const R = oknaNaObrazovke(), P = miesto(e);
      // Krúžok so zväčšeninou: chytiť ho (posunúť), za okraj zväčšiť; to isté miesto na fotke.
      const hit = detailPodBodom(P, R, polomer(e).koniec * 0.7);
      if (hit) {
        const { d, cast } = hit;
        e.preventDefault(); e.stopPropagation();
        vybranyDetail = d.id; vybrana = null; cakaUhol = null;
        zacniTah({ druh: "detail", cast, d, okno: d.okno, P0: P, povodne: { zdroj: { ...d.zdroj }, kam: { ...d.kam } } }, e);
        return;
      }
      vybranyDetail = null;
      const pod = coPodPrstom(P, R, e);
      // Mimo kreslenia: len úprava toho, čo už je; inak nechať fotku.
      if (!rezimCiar && !pod.koniec && !pod.ciara) { kresliCiary(); return; }
      if (rezimCiar && nastroj === "detail" && !pod.koniec) {
        const okno = oknoPodBodom(P, R);
        if (okno < 0 || !stav[okno].src) return;
        e.preventDefault(); e.stopPropagation();
        const o = R[okno];
        const d = { id: dalsieId++, okno, zdroj: bodZOkna(okno, P.x, P.y, R), r: 4 / o.w, kam: { x: (P.x - o.x) / o.w, y: (P.y - o.y) / o.h }, zoom: 2.5, farba: farbaCiar };
        detaily.push(d);
        vybranyDetail = d.id; vybrana = null;
        zacniTah({ druh: "detail", cast: "novy", d, okno, P0: P }, e);
        return;
      }
      // Uhol čakal na druhé rameno, ale ťuklo sa do INEJ fotky — to je nová
      // čiara tam, nie pokračovanie odtiaľto (Jerry, 15. 10. 2026: „klik na
      // začiatok, označím koniec a je to koniec, nie že mi to pokračuje do
      // ďalšej fotky").
      if (cakaUhol && oknoPodBodom(P, R) !== cakaUhol.okno) cakaUhol = null;
      if (rezimCiar && nastroj === "kresba" && !pod.koniec) {
        const okno = oknoPodBodom(P, R);
        if (okno < 0 || !stav[okno].src) return;
        e.preventDefault(); e.stopPropagation();
        const k = { id: dalsieId++, okno, body: [bodZOkna(okno, P.x, P.y, R)], farba: farbaCiar, hrubka: hrubkaKresby };
        kresby.push(k);
        vybrana = null;
        zacniTah({ druh: "kresba", kresba: k, okno, posledny: P }, e, P);
        return;
      }
      e.preventDefault(); e.stopPropagation();
      // Uhol: druhé rameno začína vo vrchole, kamkoľvek sa ťukne.
      if (rezimCiar && nastroj === "uhol" && cakaUhol) {
        const c = { id: dalsieId++, okno: cakaUhol.okno, a: { ...cakaUhol.vrchol }, b: { ...cakaUhol.vrchol }, farba: farbaCiar };
        ciary.push(c);
        vybrana = c.id;
        cakaUhol = null;
        zacniTah({ druh: "nova", kluce: [[c, "b"]], okno: c.okno, ciara: c, druheRameno: true }, e, P);
        return;
      }
      if (pod.koniec) {
        const { c: cc, kl } = pod.koniec, bod = cc[kl];
        const spojene = ciary.flatMap((c) => ["a", "b"].filter((k) => c.okno === cc.okno && rovnakyBod(c[k], bod)).map((k) => [c, k]));
        vybrana = cc.id;
        zacniTah({ druh: "koniec", kluce: spojene, okno: cc.okno }, e, bodVOkne(cc.okno, bod, R));
        return;
      }
      if (pod.ciara) {
        const skupina = spojeneCiary(pod.ciara.c);
        vybrana = pod.ciara.c.id;
        zacniTah({
          druh: "cela", okno: pod.ciara.c.okno, P,
          povodne: skupina.map((c) => ({ c, A: bodVOkne(c.okno, c.a, R), B: bodVOkne(c.okno, c.b, R) })),
        }, e);
        return;
      }
      // Nová čiara / šípka / prvé rameno uhla.
      const okno = oknoPodBodom(P, R);
      if (okno < 0 || !stav[okno].src) return;
      const zaciatok = bodZOkna(okno, P.x, P.y, R);
      const c = { id: dalsieId++, okno, a: zaciatok, b: { ...zaciatok }, farba: farbaCiar, ...(nastroj === "sipka" ? { sipka: true } : {}) };
      ciary.push(c);
      vybrana = c.id;
      zacniTah({ druh: "nova", kluce: [[c, "b"]], okno, ciara: c, prveRameno: nastroj === "uhol" }, e, P);
    }, true);

    addEventListener("pointermove", (e) => {
      if (!tah) return;
      const R = oknaNaObrazovke(), r = R[tah.okno];
      let P = miesto(e);
      if (tah.druh === "detail") {
        const d = tah.d, o = R[d.okno], g = geomDetailu(d, R);
        if (tah.cast === "novy" || tah.cast === "okrajZdroja") d.r = Math.max(4, Math.hypot(P.x - g.P.x, P.y - g.P.y)) / o.w;
        else if (tah.cast === "zdroj") {
          const A = bodVOkne(d.okno, tah.povodne.zdroj, R);
          d.zdroj = bodZOkna(d.okno, A.x + P.x - tah.P0.x, A.y + P.y - tah.P0.y, R);
        } else if (tah.cast === "kruh") {
          // Kamkoľvek po štvorci (aj do druhej polovice), stred zostane na ňom.
          const W = stvorec.clientWidth, H = stvorec.clientHeight;
          const cx = Math.max(0, Math.min(W, o.x + tah.povodne.kam.x * o.w + P.x - tah.P0.x));
          const cy = Math.max(0, Math.min(H, o.y + tah.povodne.kam.y * o.h + P.y - tah.P0.y));
          d.kam = { x: (cx - o.x) / o.w, y: (cy - o.y) / o.h };
        } else if (tah.cast === "okrajKruhu") d.zoom = Math.max(1.2, Math.min(8, Math.hypot(P.x - g.C.x, P.y - g.C.y) / (g.rs || 1)));
        kresliCiary();
        return;
      }
      if (tah.druh === "cela") {
        const dx = P.x - tah.P.x, dy = P.y - tah.P.y;
        for (const x of tah.povodne) {
          x.c.a = bodZOkna(tah.okno, x.A.x + dx, x.A.y + dy, R);
          x.c.b = bodZOkna(tah.okno, x.B.x + dx, x.B.y + dy, R);
        }
        kresliCiary();
        return;
      }
      if (tah.druh === "kresba") {
        if (Math.hypot(P.x - tah.posledny.x, P.y - tah.posledny.y) < 2.5) return; // hustejšie body nič nepridajú
        tah.posledny = P;
        tah.kresba.body.push(bodZOkna(tah.okno, P.x, P.y, R));
        kresliCiary();
        ukazLupu(P, tah.okno);
        return;
      }
      if (rozdelenie !== "cez") P = { x: Math.max(r.x, Math.min(r.x + r.w, P.x)), y: Math.max(r.y, Math.min(r.y + r.h, P.y)) };
      let ciel = bodZOkna(tah.okno, P.x, P.y, R);
      // Prichytenie ku koncu inej čiary — len pri novej čiare (tak vzniká
      // spoj). Pri úprave konca by prichytenie ťahalo bod tam, kam nechceš.
      if (tah.druh === "nova") {
        for (const c of ciary) {
          if (c.okno !== tah.okno || tah.kluce.some(([cc]) => cc === c)) continue;
          for (const kl of ["a", "b"]) {
            const B = bodVOkne(c.okno, c[kl], R);
            if (Math.hypot(B.x - P.x, B.y - P.y) < 10) ciel = { ...c[kl] };
          }
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
      ukazLupu(bodVOkne(tah.okno, ciel, R), tah.okno);
    });
    const pusti = () => {
      skryLupu();
      if (!tah) return;
      if (tah.druh === "detail") {
        if (tah.cast === "novy") {
          const R = oknaNaObrazovke(), d = tah.d, o = R[d.okno];
          if (d.r * o.w < 8) d.r = 0.06; // ťuknutie = krúžok predvolenej veľkosti
          const g = geomDetailu(d, R);
          // Zväčšenina ide vedľa — na stranu bližšie k stredu okna, celá v okne.
          const smer = g.P.x < o.x + o.w / 2 ? 1 : -1;
          let cx = g.P.x + smer * (g.rs + g.rc + 16), cy = g.P.y;
          const W = stvorec.clientWidth, H = stvorec.clientHeight;
          cx = Math.max(g.rc, Math.min(W - g.rc, cx));
          cy = Math.max(g.rc, Math.min(H - g.rc, cy));
          d.kam = { x: (cx - o.x) / o.w, y: (cy - o.y) / o.h };
        }
        tah = null;
        kresliCiary();
        return;
      }
      if (tah.druh === "kresba") {
        if (tah.kresba.body.length < 2) kresby = kresby.filter((k) => k !== tah.kresba); // ťuknutie nie je kresba
        tah = null;
        kresliCiary();
        return;
      }
      if (tah.druh === "nova") {
        const R = oknaNaObrazovke(), A = bodVOkne(tah.okno, tah.ciara.a, R), B = bodVOkne(tah.okno, tah.ciara.b, R);
        const kratka = Math.hypot(B.x - A.x, B.y - A.y) < 5;
        if (kratka) ciary = ciary.filter((c) => c !== tah.ciara);
        // Prvé rameno uhla hotové → ďalší ťah začne vo vrchole (jeho konci).
        if (tah.prveRameno && !kratka) cakaUhol = { okno: tah.okno, vrchol: { ...tah.ciara.b } };
        vybrana = null;
      }
      tah = null;
      kresliCiary();
    };
    addEventListener("pointerup", pusti);
    addEventListener("pointercancel", pusti);
  })();
  const nastavRezim = (zap) => {
    rezimCiar = zap;
    if (!zap) cakaUhol = null;
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
  const zmazVybranu = () => {
    ciary = ciary.filter((c) => c.id !== vybrana);
    detaily = detaily.filter((d) => d.id !== vybranyDetail);
    vybrana = null; vybranyDetail = null; cakaUhol = null; kresliCiary();
  };

  const denCz = (d) => { if (!d) return ""; const [r, m, dd] = d.split("-"); return `${Number(dd)}. ${Number(m)}. ${r}`; };
  // Po česky: hotová fotka ide klientovi alebo na sociálne siete (Jerry vybral
  // návrh D s českými štítkami, 9. 10. 2026).
  const popisky = () => {
    const [a, b] = [stav[0].den, stav[1].den];
    return a && b && a > b ? ["potom", "předtím"] : ["předtím", "potom"];
  };
  const rozmerOkna = (el) => ({ ow: el.clientWidth, oh: el.clientHeight });

  function kresli() {
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
        const src = s.src;
        img.onload = () => {
          rozmery.set(src, { fw: img.naturalWidth, fh: img.naturalHeight });
          for (const t of stav) if (t.src === src) { t.fw = img.naturalWidth; t.fh = img.naturalHeight; }
          kresli();
        };
        img.src = s.src;
      }
      const { ow, oh } = rozmerOkna(el);
      // Kým nie sú známe rozmery fotky, výrez sa neorezáva — inak by sa
      // posun z kroku späť alebo z návrhu stratil ešte pred načítaním.
      if (rozmery.has(s.src)) s.v = obmedz(s.v, s.fw, s.fh, ow, oh);
      const r = rozlozenie(s.v, s.fw, s.fh, ow, oh);
      img.style.width = `${r.sirka}px`;
      img.style.height = `${r.vyska}px`;
      img.style.transform = transformaciaFotky(r, s);
      kresliStitok(el.querySelector(".popiska"), i, ow, oh);
      img.style.opacity = rozdelenie === "cez" && i === 1 ? String(priehladnost) : "1";
    });
    kresliUchopy();
    // Vodoznak ako v exporte: 70/2000 strany, 60/2000 od pravého dolného rohu.
    const vz = document.getElementById("vodoznak");
    if (vz) {
      const k = stvorec.clientWidth / 2000;
      Object.assign(vz.style, { width: `${70 * k}px`, right: `${60 * k}px`, bottom: `${60 * k}px` });
    }
    kresliMriezku();
    kresliCiary();
    // panel
    const s = stav[aktivne];
    document.getElementById("zoom").value = s.v.zoom;
    const zh = document.getElementById("zoomH");
    if (zh) zh.textContent = `${(s.v.zoom * 100).toFixed(1).replace(".", ",")} %`;
    const oh2 = document.getElementById("otocH");
    if (oh2) oh2.textContent = `${(s.v.rot || 0).toFixed(1).replace(".", ",")}°`;
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
    zmena();
  }

  // ── ŤAHANIE A ŠTIPNUTIE (pointer events: myš, prst, pero) ──
  okna.forEach((el, i) => {
    const prsty = new Map();
    let posledne = null; // { x, y, d } – stred a vzdialenosť prstov
    let stipol = false; // po dvoch prstoch sa fotka nehýbe, kým sa nezdvihnú všetky
    const stredPrstov = () => {
      const p = [...prsty.values()];
      const x = p.reduce((a, q) => a + q.x, 0) / p.length, y = p.reduce((a, q) => a + q.y, 0) / p.length;
      const d = p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
      return { x, y, d };
    };
    // Prázdna polovica otvára výber až na KLIKNUTIE (ťuknutie), nie na
    // pointerdown: Safari na iPhone/iPade pustí okno na výber súboru len
    // z kliknutia, z pointerdown ho potichu zahodí (Jerry, 9. 10. 2026:
    // „keď kliknem na vložiť fotku, nič sa nedeje").
    el.addEventListener("click", () => { if (!stav[i].src) { aktivne = i; kresli(); otvorVyber(); } });
    el.addEventListener("pointerdown", (e) => {
      aktivne = i;
      if (!stav[i].src) { kresli(); return; }
      try { el.setPointerCapture(e.pointerId); } catch { /* bez zachytenia ide ťah aj tak */ }
      prsty.set(e.pointerId, { x: e.clientX, y: e.clientY });
      posledne = stredPrstov();
      if (prsty.size === 2) { stipol = true; stipZaciatok(...prsty.values()); }
      el.classList.add("tahanie");
      kresli();
    });
    el.addEventListener("pointermove", (e) => {
      if (!prsty.has(e.pointerId)) return;
      prsty.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (prsty.size > 1) { stipPohyb(...prsty.values()); return; } // dva prsty = plocha
      if (stipol) return;
      const teraz = stredPrstov();
      const s = stav[i];
      const { ow, oh } = rozmerOkna(el);
      const k = jemne(e) ? 0.1 : 1;
      const v = { ...s.v, x: s.v.x + (teraz.x - posledne.x) * k / ow, y: s.v.y + (teraz.y - posledne.y) * k / oh };
      s.v = obmedz(v, s.fw, s.fh, ow, oh);
      posledne = teraz;
      kresli();
    });
    const koniec = (e) => {
      prsty.delete(e.pointerId);
      posledne = prsty.size ? stredPrstov() : null;
      if (!prsty.size) { el.classList.remove("tahanie"); stipol = false; }
    };
    el.addEventListener("pointerup", koniec);
    el.addEventListener("pointercancel", koniec);
    // Dva prsty (touchpad aj dotyk) aj štipnutie patria PLOCHE — rieši ich platno.
    // Veľkosť fotky sa mení len za rohy (Jerry, 13. 10. 2026), preto ani dvojklik.
  });

  // ── PANEL ──
  const subor = document.getElementById("subor");
  const otvorVyber = () => subor.click();
  /** Vloží obrázok (adresu) do polovice i. Fotka zo súboru aj snímka z videa. */
  function vlozObrazok(i, src, den, vlastny) {
    const s = stav[i];
    // Starý obrázok sa NEuvoľňuje (revokeObjectURL) — krok späť ho môže vrátiť.
    const r = rozmery.get(src);
    Object.assign(s, { src, vlastny: !!vlastny, v: { zoom: 1, x: 0, y: 0 }, zrkadlo: false, fw: r?.fw || 1, fh: r?.fh || 1 });
    if (den) s.den = den;
    ciary = ciary.filter((c) => c.okno !== i); // čiary patrili starej fotke
    kresby = kresby.filter((k) => k.okno !== i);
    detaily = detaily.filter((d) => d.okno !== i);
    if (cakaUhol?.okno === i) cakaUhol = null;
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
  // „Vložiť fotku…" je <label for="subor"> — výber otvorí prehliadač sám,
  // spoľahlivo aj na iPhone a iPade.
  document.querySelectorAll("#vyberOkna button").forEach((b) => b.onclick = () => { aktivne = Number(b.dataset.i); kresli(); });
  document.getElementById("zoom").oninput = (e) => {
    const s = stav[aktivne]; const { ow, oh } = rozmerOkna(okna[aktivne]);
    s.v = obmedz(zoomOkolo(s.v, Number(e.target.value), 0, 0), s.fw, s.fh, ow, oh); kresli();
  };
  /**
   * JEMNÉ ZVÄČŠENIE (Jerry, 12. 10. 2026: „nie len posuvník, ale vedľa šípku,
   * ktorá by približovala o 0,1 % — keď to chcem zarovnať, s posuvníkom je to
   * ťažké"). Klik = 0,1 %, podržanie opakuje (po pol sekunde a čím dlhšie,
   * tým rýchlejšie — inak by cesta zo 100 na 110 % trvala sto klikov).
   */
  const zmenZoom = (smer, krokov = 1) => {
    const s = stav[aktivne];
    if (!s.src) return;
    const { ow, oh } = rozmerOkna(okna[aktivne]);
    s.v = obmedz(zoomOkolo(s.v, s.v.zoom * Math.pow(1.001, smer * krokov), 0, 0), s.fw, s.fh, ow, oh);
    kresli();
  };
  // Otočenie po 0,1° (podržanie zrýchľuje) a vyrovnanie na 0°.
  const otocO = (krok) => { if (stav[aktivne].src) nastavOtocenie(aktivne, (stav[aktivne].v.rot || 0) + krok); };
  for (const [id, smer] of [["otocMenej", -1], ["otocViac", 1]]) {
    const b = document.getElementById(id);
    if (!b) continue;
    let casovac = 0, opakovanie = 0, kolo = 0;
    const stop = () => { clearTimeout(casovac); clearInterval(opakovanie); };
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      otocO(smer * 0.1);
      kolo = 0;
      casovac = setTimeout(() => { opakovanie = setInterval(() => { kolo++; otocO(smer * (kolo > 40 ? 1 : kolo > 15 ? 0.3 : 0.1)); }, 45); }, 450);
    });
    for (const u of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(u, stop);
  }
  document.getElementById("otocNula")?.addEventListener("click", () => { if (stav[aktivne].src) nastavOtocenie(aktivne, 0); });
  // Fotka z mobilu nabok: celé štvrťotočky.
  document.getElementById("otoc90l")?.addEventListener("click", () => otocO(-90));
  document.getElementById("otoc90p")?.addEventListener("click", () => otocO(90));
  for (const [id, smer] of [["zoomMenej", -1], ["zoomViac", 1]]) {
    const b = document.getElementById(id);
    if (!b) continue;
    let casovac = 0, opakovanie = 0, kolo = 0;
    const stop = () => { clearTimeout(casovac); clearInterval(opakovanie); casovac = 0; opakovanie = 0; };
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      zmenZoom(smer);
      kolo = 0;
      casovac = setTimeout(() => { opakovanie = setInterval(() => { kolo++; zmenZoom(smer, kolo > 40 ? 5 : kolo > 15 ? 2 : 1); }, 45); }, 450);
    });
    for (const u of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(u, stop);
  }
  document.getElementById("den").onchange = (e) => { stav[aktivne].den = e.target.value; kresli(); };
  document.getElementById("zrkadlo").onclick = () => { stav[aktivne].zrkadlo = !stav[aktivne].zrkadlo; kresli(); };
  document.getElementById("reset").onclick = () => { stav[aktivne].v = { zoom: 1, x: 0, y: 0 }; kresli(); };
  document.getElementById("vymenit").onclick = () => {
    cakaUhol = null;
    stav.reverse(); ciary.forEach((c) => { c.okno = 1 - c.okno; }); kresby.forEach((k) => { k.okno = 1 - k.okno; }); okna.forEach((el) => el.innerHTML = ""); aktivne = 1 - aktivne; kresli(); };
  // Medzera mení okná — čiary aj štítky sa musia prekresliť s nimi.
  document.getElementById("medzera").oninput = (e) => { stvorec.style.setProperty("--medzera", `${e.target.value}px`); kresli(); };
  /** Rozloženie do tried a ovládačov — pri kliknutí aj pri kroku späť. */
  function pouziRozdelenie() {
    document.querySelectorAll("#rozdelenie button").forEach((x) => x.classList.toggle("on", x.dataset.v === rozdelenie));
    stvorec.classList.toggle("pod", rozdelenie === "pod");
    stvorec.classList.toggle("cez", rozdelenie === "cez");
    document.getElementById("riadokMedzera").hidden = rozdelenie === "cez";
    document.getElementById("riadokPriehladnost").hidden = rozdelenie !== "cez";
    document.getElementById("napovedaCez").hidden = rozdelenie !== "cez";
  }
  document.querySelectorAll("#rozdelenie button").forEach((b) => b.onclick = () => {
    rozdelenie = b.dataset.v;
    pouziRozdelenie();
    requestAnimationFrame(kresli);
  });
  // Štítok: zapnúť, roh, dizajn, veľkosť.
  document.getElementById("stitokZap").onchange = (e) => { stitok.zap = e.target.checked; pouziStitok(); kresli(); };
  for (const [id, kluc] of [["stitokRoh", "roh"], ["stitokDizajn", "dizajn"], ["stitokVelkost", "velkost"]]) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.onclick = () => { stitok[kluc] = b.dataset.v; pouziStitok(); kresli(); });
  }
  function pouziStitok() {
    document.getElementById("stitokZap").checked = stitok.zap;
    for (const [id, kluc] of [["stitokRoh", "roh"], ["stitokDizajn", "dizajn"], ["stitokVelkost", "velkost"]]) {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x.dataset.v === stitok[kluc]));
    }
    document.getElementById("stitokVolby").hidden = !stitok.zap;
  }
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
  // Krok späť vie vrátiť aj „zmazať všetky" — preto sa už nepýta.
  document.getElementById("zmazVsetky").onclick = () => { ciary = []; kresby = []; detaily = []; vybrana = null; vybranyDetail = null; cakaUhol = null; kresliCiary(); };
  document.querySelectorAll("#nastroj button").forEach((b) => b.onclick = () => {
    nastroj = b.dataset.v;
    cakaUhol = null;
    document.querySelectorAll("#nastroj button").forEach((x) => x.classList.toggle("on", x === b));
    document.getElementById("riadokHrubka").hidden = nastroj !== "kresba";
    vybrana = null;
    if (!rezimCiar) nastavRezim(true);
    kresliCiary();
  });
  document.querySelectorAll("#hrubkaKresby button").forEach((b) => b.onclick = () => {
    hrubkaKresby = Number(b.dataset.v);
    document.querySelectorAll("#hrubkaKresby button").forEach((x) => x.classList.toggle("on", x === b));
  });
  document.getElementById("sklon").onchange = kresliCiary;
  document.querySelectorAll("#farbaCiar button").forEach((b) => b.onclick = () => {
    document.querySelectorAll("#farbaCiar button").forEach((x) => x.classList.toggle("on", x === b));
    farbaCiar = b.dataset.v;
    const c = ciary.find((q) => q.id === vybrana);
    if (c) c.farba = farbaCiar; // farba sa dá zmeniť aj vybranej čiare
    const d = detaily.find((q) => q.id === vybranyDetail);
    if (d) d.farba = farbaCiar;
    kresliCiary();
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    if (e.key === "Escape" && cakaUhol) { cakaUhol = null; kresliCiary(); return; }
    if (e.key === "Escape" && rezimCiar) nastavRezim(false);
    if ((e.key === "Delete" || e.key === "Backspace") && (vybrana != null || vybranyDetail != null)) { e.preventDefault(); zmazVybranu(); }
    // Šípky posúvajú vybranú fotku po 1 bode obrazovky (Shift = 10, Alt/Option
    // alebo „jemne" = 0,2) — na presné zarovnanie.
    const posun = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (posun && !e.metaKey && !e.ctrlKey && stav[aktivne].src) {
      e.preventDefault();
      const s = stav[aktivne], { ow, oh } = rozmerOkna(okna[aktivne]), n = e.shiftKey ? 10 : jemne(e) ? 0.2 : 1;
      s.v = obmedz({ ...s.v, x: s.v.x + (posun[0] * n) / ow, y: s.v.y + (posun[1] * n) / oh }, s.fw, s.fh, ow, oh);
      kresli();
    }
    // Čiarka a bodka otáčajú vybranú fotku po 0,1° (Shift = 1°).
    const otoc = { Comma: -1, Period: 1 }[e.code];
    if (otoc && !e.metaKey && !e.ctrlKey && stav[aktivne].src) {
      e.preventDefault();
      nastavOtocenie(aktivne, (stav[aktivne].v.rot || 0) + otoc * (e.shiftKey ? 1 : 0.1));
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) krokDopredu(); else krokSpat(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); krokDopredu(); }
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
  // Keď dorazí Agrandir, štítky na obrazovke sa premerajú jeho písmom.
  znackaHotova.then(() => kresli());

  // ── ŠTÍTOK: rozmery spoločné pre obrazovku aj export ──
  const VELKOST_STITKU = { s: 0.75, m: 1, l: 1.35 };
  const DIZAJNY_STITKU = {
    biely: { pozadie: "rgba(251,250,246,.94)", t1: "#141513", t2: "#8A8C85", tien: false },
    tmavy: { pozadie: "rgba(20,20,20,.66)", t1: "#ffffff", t2: "rgba(255,255,255,.78)", tien: false },
    zeleny: { pozadie: "#16483A", t1: "#ffffff", t2: "#BFD8CC", tien: false },
    text: { pozadie: null, t1: "#ffffff", t2: "#ffffff", tien: true },
  };
  let meradlo = null;
  /**
   * Kde je štítok polovice i v jej okne (ow × oh) pri mierke k = strana
   * štvorca / 2000. `rohCelku` = okno siaha do pravého dolného rohu štvorca —
   * tam stojí postavička (vodoznak), štítok v tom rohu ide nad ňu.
   */
  function rozmerStitku(i, ow, oh, k, rohCelku) {
    const m = k * VELKOST_STITKU[stitok.velkost];
    const t1 = popisky()[i].toUpperCase(), t2 = denCz(stav[i].den);
    meradlo = meradlo || document.createElement("canvas").getContext("2d");
    meradlo.font = pismo(600, 40 * m);
    const w1 = meradlo.measureText(t1).width + 3 * m * t1.length;
    meradlo.font = pismo(400, 36 * m);
    const w2 = t2 ? meradlo.measureText(t2).width + 30 * m : 0;
    const bw = w1 + w2 + 80 * m, bh = 84 * m;
    let vpravo = stitok.roh[0] === "p";
    const dole = stitok.roh[1] === "d";
    if (rozdelenie === "cez" && i === 1) vpravo = !vpravo; // pri prekrytí sa dva štítky nesmú zakryť
    const okraj = 50 * k;
    const okrajDole = dole && vpravo && rohCelku ? 60 * k + 70 * k * 2.02 + 24 * k : okraj;
    return {
      t1, t2, w1, m, bw, bh,
      bx: vpravo ? ow - okraj - bw : okraj,
      by: dole ? oh - okrajDole - bh : okraj,
      d: DIZAJNY_STITKU[stitok.dizajn] || DIZAJNY_STITKU.biely,
    };
  }
  /** Štítok na obrazovke — HTML s rozmermi z rozmerStitku. */
  function kresliStitok(el, i, ow, oh) {
    if (!el) return;
    if (!stitok.zap) { el.hidden = true; return; }
    el.hidden = false;
    const r = rozmerStitku(i, ow, oh, stvorec.clientWidth / 2000, rozdelenie === "cez" || i === 1);
    const rodina = `${ZNACKA.pismo ? "Agrandir, " : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    Object.assign(el.style, {
      left: `${r.bx}px`, top: `${r.by}px`, width: `${r.bw}px`, height: `${r.bh}px`, borderRadius: `${r.bh / 2}px`,
      paddingLeft: `${40 * r.m}px`, background: r.d.pozadie || "transparent", fontFamily: rodina,
      textShadow: r.d.tien ? "0 1px 6px rgba(0,0,0,.6)" : "none",
    });
    el.innerHTML = `<span style="font-size:${40 * r.m}px;font-weight:600;letter-spacing:${3 * r.m}px;color:${r.d.t1};width:${r.w1}px">${r.t1}</span>`
      + (r.t2 ? `<span style="font-size:${36 * r.m}px;font-weight:400;color:${r.d.t2};margin-left:${30 * r.m}px">${r.t2}</span>` : "");
  }

  // ── EXPORT: ten istý výrez vo veľkom rozlíšení ──
  /**
   * Nakreslí celý štvorec (fotky, popisky, mriežku, čiary) do plátna c.
   * ciste = bez čiar, kresieb a mriežky — tá istá fotka „bez rozboru", aby
   * si ju klient na stránke s fotkami mohol prepnúť (Jerry, 12. 10. 2026).
   */
  function kresliCelok(c, ciste = false) {
    const N = c.width;
    const medzeraObr = Number(document.getElementById("medzera").value);
    const pomer = N / stvorec.clientWidth;
    const g = Math.round(medzeraObr * pomer);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, N, N);
    const vedla = rozdelenie === "vedla", cez = rozdelenie === "cez";
    const ow = cez ? N : vedla ? (N - g) / 2 : N, oh = cez ? N : vedla ? N : (N - g) / 2;
    okna.forEach((el, i) => {
      const s = stav[i];
      const ox = cez ? 0 : vedla ? i * (ow + g) : 0, oy = cez ? 0 : vedla ? 0 : i * (oh + g);
      const img = el.querySelector("img");
      x.save();
      x.beginPath(); x.rect(ox, oy, ow, oh); x.clip();
      if (cez && i === 1) x.globalAlpha = priehladnost;
      if (img && s.src) {
        const r = rozlozenie(s.v, s.fw, s.fh, ow, oh);
        fotkaNaPlatno(x, img, s, ox, oy, r);
      } else { x.fillStyle = "#ddd"; x.fillRect(ox, oy, ow, oh); }
      x.restore();
      if (stitok.zap && s.src) {
        // Ten istý štítok ako na obrazovke (rozmerStitku), len vo veľkom.
        const r = rozmerStitku(i, ow, oh, N / 2000, cez || i === 1);
        const bx = ox + r.bx, by = oy + r.by;
        x.save();
        if (r.d.pozadie) { x.fillStyle = r.d.pozadie; x.beginPath(); x.roundRect(bx, by, r.bw, r.bh, r.bh / 2); x.fill(); }
        if (r.d.tien) { x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 12 * r.m; x.shadowOffsetY = 2 * r.m; }
        x.textBaseline = "middle"; x.textAlign = "left";
        x.fillStyle = r.d.t1; x.font = pismo(600, 40 * r.m);
        if ("letterSpacing" in x) x.letterSpacing = `${3 * r.m}px`;
        x.fillText(r.t1, bx + 40 * r.m, by + r.bh / 2 + 2 * r.m);
        if ("letterSpacing" in x) x.letterSpacing = "0px";
        if (r.t2) { x.fillStyle = r.d.t2; x.font = pismo(400, 36 * r.m); x.fillText(r.t2, bx + 40 * r.m + r.w1 + 30 * r.m, by + r.bh / 2 + 2 * r.m); }
        x.restore();
      }
    });
    // Postavička ako nenápadný vodoznak vpravo dole (návrh D).
    if (ZNACKA.figura) {
      const k = N / 2000, fw = 70 * k, fh = fw * ZNACKA.figura.height / ZNACKA.figura.width;
      x.globalAlpha = 0.85; x.drawImage(ZNACKA.figura, N - 60 * k - fw, N - 60 * k - fh, fw, fh); x.globalAlpha = 1;
    }
    if (!ciste && document.getElementById("mriezkaExport").checked) {
      const { zvisle, vodorovne } = ciaryMriezky();
      x.strokeStyle = mriezka.farba; x.lineWidth = Math.max(1, pomer);
      for (const t of zvisle) { x.beginPath(); x.moveTo(t * N, 0); x.lineTo(t * N, N); x.stroke(); }
      for (const t of vodorovne) { x.beginPath(); x.moveTo(0, t * N); x.lineTo(N, t * N); x.stroke(); }
    }
    if (!ciste && document.getElementById("ciaryExport").checked && (ciary.length || kresby.length || detaily.length)) {
      const R = [0, 1].map((i) => ({ x: cez ? 0 : vedla ? i * (ow + g) : 0, y: cez ? 0 : vedla ? 0 : i * (oh + g), w: ow, h: oh }));
      const predVyber = vybrana, predDetail = vybranyDetail; vybrana = null; vybranyDetail = null; // vybrané (prerušované) nemá ísť do fotky
      ciaryNaPlatno(x, R, pomer, N);
      detailyNaPlatno(x, R, pomer);
      vybrana = predVyber; vybranyDetail = predDetail;
    }
  }
  /** Hotový štvorec ako JPEG — na stiahnutie aj do kartotéky klienta. */
  async function vyrobJpeg(N = 2000, ciste = false) {
    await znackaHotova;
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    kresliCelok(c, ciste);
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

  // ── RÁM FOTKY: zvyšok mimo rámčeka a rohy na zväčšovanie ──
  /**
   * Jerry, 12. 10. 2026: „pracovná plocha pred a po rámčeku; oddialenú fotku
   * mám v rámčeku a keď ju približujem, presahujem štvorec, držím ju za roh
   * a rozťahujem, potom na ňu kliknem, držím a posúvam ju po ploche."
   * Vybraná fotka ukáže celý svoj obdĺžnik: čo presahuje okno, je priesvitné
   * (pod oknami), rohy menia veľkosť (protiľahlý roh stojí), ťah po
   * priesvitnej časti fotku posúva. Pri kreslení čiar sa rám schová.
   */
  const duch = document.getElementById("duch");
  const uchopy = document.getElementById("uchopy");
  /** Fotka i v súradniciach štvorca: stred, rozmer a otočenie (px, stupne). */
  function obdlznikFotky(i) {
    const t = stav[i], R = oknaNaObrazovke()[i];
    const r = rozlozenie(t.v, t.fw, t.fh, R.w, R.h);
    return { cx: R.x + r.vlavo + r.sirka / 2, cy: R.y + r.hore + r.vyska / 2, w: r.sirka, h: r.vyska, rot: t.v.rot || 0, R };
  }
  /** Bod vo vlastných osiach fotky (lx, ly od stredu) → bod štvorca. */
  const zFotky = (o, lx, ly) => {
    const a = o.rot * RAD, c = Math.cos(a), n = Math.sin(a);
    return { x: o.cx + lx * c - ly * n, y: o.cy + lx * n + ly * c };
  };
  const doFotky = (o, P) => {
    const a = o.rot * RAD, c = Math.cos(a), n = Math.sin(a), dx = P.x - o.cx, dy = P.y - o.cy;
    return { x: dx * c + dy * n, y: -dx * n + dy * c };
  };
  const jeNaFotke = (o, P) => { const l = doFotky(o, P); return Math.abs(l.x) <= o.w / 2 && Math.abs(l.y) <= o.h / 2; };
  const otocUchyt = document.querySelector("#uchopy .otoc");
  function kresliUchopy() {
    if (!duch || !uchopy) return;
    const t = stav[aktivne];
    const ukaz = !!t?.src && !rezimCiar && rozmery.has(t.src);
    duch.hidden = !ukaz; uchopy.hidden = !ukaz;
    if (!ukaz) return;
    const o = obdlznikFotky(aktivne);
    const img = duch.querySelector("img");
    if (img.getAttribute("src") !== t.src) img.src = t.src;
    const r = rozlozenie(t.v, t.fw, t.fh, o.R.w, o.R.h);
    img.style.width = `${o.w}px`; img.style.height = `${o.h}px`;
    img.style.transform = transformaciaFotky(r, t, o.R.x, o.R.y);
    const ram = uchopy.querySelector(".ramcek-fotky");
    Object.assign(ram.style, { left: `${o.cx - o.w / 2}px`, top: `${o.cy - o.h / 2}px`, width: `${o.w}px`, height: `${o.h}px`, transform: `rotate(${o.rot}deg)` });
    for (const h of uchopy.querySelectorAll(".roh")) {
      const [sx, sy] = h.dataset.roh;
      const P = zFotky(o, sx === "p" ? o.w / 2 : -o.w / 2, sy === "d" ? o.h / 2 : -o.h / 2);
      h.style.left = `${P.x}px`; h.style.top = `${P.y}px`;
    }
    if (otocUchyt) {
      // Úchyt na otáčanie nad horným okrajom (v osi fotky), aby ho nezakryl prst pri rohu.
      // Jerry, 19. 10. 2026: „potrebujem tú fotku aj otáčať" — fotka, ktorá vypĺňa
      // polovicu, mala úchyt nad štvorcom, mimo obrazovky. Keď nad fotkou nie je
      // vidno, úchyt ide dovnútra polovice, k jej hornému okraju (uhol sa ráta
      // okolo stredu fotky, na mieste úchytu nezáleží).
      let P = zFotky(o, 0, -o.h / 2 - 34);
      const b = stvorec.getBoundingClientRect(), pl = (document.getElementById("platno") || stvorec).getBoundingClientRect();
      const vid = { x: pl.left - b.left, y: pl.top - b.top, r: pl.right - b.left, d: pl.bottom - b.top };
      const vidno = (Q) => Q.x >= vid.x + 16 && Q.x <= vid.r - 16 && Q.y >= vid.y + 16 && Q.y <= vid.d - 16;
      const vonku = vidno(P);
      if (!vonku) {
        // Stred viditeľnej časti polovice, pri jej hornom okraji.
        const l = Math.max(o.R.x, vid.x), r = Math.min(o.R.x + o.R.w, vid.r);
        P = { x: (l + r) / 2, y: Math.max(o.R.y, vid.y) + 26 };
      }
      otocUchyt.style.left = `${P.x}px`; otocUchyt.style.top = `${P.y}px`;
      const hrana = zFotky(o, 0, -o.h / 2);
      const st = uchopy.querySelector(".otoc-stopka");
      if (st) Object.assign(st.style, { left: `${hrana.x}px`, top: `${hrana.y}px`, transform: `rotate(${o.rot}deg)`, display: vonku ? "" : "none" });
    }
  }
  const miestoVoStvorci = (e) => {
    const b = stvorec.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  /** Nastaví fotke stred (cx, cy v px štvorca) a šírku w — výrez sa prepočíta. */
  function nastavStred(i, cx, cy, w) {
    const t = stav[i], R = oknaNaObrazovke()[i];
    const pokryt = Math.max(R.w / t.fw, R.h / t.fh);
    const v = { ...t.v, zoom: (w / t.fw) / pokryt, x: (cx - R.x - R.w / 2) / R.w, y: (cy - R.y - R.h / 2) / R.h };
    t.v = obmedz(v, t.fw, t.fh, R.w, R.h);
    kresli();
  }
  /** Otočenie v stupňoch, (−180, 180]; pomer strán ani stred sa nemení. */
  function nastavOtocenie(i, uhol) {
    const t = stav[i], R = oknaNaObrazovke()[i];
    let u = ((uhol + 180) % 360 + 360) % 360 - 180;
    if (u === -180) u = 180;
    t.v = obmedz({ ...t.v, rot: Math.round(u * 100) / 100 }, t.fw, t.fh, R.w, R.h);
    kresli();
  }
  /**
   * ŤAH ZA ROH (Jerry, 19. 10. 2026: „za hociktorý roh chytím tú fotku a môžem
   * ju nakloniť hocijako"). Chytený roh ide presne za prstom, protiľahlý stojí,
   * pomer strán ostáva — jedným ťahom sa fotka zväčší aj nakloní. Uhol sa
   * NEPRICHYTÁVA (prichytenie do 1,5° skákalo a malé naklonenie nešlo).
   * Shift = len zväčšiť, uhol sa nemení. Roh sa hýbe o toľko, o koľko prst —
   * kde presne ho prst chytil, nevadí (inak by pri prvom pohybe odskočil).
   */
  uchopy?.querySelectorAll(".roh").forEach((h) => {
    let kotva = null;
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const o = obdlznikFotky(aktivne), [sx, sy] = h.dataset.roh;
      const A = zFotky(o, sx === "p" ? -o.w / 2 : o.w / 2, sy === "d" ? -o.h / 2 : o.h / 2);
      const B = zFotky(o, sx === "p" ? o.w / 2 : -o.w / 2, sy === "d" ? o.h / 2 : -o.h / 2), M = miestoVoStvorci(e);
      kotva = { ...A, sx, sy, rot: o.rot, off: { x: B.x - M.x, y: B.y - M.y }, efekt: jemnyTah() };
      kotva.efekt(M, jemne(e)); // základ = miesto stlačenia
      try { h.setPointerCapture(e.pointerId); } catch { /* bez zachytenia ide ťah aj tak */ }
    });
    h.addEventListener("pointermove", (e) => {
      if (!kotva) return;
      const t = stav[aktivne], E = kotva.efekt(miestoVoStvorci(e), jemne(e));
      const dx = E.x + kotva.off.x - kotva.x, dy = E.y + kotva.off.y - kotva.y;
      // Uhlopriečka od kotvy k chytenému rohu vo vlastných osiach fotky.
      const ux = kotva.sx === "p" ? t.fw : -t.fw, uy = kotva.sy === "d" ? t.fh : -t.fh;
      let u = kotva.rot;
      if (!e.shiftKey) {
        u = (Math.atan2(dy, dx) - Math.atan2(uy, ux)) / RAD;
        u = ((u + 180) % 360 + 360) % 360 - 180;
      }
      const a = u * RAD, c = Math.cos(a), n = Math.sin(a);
      const lx = dx * c + dy * n, ly = -dx * n + dy * c;
      const sc = Math.max(1e-3, (lx * ux + ly * uy) / (ux * ux + uy * uy));
      const w = t.fw * sc;
      t.v = { ...t.v, rot: Math.round(u * 100) / 100 };
      // Stred = kotva + polovica uhlopriečky v novom uhle a mierke.
      const ox = ux * sc / 2, oy = uy * sc / 2;
      nastavStred(aktivne, kotva.x + ox * c - oy * n, kotva.y + ox * n + oy * c, w);
    });
    const pusti = () => { kotva = null; skryLupu(); };
    h.addEventListener("pointerup", pusti);
    h.addEventListener("pointercancel", pusti);
    h.addEventListener("lostpointercapture", pusti);
  });
  /**
   * OTÁČANIE ŤAHOM (Jerry, 12. 10. 2026: „pridaj aj otáčanie fotky ťahom").
   * Úchyt nad fotkou; Shift = po 15°. Prichytenie k 0°/90° (do 1,5°) bolo
   * zrušené 19. 10. 2026 — skákalo a malé naklonenie okolo nuly nešlo. Presné doladenie je
   * v paneli Fotky (◀ ▶ po 0,1°).
   */
  if (otocUchyt) {
    let zac = null;
    otocUchyt.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const o = obdlznikFotky(aktivne), P = miestoVoStvorci(e);
      zac = { uhol: Math.atan2(P.y - o.cy, P.x - o.cx), rot: o.rot, cx: o.cx, cy: o.cy, efekt: jemnyTah() };
      zac.efekt(P, jemne(e));
      try { otocUchyt.setPointerCapture(e.pointerId); } catch { /* bez zachytenia ide ťah aj tak */ }
    });
    otocUchyt.addEventListener("pointermove", (e) => {
      if (!zac) return;
      const P = zac.efekt(miestoVoStvorci(e), jemne(e));
      let u = zac.rot + (Math.atan2(P.y - zac.cy, P.x - zac.cx) - zac.uhol) / RAD;
      if (e.shiftKey) u = Math.round(u / 15) * 15;
      nastavOtocenie(aktivne, u);
    });
    const pusti = () => { zac = null; };
    otocUchyt.addEventListener("pointerup", pusti);
    otocUchyt.addEventListener("pointercancel", pusti);
  }

  // ── POHĽAD NA PLOCHU: priblížiť / oddialiť bez zmeny fotky ──
  /**
   * Jerry, 12. 10. 2026: „daj mi zoom, aby som si pracovnú plochu mohol
   * priblížiť bez toho, aby som si priblížil fotku." Mení sa VEĽKOSŤ štvorca
   * na obrazovke (nie transformácia) — čiary, lupa aj štítky tak počítajú
   * v tých istých bodoch a export o pohľade nevie (počíta pomerom).
   */
  const platno = document.getElementById("platno");
  const plocha = document.getElementById("plocha");
  let pohlad = 1;
  const okrajPlochy = () => (window.innerWidth <= 860 ? 24 : 70);
  /** Okraj plochy okolo štvorca — taký veľký, aby sa plochou dalo posúvať
   * dvoma prstami aj pri 100 % (Jerry, 13. 10. 2026: „pohyb po ploche dva prsty"). */
  const rezervaPlochy = () => (platno ? Math.round(Math.max(platno.clientWidth, platno.clientHeight) * 0.6) : 0);
  const vycentruj = () => { if (!platno) return; platno.scrollLeft = (platno.scrollWidth - platno.clientWidth) / 2; platno.scrollTop = (platno.scrollHeight - platno.clientHeight) / 2; };
  /** Štipnutie dvoma prstami (dotyk): priblíženie plochy + posun stredom prstov. Body v px obrazovky. */
  let stip = null, rezerva = 0;
  function stipZaciatok(a, b) {
    if (!platno) return;
    const k = platno.getBoundingClientRect();
    stip = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: pohlad, m: { x: (a.x + b.x) / 2 - k.left, y: (a.y + b.y) / 2 - k.top } };
  }
  function stipPohyb(a, b) {
    if (!platno || !stip) return;
    const k = platno.getBoundingClientRect(), m = { x: (a.x + b.x) / 2 - k.left, y: (a.y + b.y) / 2 - k.top };
    platno.scrollLeft -= m.x - stip.m.x; platno.scrollTop -= m.y - stip.m.y;
    stip.m = m;
    nastavPohlad(stip.z * Math.hypot(a.x - b.x, a.y - b.y) / stip.d, m);
  }
  function zakladnaStrana() {
    if (!platno) return stvorec.clientWidth || 500;
    const o = okrajPlochy();
    return Math.max(220, Math.min(platno.clientWidth, platno.clientHeight) - 2 * o);
  }
  /** Nastaví priblíženie plochy; bod (v px okna platna) ostane pod prstom/myšou. */
  function nastavPohlad(z, bod) {
    if (!platno || !plocha) return;
    const stary = pohlad;
    pohlad = Math.min(6, Math.max(0.4, z));
    const o = rezervaPlochy(), oStara = rezerva, bezRozmeru = !rezerva;
    rezerva = o;
    plocha.style.setProperty("--okraj", `${o}px`);
    const b = bod || { x: platno.clientWidth / 2, y: platno.clientHeight / 2 };
    // Bod v obsahu pred zmenou (s posunom a STARÝM okrajom) → po zmene na tom istom mieste.
    const cx = (platno.scrollLeft + b.x - oStara) / stary, cy = (platno.scrollTop + b.y - oStara) / stary;
    const strana = Math.round(zakladnaStrana() * pohlad);
    stvorec.style.width = `${strana}px`; stvorec.style.height = `${strana}px`;
    platno.scrollLeft = cx * pohlad + o - b.x;
    platno.scrollTop = cy * pohlad + o - b.y;
    if (bezRozmeru) vycentruj(); // editor bol skrytý (karta, 0 × 0) — teraz prvý raz naozaj vidno
    const h = document.getElementById("pohladH");
    if (h) h.textContent = `${Math.round(pohlad * 100)} %`;
    kresli();
  }
  document.getElementById("pohladViac")?.addEventListener("click", () => nastavPohlad(pohlad * 1.25));
  document.getElementById("pohladMenej")?.addEventListener("click", () => nastavPohlad(pohlad / 1.25));
  document.getElementById("jemne")?.addEventListener("click", (e) => {
    jemneZap = !jemneZap;
    e.currentTarget.classList.toggle("on", jemneZap);
    e.currentTarget.setAttribute("aria-pressed", String(jemneZap));
  });
  document.getElementById("pohladCely")?.addEventListener("click", () => { pohlad = 1; nastavPohlad(1); vycentruj(); });
  addEventListener("resize", () => nastavPohlad(pohlad));
  // Skrytá karta, celá obrazovka, otočenie iPadu — mení sa platno, nie okno.
  if (platno && window.ResizeObserver) new ResizeObserver(() => nastavPohlad(pohlad)).observe(platno);
  // Úchyt na otáčanie sa drží viditeľnej časti — po posune plochy sa prekreslí.
  platno?.addEventListener("scroll", () => kresliUchopy(), { passive: true });
  if (platno) {
    const bodPlatna = (e) => { const b = platno.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    /**
     * TOUCHPAD = PLOCHA (Jerry, 13. 10. 2026: „zväčšovanie a zmenšovanie fotky
     * by malo ísť iba po rohoch, posúvanie fotky kliknem-držím-pohybujem a pohyb
     * po ploche: štipnutie zväčšuje/zmenšuje, dva prsty posúvajú"). Koliesko ani
     * štipnutie fotku nikdy nemenia — ani nad ňou, ani nad presahom.
     */
    let gesto = false, gz = 1; // Safari na Macu posiela štipnutie aj ako gesture*
    platno.addEventListener("gesturestart", (e) => { e.preventDefault(); gesto = true; gz = pohlad; });
    platno.addEventListener("gesturechange", (e) => { e.preventDefault(); nastavPohlad(gz * e.scale, bodPlatna(e)); });
    platno.addEventListener("gestureend", (e) => { e.preventDefault(); gesto = false; });
    platno.addEventListener("wheel", (e) => {
      e.preventDefault();
      const mierka = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // koliesko myši ide po riadkoch
      if (e.ctrlKey || e.metaKey) {
        if (gesto) return; // to isté štipnutie už rieši gesturechange
        nastavPohlad(pohlad * Math.exp(-e.deltaY * mierka * 0.01), bodPlatna(e));
      } else {
        platno.scrollLeft += e.deltaX * mierka;
        platno.scrollTop += e.deltaY * mierka;
      }
    }, { passive: false });
    // Prsty na prázdnej ploche: jeden posúva plochu (alebo fotku, ak je pod
    // ním jej priesvitná časť), dva približujú plochu.
    const prsty = new Map(), prstyObr = new Map();
    let tah = null;
    platno.addEventListener("pointerdown", (e) => {
      if (e.target.closest?.(".okno, .roh, .otoc, .pohlad, svg.ciary.kreslim")) return;
      prsty.set(e.pointerId, bodPlatna(e));
      prstyObr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { platno.setPointerCapture(e.pointerId); } catch { /* bez zachytenia ide ťah aj tak */ }
      if (prsty.size === 1) {
        const P = miestoVoStvorci(e), t = stav[aktivne];
        const o = t?.src && !rezimCiar ? obdlznikFotky(aktivne) : null;
        const naFotke = o && jeNaFotke(o, P);
        tah = naFotke ? { druh: "fotka", P, o, efekt: jemnyTah() } : { druh: "plocha", x: e.clientX, y: e.clientY, sl: platno.scrollLeft, st: platno.scrollTop };
        if (naFotke) { drzi = true; tah.efekt(P, jemne(e)); } // posun fotky je jeden krok späť, nie desať
      } else if (prsty.size === 2) {
        // Dva prsty = plocha, aj keď prvý držal fotku (veľkosť fotky len za rohy).
        stipZaciatok(...prstyObr.values());
        tah = { druh: "stipnutie" };
      }
    });
    platno.addEventListener("pointermove", (e) => {
      if (!prsty.has(e.pointerId) || !tah) return;
      prsty.set(e.pointerId, bodPlatna(e));
      prstyObr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tah.druh === "plocha") {
        platno.scrollLeft = tah.sl - (e.clientX - tah.x);
        platno.scrollTop = tah.st - (e.clientY - tah.y);
      } else if (tah.druh === "fotka") {
        const P = tah.efekt(miestoVoStvorci(e), jemne(e));
        nastavStred(aktivne, tah.o.cx + P.x - tah.P.x, tah.o.cy + P.y - tah.P.y, tah.o.w);
      } else if (tah.druh === "stipnutie" && prsty.size === 2) {
        stipPohyb(...prstyObr.values());
      }
    });
    const koniec = (e) => {
      prsty.delete(e.pointerId); prstyObr.delete(e.pointerId);
      if (!prsty.size) tah = null;
      else if (tah?.druh === "stipnutie") tah = { druh: "hotovo" }; // zvyšný prst už nič nehýbe
    };
    platno.addEventListener("pointerup", koniec);
    platno.addEventListener("pointercancel", koniec);
  }

  // ── KROK SPÄŤ PRE CELÝ EDITOR ──
  /**
   * Jerry, 12. 10. 2026: „krok späť by mal fungovať na všetko v tom editore."
   * Nie zoznam jednotlivých akcií, ale celé snímky stavu: po každej zmene
   * (kreslenie volá zmena()) sa po chvíľke ticha stav porovná s posledným
   * a ak je iný, starý ide do histórie. Ťahanie fotky alebo čiary je jeden
   * krok — kým drží prst/myš, nič sa nezapisuje. Výber čiary a otvorené
   * skupiny nie sú stav, krok späť ich preskakuje.
   */
  let spat = [], dopredu = [], posledny = null, casovacZmeny = 0, drzi = false, obnovujem = false;
  const zaokruhli = (_, h) => (typeof h === "number" ? Math.round(h * 1e5) / 1e5 : h);
  const zaskrtnute = (id) => document.getElementById(id).checked;
  function snimkaStavu() {
    return JSON.stringify({
      stav: stav.map((t) => ({ src: t.src, den: t.den, v: t.v, zrkadlo: t.zrkadlo, vlastny: !!t.vlastny })),
      ciary, kresby, detaily, rozdelenie, priehladnost, mriezka, stitok,
      medzera: Number(document.getElementById("medzera").value),
      sklon: zaskrtnute("sklon"), ciaryExport: zaskrtnute("ciaryExport"), mriezkaExport: zaskrtnute("mriezkaExport"),
      popis: document.getElementById("popisFotky")?.value || "",
    }, zaokruhli);
  }
  function zmena() {
    if (obnovujem || posledny === null) return;
    clearTimeout(casovacZmeny);
    casovacZmeny = setTimeout(potvrdZmenu, 400);
  }
  function potvrdZmenu() {
    clearTimeout(casovacZmeny);
    if (drzi || posledny === null) return; // dopíše sa po pustení
    const t = snimkaStavu();
    if (t === posledny) return;
    spat.push(posledny);
    if (spat.length > 150) spat.shift();
    dopredu = [];
    posledny = t;
    tlacidlaKrokov();
    window.poZmeneStavu?.(t);
  }
  /** Vráti editor do stavu t (reťazec zo snimkaStavu). */
  function obnovStav(t) {
    const o = JSON.parse(t);
    obnovujem = true;
    o.stav.forEach((z, i) => {
      const r = rozmery.get(z.src);
      Object.assign(stav[i], z, { fw: r?.fw || 1, fh: r?.fh || 1 });
    });
    ciary = o.ciary || [];
    kresby = o.kresby || [];
    detaily = o.detaily || [];
    vybranyDetail = null;
    cakaUhol = null;
    dalsieId = Math.max(dalsieId, ...ciary.map((c) => c.id + 1), ...kresby.map((k) => k.id + 1), ...detaily.map((d) => d.id + 1));
    vybrana = null;
    rozdelenie = o.rozdelenie || "vedla";
    priehladnost = o.priehladnost ?? 0.5;
    Object.assign(mriezka, o.mriezka || {});
    Object.assign(stitok, o.stitok || {});
    const medzera = document.getElementById("medzera");
    medzera.value = String(o.medzera ?? 4);
    stvorec.style.setProperty("--medzera", `${medzera.value}px`);
    document.getElementById("priehladnost").value = String(Math.round(priehladnost * 100));
    document.getElementById("priehladnostH").textContent = `${Math.round(priehladnost * 100)} %`;
    document.getElementById("hustota").value = String(mriezka.hustota);
    document.getElementById("hustotaH").textContent = String(mriezka.hustota);
    for (const [id, h] of [["mriezkaDruh", mriezka.druh], ["mriezkaFarba", mriezka.farba]]) {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x.dataset.v === h));
    }
    for (const id of ["sklon", "ciaryExport", "mriezkaExport"]) if (typeof o[id] === "boolean") document.getElementById(id).checked = o[id];
    const popisEl = document.getElementById("popisFotky");
    if (popisEl) popisEl.value = o.popis || "";
    pouziRozdelenie();
    pouziStitok();
    kresli();
    obnovujem = false;
    posledny = snimkaStavu();
    tlacidlaKrokov();
  }
  function krokSpat() {
    potvrdZmenu();
    if (!spat.length) return;
    dopredu.push(posledny);
    obnovStav(spat.pop());
    window.poZmeneStavu?.(posledny);
  }
  function krokDopredu() {
    potvrdZmenu();
    if (!dopredu.length) return;
    spat.push(posledny);
    obnovStav(dopredu.pop());
    window.poZmeneStavu?.(posledny);
  }
  /** Načíta celý stav (návrh) ako jeden krok — krok späť vráti, čo bolo pred ním. */
  function nacitajStav(t, rozmeryNavrhu) {
    for (const [src, r] of Object.entries(rozmeryNavrhu || {})) rozmery.set(src, r);
    potvrdZmenu();
    spat.push(posledny);
    dopredu = [];
    obnovStav(t);
  }
  function tlacidlaKrokov() {
    const a = document.getElementById("krokSpat"), b = document.getElementById("krokDopredu");
    if (a) a.disabled = !spat.length;
    if (b) b.disabled = !dopredu.length;
  }
  document.getElementById("krokSpat").onclick = krokSpat;
  document.getElementById("krokDopredu").onclick = krokDopredu;
  for (const id of ["ciaryExport", "mriezkaExport"]) document.getElementById(id).addEventListener("change", zmena);
  document.getElementById("popisFotky")?.addEventListener("input", zmena);
  // Ťah = jeden krok: počas držania sa nezapisuje, po pustení áno.
  stvorec.addEventListener("pointerdown", () => { drzi = true; }, true);
  const pustene = () => { if (drzi) { drzi = false; zmena(); } };
  addEventListener("pointerup", pustene, true);
  addEventListener("pointercancel", pustene, true);

  window.skladacka = {
    nastavRezim, infoVybranej, kresli, vlozObrazok, vlozSubor, vyrobJpeg, vyrobInstagram, datumExif,
    get rezimCiar() { return rezimCiar; },
    get vybrana() { return vybrana; },
    get pocetCiar() { return ciary.length; },
    get pocetKresieb() { return kresby.length; },
    /** Je v exporte niečo navyše oproti čistej fotke (čiary, kresba, mriežka)? */
    get maRozbor() {
      return (document.getElementById("ciaryExport").checked && (ciary.length > 0 || kresby.length > 0 || detaily.length > 0))
        || (document.getElementById("mriezkaExport").checked && mriezka.druh !== "ziadna");
    },
    get rozdelenie() { return rozdelenie; },
    get mriezka() { return { ...mriezka }; },
    get stitok() { return { ...stitok }; },
    get aktivne() { return aktivne; },
    get stav() { return stav; },
    denCz, snimkaStavu, nacitajStav, krokSpat, krokDopredu,
    /** Rozmery fotiek, ktoré sú teraz v polovičkách — idú s návrhom. */
    rozmeryFotiek: () => Object.fromEntries(stav.filter((t) => t.src && rozmery.has(t.src)).map((t) => [t.src, rozmery.get(t.src)])),
    get prazdnyStav() { return prazdny; },
  };
  pouziStitok();
  nastavPohlad(1);
  vycentruj();
  kresli();
  posledny = snimkaStavu();
  const prazdny = posledny;
  tlacidlaKrokov();
})();
