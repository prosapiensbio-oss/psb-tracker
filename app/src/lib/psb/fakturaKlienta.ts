/**
 * „CHCETE PLATIT FAKTUROU?" — FAKTURAČNÉ ÚDAJE VYPĹŇA KLIENT SÁM.
 *
 * Jerry, 28. 10. 2026: „napadlo ma pridať do toho odkazu ďalšiu vec — chcete
 * platiť faktúrou? vyplňte údaje tu" a „ja by som to chcel vidieť priamo
 * v tom odkaze". Údaje sa dovtedy pýtali v správach a prepisovali ručne do
 * Kokpitu; firma ich pritom má v registri a klientovi stačí napísať IČO.
 *
 * Blok žije na stránke po úvodnom (`/u/<token>`), formulár sa rozbalí na
 * mieste. Zápis ide do `klient_fakturacia` — tam, odkiaľ ich berie
 * vystavenie faktúry, takže Jerry pri faktúre nič neprepisuje.
 *
 * Tu je len čistá logika (overenie, prevod z ARES, HTML), aby sa dala
 * otestovať bez databázy. Zápis robí `routes/u.$token.tsx`.
 */

const esc = (s: string) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** IČO má kontrolnú číslicu (modulo 11) — preklep sa chytí ešte pred registrom. */
export function platneIco(vstup: string): boolean {
  const ico = String(vstup || "").replace(/\s/g, "");
  if (!/^\d{1,8}$/.test(ico)) return false;
  const c = ico.padStart(8, "0");
  let sucet = 0;
  for (let i = 0; i < 7; i++) sucet += Number(c[i]) * (8 - i);
  const zv = sucet % 11;
  const kontrola = zv === 0 ? 1 : zv === 1 ? 0 : 11 - zv;
  return kontrola === Number(c[7]);
}

/** PSČ ako ho píše česká pošta: „602 00". */
export function peknePsc(psc: string | number): string {
  const d = String(psc ?? "").replace(/\D/g, "");
  return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : String(psc ?? "").trim();
}

export type UdajeFirmy = { firma: string; dic: string; ulica: string; psc: string; mesto: string };

/**
 * Odpoveď ARES (`/ekonomicke-subjekty/<ičo>`) → údaje na faktúru.
 * Obec bez ulíc má len časť obce a číslo popisné; v Prahe a Brne patrí na
 * faktúru obvod („Praha 4"), nie len názov mesta.
 */
export function udajeZAres(j: unknown): UdajeFirmy | null {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const s = (o.sidlo && typeof o.sidlo === "object" ? o.sidlo : {}) as Record<string, unknown>;
  const firma = String(o.obchodniJmeno || "").trim();
  if (!firma) return null;
  const str = (k: string) => String(s[k] ?? "").trim();
  const cislo = [str("cisloDomovni"), str("cisloOrientacni") ? `${str("cisloOrientacni")}${str("cisloOrientacniPismeno")}` : ""]
    .filter(Boolean).join("/");
  const ulica = [str("nazevUlice") || str("nazevCastiObce") || str("nazevObce"), cislo].filter(Boolean).join(" ");
  const obec = str("nazevObce");
  const obvod = str("nazevMestskehoObvodu");
  const mesto = obvod && obec && obvod.startsWith(obec) ? obvod : obec;
  return { firma, dic: String(o.dic || "").trim(), ulica, psc: peknePsc(str("psc")), mesto };
}

export type ChybaFaktury = "ico" | "dic" | "email" | "adresa" | "ares" | "nedostupne";

export type VstupFaktury = {
  komu: "firma" | "osoba";
  ico: string;
  dic: string;
  email: string;
  /** Ručne zadaný názov firmy alebo meno na faktúru. */
  nazov: string;
  ulica: string;
  psc: string;
  mesto: string;
};

/**
 * Formulár → údaje alebo chyba. Pri firme stačí IČO, adresa je len pre prípad,
 * že ju register nemá. Pri osobe je adresa povinná — bez nej sa faktúra
 * vystaviť nedá. E-mail je povinný vždy: faktúra chodí mailom.
 */
export function vstupZFormulara(f: Record<string, string>): { ok: true; v: VstupFaktury } | { ok: false; chyba: ChybaFaktury } {
  const g = (k: string, max = 160) => String(f[k] ?? "").trim().slice(0, max);
  const komu = g("komu") === "osoba" ? "osoba" : "firma";
  const email = g("email").toLowerCase();
  const pref = komu === "firma" ? "f_" : "o_";
  const v: VstupFaktury = {
    komu,
    ico: komu === "firma" ? g("ico", 20).replace(/\s/g, "") : "",
    dic: komu === "firma" ? g("dic", 20).replace(/\s/g, "").toUpperCase() : "",
    email,
    nazov: g(`${pref}nazov`),
    ulica: g(`${pref}ulica`, 120),
    psc: peknePsc(g(`${pref}psc`, 20)),
    mesto: g(`${pref}mesto`, 80),
  };
  if (komu === "firma") {
    if (!platneIco(v.ico)) return { ok: false, chyba: "ico" };
    v.ico = v.ico.padStart(8, "0");
    if (v.dic && !/^CZ\d{8,10}$/.test(v.dic)) return { ok: false, chyba: "dic" };
  } else if (!v.nazov || !v.ulica || !/^\d{3} \d{2}$/.test(v.psc) || !v.mesto) {
    return { ok: false, chyba: "adresa" };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, chyba: "email" };
  return { ok: true, v };
}

/** Ručne zadaná adresa firmy je úplná — dá sa uložiť aj bez registra. */
export const rucnaAdresaFirmy = (v: VstupFaktury): boolean => !!(v.nazov && v.ulica && v.psc && v.mesto);

const HLASKY: Record<ChybaFaktury, string> = {
  ico: "IČO nesedí — má 8 číslic, zkontrolujte ho prosím.",
  dic: "DIČ zadejte ve tvaru CZ12345678, nebo pole nechte prázdné.",
  email: "Zkontrolujte prosím e-mail — na něj fakturu pošleme.",
  adresa: "Pro fakturu na jméno potřebujeme jméno, ulici, PSČ a město.",
  ares: "Toto IČO jsme v registru firem nenašli. Zkontrolujte ho, nebo adresu firmy vyplňte ručně níže.",
  nedostupne: "Registr firem teď neodpovídá. Zkuste to prosím za chvíli, nebo adresu firmy vyplňte ručně níže.",
};
export const hlaskaFaktury = (c: string | null | undefined): string => HLASKY[c as ChybaFaktury] || "";

/** Čo už o klientovi vieme — na predvyplnenie a na „údaje máme". */
export type UlozeneUdaje = {
  firma: string; ico: string; dic: string; ulica: string; psc: string; mesto: string; email: string;
};

/** Údaje sú „hotové", keď je z nich faktúra: IČO, alebo adresa. Samotný e-mail nestačí. */
export const udajeHotove = (u: UlozeneUdaje | null | undefined): boolean =>
  !!u && (!!u.ico || !!(u.ulica && u.mesto));

export type BlokFaktury = {
  klient: string;
  udaje: UlozeneUdaje | null;
  /** Kód chyby z posledného odoslania — formulár sa ukáže otvorený a s hláškou. */
  chyba?: string | null;
  /** Práve uložené — poďakovanie namiesto otázky. */
  ulozene?: boolean;
  /** Predvyplnené hodnoty z neúspešného odoslania, aby klient nepísal znova. */
  vstup?: Partial<Record<string, string>> | null;
};

const pole = (label: string, name: string, hodnota: string, o: { ph?: string; pomoc?: string; typ?: string; mod?: string; auto?: string } = {}) => `
<label style="display:block;margin-top:14px">
<span style="display:block;font-size:14px;font-weight:600;color:#1A2E24">${label}</span>
${o.pomoc ? `<span style="display:block;font-size:12.5px;color:#5B6B60;margin-top:2px">${o.pomoc}</span>` : ""}
<input type="${o.typ || "text"}" name="${name}" value="${esc(hodnota)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.mod ? ` inputmode="${o.mod}"` : ""}${o.auto ? ` autocomplete="${o.auto}"` : ""} style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px 14px;border:1px solid #DCE3DD;border-radius:12px;background:#FFFFFF;font-family:inherit;font-size:16px;color:#1A2E24">
</label>`;

const adresaPolia = (pref: string, h: (k: string) => string, nazovLabel: string, nazovPh: string) => `
${pole(nazovLabel, `${pref}nazov`, h(`${pref}nazov`), { ph: nazovPh, auto: pref === "o_" ? "name" : "organization" })}
${pole("Ulice a číslo", `${pref}ulica`, h(`${pref}ulica`), { ph: "Joštova 4", auto: "street-address" })}
<div style="display:flex;gap:10px">
<div style="flex:0 0 36%">${pole("PSČ", `${pref}psc`, h(`${pref}psc`), { ph: "602 00", mod: "numeric", auto: "postal-code" })}</div>
<div style="flex:1;min-width:0">${pole("Město", `${pref}mesto`, h(`${pref}mesto`), { ph: "Brno", auto: "address-level2" })}</div>
</div>`;

/**
 * Prepínač firma/osoba bez JavaScriptu: `:has()` skryje polia druhej voľby.
 * Prehliadač bez `:has()` ukáže obe sady — vyplniť sa dá stále, server berie
 * len polia zvolenej voľby.
 */
export const CSS_FAKTURY = `
.fa-volba input{position:absolute;opacity:0;pointer-events:none}
.fa-volba span{display:block;text-align:center;padding:11px 8px;border-radius:32px;border:1.5px solid #DCE3DD;font-weight:600;font-size:15px;color:#1A2E24;cursor:pointer}
.fa-volba input:checked+span{background:#2D7D5A;border-color:#2D7D5A;color:#FFFFFF}
.fa-volba input:focus-visible+span{outline:2px solid #1A2E24;outline-offset:2px}
.fa:has(#fa-osoba:checked) .jen-firma{display:none}
.fa:has(#fa-firma:checked) .jen-osoba{display:none}
.fa-tlacidlo{display:block;margin-top:14px;text-align:center;background:#2D7D5A;color:#FFFFFF;font-size:16px;font-weight:600;padding:15px 22px;border-radius:32px;cursor:pointer}
details[open]>.fa-tlacidlo{display:none}
`;

/**
 * Blok na stránke po úvodnom. Tri podoby:
 *  - údaje ešte nemáme → otázka + tlačidlo, ktoré rozbalí formulár na mieste;
 *  - údaje máme → čo na faktúre bude, a „Změnit";
 *  - práve uložené → poďakovanie + to isté zhrnutie.
 */
export function blokFakturyHtml(b: BlokFaktury): string {
  const u = b.udaje;
  const hotove = udajeHotove(u);
  const vstup = b.vstup || {};
  const h = (k: string) => String(vstup[k] ?? "");
  const komu = h("komu") || (u && !u.ico && u.ulica ? "osoba" : "firma");
  const pred = (k: keyof UlozeneUdaje) => String(u?.[k] ?? "");
  // Predvyplnenie: najprv to, čo klient práve poslal, inak uložené.
  const hod = (k: string) => {
    if (k in vstup) return h(k);
    if (k === "ico") return pred("ico");
    if (k === "dic") return pred("dic");
    if (k === "email") return pred("email");
    if (k === "o_nazov") return pred("firma") || b.klient;
    if (k === "o_ulica" && komu === "osoba") return pred("ulica");
    if (k === "o_psc" && komu === "osoba") return pred("psc");
    if (k === "o_mesto" && komu === "osoba") return pred("mesto");
    return "";
  };
  const chyba = hlaskaFaktury(b.chyba);
  const otvorene = !!chyba;

  const formular = `<form method="post" class="fa" style="margin-top:14px">
<input type="hidden" name="akcia" value="faktura">
${chyba ? `<div role="alert" style="margin-bottom:6px;border-left:3px solid #B4532A;background:#FBF1EC;border-radius:10px;padding:11px 14px;font-size:14.5px;line-height:1.55;color:#7A3418">${esc(chyba)}</div>` : ""}
<div style="display:flex;gap:8px">
<label class="fa-volba" style="flex:1"><input type="radio" id="fa-firma" name="komu" value="firma"${komu !== "osoba" ? " checked" : ""}><span>Na firmu (IČO)</span></label>
<label class="fa-volba" style="flex:1"><input type="radio" id="fa-osoba" name="komu" value="osoba"${komu === "osoba" ? " checked" : ""}><span>Na jméno</span></label>
</div>
<div class="jen-firma">
${pole("IČO", "ico", hod("ico"), { ph: "např. 12345678", pomoc: "Název a adresu firmy doplníme z registru sami.", mod: "numeric" })}
${pole("DIČ", "dic", hod("dic"), { ph: "CZ12345678", pomoc: "Jen pokud jste plátce DPH." })}
<details${b.chyba === "ares" || b.chyba === "nedostupne" ? " open" : ""} style="margin-top:14px">
<summary style="font-size:14px;color:#2D7D5A;font-weight:600;cursor:pointer">Firma není v registru? Vyplnit adresu ručně</summary>
${adresaPolia("f_", hod, "Název firmy", "Firma s.r.o.")}
</details>
</div>
<div class="jen-osoba">
${adresaPolia("o_", hod, "Jméno a příjmení", "Jan Novák")}
</div>
${pole("E-mail pro fakturu", "email", hod("email"), { ph: "jmeno@firma.cz", typ: "email", auto: "email" })}
<button type="submit" style="display:block;width:100%;margin-top:20px;padding:15px;border:0;border-radius:32px;background:#2D7D5A;color:#FFFFFF;font-family:inherit;font-size:16px;font-weight:700;cursor:pointer">Uložit fakturační údaje</button>
<div style="margin-top:10px;font-size:12.5px;color:#5B6B60;text-align:center;line-height:1.55">Údaje uvidí jen Váš trenér a použijí se jen na faktury od ProSapiens Biomechanic.</div>
</form>`;

  if (hotove && u) {
    const riadky = [
      u.firma || b.klient,
      u.ulica,
      [u.psc, u.mesto].filter(Boolean).join(" "),
      [u.ico ? `IČO ${u.ico}` : "", u.dic ? `DIČ ${u.dic}` : ""].filter(Boolean).join(" · "),
      u.email,
    ].filter(Boolean);
    return `<div id="faktura" style="margin-top:28px;border:1px solid #DCE3DD;border-radius:18px;padding:16px 18px;background:#F6F8F6">
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:17px;color:#1A2E24">${b.ulozene ? "Děkujeme, fakturační údaje máme ✓" : "Fakturační údaje máme ✓"}</div>
<div style="margin-top:8px;font-size:14.5px;line-height:1.6;color:#3C4C42">Fakturu vystavíme na:<br>${riadky.map(esc).join("<br>")}</div>
<details${otvorene ? " open" : ""} style="margin-top:6px">
<summary style="font-size:14px;color:#2D7D5A;font-weight:600;cursor:pointer;margin-top:6px">Změnit údaje</summary>
${formular}
</details>
</div>`;
  }

  return `<div id="faktura" style="margin-top:28px;border:2px solid #2D7D5A;border-radius:18px;padding:18px 18px 16px;background:#F3F9F5">
<div style="display:flex;gap:12px;align-items:flex-start">
<span style="font-size:24px;line-height:1" role="img" aria-label="faktura">🧾</span>
<div style="flex-grow:1;min-width:0">
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:19px;line-height:1.3;color:#1A2E24">Chcete platit fakturou?</div>
<div style="margin-top:6px;font-size:15px;line-height:1.6;color:#3C4C42">Vyplňte fakturační údaje — fakturu Vám pak vystavíme na firmu nebo na jméno a pošleme e-mailem. Zabere to minutu.</div>
</div></div>
<details${otvorene ? " open" : ""}>
<summary class="fa-tlacidlo">Vyplnit fakturační údaje</summary>
${formular}
</details>
<div style="margin-top:9px;font-size:12.5px;color:#5B6B60;text-align:center">Platíte převodem na účet nebo hotově? Nic vyplňovat nemusíte.</div>
</div>`;
}
