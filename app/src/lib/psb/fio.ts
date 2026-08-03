// Import bankového výpisu.
//
// Zámerne tolerantný parser a zámerne s NÁHĽADOM pred zápisom. Fio dáva výpis
// v dvoch úplne odlišných podobách a formát sa časom mení — keby import
// zapisoval rovno, zlý odhad stĺpcov by ticho pokazil P&L. Takto sa najprv
// ukáže, čo appka pochopila, a zapisuje sa až po potvrdení.
//
// Podporované sú obe podoby:
//   • CSV „Výpis pohybů" — stĺpce Datum / Objem / Protiúčet / Zpráva…
//   • TEXT z internetbankingu (aj skopírovaný z PDF) — riadky v tvare
//     "30.06.2026 -604,12 CZK … Nákup: ANTHROPIC, …". Tam nie je hlavička ani
//     stĺpce; pohyby sa hľadajú podľa dvojice dátum + suma a popis je všetko
//     po ďalší dátum.
//
// POZOR na jednu vec, ktorá sa ukázala až na skutočnom výpise: **na účte sú
// aj súkromné výdavky** (potraviny, Bolt, Apple) a výplaty zakladateľov. Nie
// je to teda firemný výpis, z ktorého by sa dal P&L urobiť automaticky — časť
// riadkov do P&L nepatrí vôbec a musí ísť do koša „mimo".
//
// Podľa pravidla z prevadzka.md sa z banky sledujú hlavne VÝDAVKY. Príchodzie
// platby sa importujú tiež, ale slúžia len na kontrolu proti PTminderu —
// tržby sa z nich nikdy nepočítajú.

export type FioRiadok = {
  datum: string;        // ISO
  suma: number;         // záporná = výdavok
  protistrana: string;  // názov protiúčtu alebo účet
  poznamka: string;     // správa pre príjemcu / poznámka / VS
  typ: string;
  /** Odhad kategórie v P&L, napr. "fixne.apps.adobe". Prázdne = netuším. */
  kategoria: string;
};

export type FioParse =
  | { ok: true; riadky: FioRiadok[]; hlavicka: string[] }
  | { ok: false; chyba: string; ukazka: string[] };

const oddelovac = (riadok: string): string => {
  const kandidati = [";", "\t", ","];
  return kandidati.sort((a, b) => riadok.split(b).length - riadok.split(a).length)[0];
};

const rozdel = (riadok: string, sep: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let vUvodzovkach = false;
  for (let i = 0; i < riadok.length; i++) {
    const ch = riadok[i];
    if (ch === '"') {
      if (vUvodzovkach && riadok[i + 1] === '"') { cur += '"'; i++; }
      else vUvodzovkach = !vUvodzovkach;
    } else if (ch === sep && !vUvodzovkach) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/^"|"$/g, ""));
};

/** "1 234,50" | "-1234.50" | "1.234,50" → číslo */
export function fioSuma(s: string): number {
  const t = (s || "").replace(/\s| /g, "");
  if (!t) return 0;
  // Ak je čiarka za bodkou, čiarka je desatinná (1.234,50); inak bodka.
  const posledna = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  const des = posledna >= 0 && t.length - posledna <= 3 ? t[posledna] : "";
  const cistý = des === ","
    ? t.replace(/\./g, "").replace(",", ".")
    : t.replace(/,/g, "");
  const n = Number(cistý);
  return Number.isFinite(n) ? n : 0;
}

/** "12.03.2026" | "2026-03-12" | "12/03/2026" → ISO deň */
export function fioDatum(s: string): string | null {
  const t = (s || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// Zabudované pravidlá odvodené z položiek P&L. Nie sú to všetky prípady —
// zvyšok sa doučí z toho, čo Jerry zaradí ručne (uloží sa ako pravidlo).
/** Kategórie mimo P&L — riadky, ktoré do nákladov firmy nepatria. */
export const MIMO_PNL = "mimo";
export const VYPLATY = "vyplaty";

const SEED: [RegExp, string][] = [
  // Výplaty zakladateľov nie sú náklad v P&L — sú to prevody, ktoré sleduje
  // modul J&T Výplaty. V tomto výpise sú najčastejšou položkou vôbec (19×).
  [/vyplata|výplata|zaťkov|zatkov|terézia|terezia/i, VYPLATY],
  // Súkromné. Účet nie je čisto firemný a bez tohto koša by P&L nafúklo
  // o nákupy potravín a taxíky.
  [/billa|rohlik|rohlík|lidl|albert|kaufland|tesco|globus|penny|potraviny|drogerie|spajz|spajza/i, MIMO_PNL],
  [/bolt\.|uber|liftago/i, MIMO_PNL],
  [/výběr z bankomatu|vyber z bankomatu/i, MIMO_PNL],
  [/ahsoka/i, MIMO_PNL],
  [/adobe/i, "fixne.apps.adobe"],
  [/canva/i, "fixne.apps.canva"],
  [/captions/i, "fixne.apps.captions"],
  [/capcut|bytedance/i, "fixne.apps.capcut"],
  [/openai|chatgpt|anthropic|claude|perplexit|higgsfield|cursor|midjourney/i, "fixne.apps.ai"],
  [/apple\.com|itunes/i, "fixne.apps.ine"],
  [/websupport|wedos|forpsi|webglobe/i, "variabilne.sluzby.web"],
  [/idoklad|i\.doklad/i, "fixne.apps.idoklad"],
  [/metricool/i, "fixne.apps.metricool"],
  [/microsoft/i, "fixne.apps.microsoft"],
  [/ptminder/i, "fixne.apps.ptminder"],
  [/truecoach/i, "fixne.apps.truecoach"],
  [/freelo/i, "fixne.apps.freelo"],
  [/facebook|facebk|meta platforms/i, "fixne.marketing.facebook"],
  [/google ads|google ireland/i, "fixne.marketing.google"],
  [/multibox|wenet/i, "fixne.marketing.multibox"],
  [/nájom|najom|nájem|najem|energie|e\.on|čez|cez a\.s/i, "fixne.prevadzka.najom"],
  [/poplatek za pojištění|poplatek/i, "variabilne.sluzby.ine"],
  [/jarek|heinrich/i, "fixne.prevadzka.splatkaJarek"],
  [/finanční úřad|financni urad|daň|dan z prijmu/i, "fixne.prevadzka.bonusFinancak"],
  [/vodafone|o2|t-mobile|telefon/i, "variabilne.sluzby.telefon"],
  [/hosting|wedos|forpsi|webglobe|doména|domena/i, "variabilne.sluzby.web"],
  [/účto|ucto|právni|pravni|advokát|advokat/i, "variabilne.sluzby.pravnicka"],
  [/školen|skolen|kurz|seminár|seminar/i, "variabilne.sluzby.skolenie"],
  [/tisk|tlač|tlac|vizitk/i, "variabilne.sluzby.tlac"],
];

export function odhadniKategoriu(text: string, pravidla: { vzor: string; kategoria: string }[] = []): string {
  // Naučené pravidlá majú prednosť pred zabudovanými — Jerry vie lepšie.
  for (const p of pravidla) {
    if (p.vzor && text.toLowerCase().includes(p.vzor.toLowerCase())) return p.kategoria;
  }
  for (const [re, kat] of SEED) if (re.test(text)) return kat;
  return "";
}

/** Z popisu vytiahne to, čo sa dá použiť ako meno protistrany. */
export function protistranaZPopisu(popis: string): string {
  const nakup = /Nákup:\s*([^,]{2,60})/i.exec(popis);
  if (nakup) return nakup[1].trim();
  const ucet = /(\d{6,}\s*\/\s*\d{4})\s*([^\d]{2,40})?/.exec(popis);
  if (ucet) return (ucet[2] || ucet[1]).trim();
  return popis.slice(0, 40).trim();
}

/**
 * Vyzerá text ako bankový výpis? Rozhoduje sa to na klientovi, aby upload vedel
 * súbor poslať tam, kam patrí: výpis z PTmindera sa dá nahrať naslepo, výpis
 * z banky nie — každý výdavok potrebuje kategóriu a na účte sú aj súkromné veci.
 */
export function jeBankovyVypis(text: string): boolean {
  const h = text.slice(0, 1500).toLowerCase();
  if (h.includes("objem") && h.includes("datum")) return true;
  if (h.includes("zpráva pro příjemce") || h.includes("protiúčet")) return true;
  // Textová podoba z internetbankingu: aspoň dva pohyby v tvare dátum + suma.
  return (text.match(/\d{1,2}\.\d{1,2}\.\d{4}\s*-?[\d\s\u00a0]+,\d{2}\s*CZK/g) || []).length >= 2;
}

export function parseFio(text: string, pravidla: { vzor: string; kategoria: string }[] = []): FioParse {
  const riadky = text.split(/\r?\n/).filter((l) => l.trim());
  if (!riadky.length) return { ok: false, chyba: "Súbor je prázdny.", ukazka: [] };

  // Hlavička je prvý riadok, ktorý obsahuje dátum aj sumu — Fio pred ňou
  // vypisuje blok s číslom účtu a obdobím, ktorý s pohybmi nesúvisí.
  const iHlavicka = riadky.findIndex((l) => {
    const low = l.toLowerCase();
    return low.includes("datum") && (low.includes("objem") || low.includes("částka") || low.includes("castka") || low.includes("suma"));
  });
  // Bez hlavičky to nie je CSV — skús textovú podobu z internetbankingu.
  if (iHlavicka < 0) return parseFioText(text, pravidla);

  const sep = oddelovac(riadky[iHlavicka]);
  const hlavicka = rozdel(riadky[iHlavicka], sep);
  const najdi = (...mena: string[]) =>
    hlavicka.findIndex((h) => mena.some((m) => h.toLowerCase().includes(m)));

  const iDatum = najdi("datum");
  const iSuma = najdi("objem", "částka", "castka", "suma");
  // V skutočnom exporte je „Protiúčet" iba ČÍSLO účtu — meno protistrany
  // v ňom nie je. Meno je v poznámke: pri karte ako „Nákup: METRICOOL.COM, …",
  // pri príchodzej platbe ako „EVA DOLEŽALOVÁ". Preto sa protistrana neberie
  // zo stĺpca, ale vyťahuje sa z textu.
  const iProti = najdi("protiúčet", "protiucet");
  const iSprava = najdi("zpráva pro příjemce", "zprava pro prijemce");
  const iPozn = najdi("poznámka", "poznamka");
  const iTyp = najdi("typ");
  const iVs = najdi("vs", "variabilní", "variabilni");

  if (iDatum < 0 || iSuma < 0) {
    return { ok: false, chyba: "Hlavičku som našiel, ale nie stĺpce s dátumom a sumou.", ukazka: [riadky[iHlavicka]] };
  }

  const out: FioRiadok[] = [];
  for (const r of riadky.slice(iHlavicka + 1)) {
    const c = rozdel(r, sep);
    const datum = fioDatum(c[iDatum] || "");
    const suma = fioSuma(c[iSuma] || "");
    if (!datum || !suma) continue;
    const sprava = iSprava >= 0 ? c[iSprava] || "" : "";
    const pozn = iPozn >= 0 ? c[iPozn] || "" : "";
    // Zpráva a Poznámka bývajú identické — zdvojený text nič nepridá.
    const popis = [sprava, pozn === sprava ? "" : pozn, iVs >= 0 ? c[iVs] : ""].filter(Boolean).join(" · ");
    const typ = (iTyp >= 0 ? c[iTyp] : "") || "";
    const protistrana = protistranaZPopisu(popis) || (iProti >= 0 ? c[iProti] : "") || "";
    out.push({
      datum, suma, protistrana, poznamka: popis.slice(0, 200), typ,
      kategoria: suma < 0 ? odhadniKategoriu(`${protistrana} ${popis} ${typ}`, pravidla) : "",
    });
  }

  // Text z internetbankingu má tiež slová „Datum" a „Částka" v jednom riadku,
  // takže sem spadne — ale rozdeliť sa nedá, lebo stĺpce neexistujú. Vtedy to
  // nie je chyba súboru, len zle uhádnutý režim.
  if (!out.length) return parseFioText(text, pravidla);
  return { ok: true, riadky: out, hlavicka };
}


// ── Textová podoba z internetbankingu ────────────────────────────────────────
// Nemá hlavičku ani stĺpce; pri kopírovaní z PDF sa navyše riadky zalamujú
// uprostred vety a popis sa opakuje dvakrát. Jediná spoľahlivá kotva je dvojica
// DÁTUM + SUMA + "CZK"; všetko medzi dvoma takými kotvami je popis jedného
// pohybu. Vyzerá to hrubo, ale na skutočnom júnovom výpise to našlo všetkých
// 73 pohybov a súčet sedel.
const POHYB = /(\d{1,2}\.\d{1,2}\.\d{4})\s*(-?[\d\s\u00a0\u202f]+,\d{2})\s*CZK/g;


function parseFioText(text: string, pravidla: { vzor: string; kategoria: string }[]): FioParse {
  const kotvy = [...text.matchAll(POHYB)];
  if (!kotvy.length) {
    return {
      ok: false,
      chyba: "Nenašiel som ani hlavičku CSV, ani riadky v tvare 30.06.2026 -604,12 CZK. Skús export Výpis pohybů v CSV alebo skopíruj pohyby z internetbankingu.",
      ukazka: text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6),
    };
  }

  const out: FioRiadok[] = [];
  for (let i = 0; i < kotvy.length; i++) {
    const k = kotvy[i];
    const koniec = i + 1 < kotvy.length ? kotvy[i + 1].index ?? text.length : text.length;
    let popis = text.slice((k.index ?? 0) + k[0].length, koniec);
    // Meno vlastného účtu je v každom riadku a nič nehovorí.
    popis = popis.replace(/ProSapiens\s*Biomechanic\s*\([^)]*\)/gi, " ");
    popis = popis.replace(/\s+/g, " ").trim();
    // Popis je v exporte zdvojený ("Zpráva pro příjemce" = "Poznámka").
    const pol = Math.floor(popis.length / 2);
    if (popis.length > 24 && popis.slice(0, pol).trim() === popis.slice(pol).trim()) popis = popis.slice(0, pol).trim();

    const datum = fioDatum(k[1]);
    const suma = fioSuma(k[2]);
    if (!datum || !suma) continue;
    const protistrana = protistranaZPopisu(popis);
    out.push({
      datum, suma, protistrana,
      poznamka: popis.slice(0, 200),
      typ: "",
      kategoria: suma < 0 ? odhadniKategoriu(`${protistrana} ${popis}`, pravidla) : "",
    });
  }
  if (!out.length) return { ok: false, chyba: "Kotvy som našiel, ale nedal sa z nich prečítať dátum ani suma.", ukazka: [] };
  return { ok: true, riadky: out, hlavicka: ["textový výpis z internetbankingu"] };
}
