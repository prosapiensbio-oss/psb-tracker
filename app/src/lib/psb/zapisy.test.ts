import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Čo sa dá UPRAVIŤ, musí sa dať aj ZALOŽIŤ.
 *
 * PREČO TENTO TEST EXISTUJE
 *
 * 24. 8. 2026 som štyrikrát za jeden deň pridal stĺpec do UPDATE a zabudol ho
 * v INSERT: hotovy_text, zaber, dvojica scenar + sekvencia, a poznamka.
 * Zakaždým to dopadlo rovnako — obrazovka hodnotu poslala, SQLite ju ticho
 * zahodila (chýbajúci stĺpec v INSERTe nie je chyba) a appka ohlásila
 * „uložené" nad stratou. Testy boli zelené, TypeScript spokojný, a našlo sa to
 * len tým, že som si to zakaždým overil v databáze.
 *
 * Toto je jediný druh chyby z celého dňa, ktorý sa dá zachytiť staticky:
 * porovnať zoznamy stĺpcov v tom istom súbore.
 *
 * KEĎ TEST SPADNE
 *
 * Buď stĺpec do INSERTu dopíš (obvyklý prípad), alebo ho pridaj do VYNIMKY
 * aj s dôvodom. Nič netreba obchádzať potichu — zoznam výnimiek je krátky
 * a každá v ňom má vetu, prečo tam patrí.
 */

/** Stĺpce, ktoré sa zámerne zapisujú až neskôr, nie pri vzniku riadku. */
const VYNIMKY: Record<string, Record<string, string>> = {
  // Karta Email: nový mail ešte nikto neprečítal, nevybavil ani neodpísal — stav práce vzniká až klikom.
  email_spravy: {
    precitane_at: "prečítanie človekom, nie načítanie zo schránky", vybavene_at: "vybavenie človekom, nie načítanie zo schránky",
    vybavil: "kto mail vybavil — pri načítaní zo schránky ešte nikto", odpovedane_at: "odpoveď z karty, nie načítanie zo schránky",
  },
  // Zmluvu zakladá tréner; klientova polovica sa zapíše až podpisom (podpisKlienta).
  zmluvy: {
    klient_meno: "podpis klienta vzniká až na stránke /z/, pri založení zmluvy ho ešte nikto nemá", klient_podpis: "podpis klienta vzniká až na stránke /z/, pri založení zmluvy ho ešte nikto nemá", klient_suhlasy_json: "podpis klienta vzniká až na stránke /z/, pri založení zmluvy ho ešte nikto nemá", klient_at: "podpis klienta vzniká až na stránke /z/, pri založení zmluvy ho ešte nikto nemá",
    klient_ip: "podpis klienta vzniká až na stránke /z/, pri založení zmluvy ho ešte nikto nemá", klient_ua: "podpis klienta vzniká až na stránke /z/, pri založení zmluvy ho ešte nikto nemá", odtlacok: "podpis klienta vzniká až na stránke /z/, pri založení zmluvy ho ešte nikto nemá",
    otvorene_at: "prvé otvorenie odkazu klientom, nie založenie",
    zrusene_at: "zrušenie nepodpísanej zmluvy, nie založenie",
  },
  // Mailer: rozpísaný mail ešte nemá skúšku ani odoslanie; nový kontakt ešte
  // nedostal žiadny mail. Prázdna hodnota a nula z migrácie sú správny začiatok.
  mail_vydania: {
    skuska_at: "rozpísaný mail ešte nemá skúšku; zapisuje sa až po skúšobnom maile",
    odoslane_at: "rozpísaný mail ešte neodišiel; zapisuje sa až po kliknutí na odoslanie",
  },
  mail_odberatelia: { odoslanych: "nový kontakt ešte nedostal žiadny mail, nula z migrácie je správny začiatok" },
  faktura_polozky: {
    potvrdene_at: "potvrdenie kategórie v uzávierke — pri importe faktúry je len návrh",
    potvrdil: "kto potvrdil — zapisuje sa spolu s potvrdene_at, nie pri importe",
  },
  klient_odkazy: {
    balickov: "rozsah histórie má v stĺpci predvolenú 1; mení sa až voľbou v Kokpite",
  },
  report_akcie: {
    stav: "návrh akcie vzniká bez odpovede — stav prichádza až s rozhodnutím človeka",
    stav_at: "kedy padlo rozhodnutie o návrhu — pri založení ešte nepadlo",
    kto: "kto rozhodol o návrhu — pri založení ešte nikto nerozhodol",
  },
  kal_zdroje: {
    posledne_ok: "výsledok sťahovania — pri pripojení kalendára sa ešte nesťahoval",
    posledna_chyba: "výsledok sťahovania — pri pripojení kalendára sa ešte nesťahoval",
  },
  strizna_nahrate: {
    nahrate_kedy: "video vzniká ako rozpracované; čas sa zapíše až po dokončení nahrávania",
    stiahnute_kedy: "čas stiahnutia do Strižne — pri začatí nahrávania ešte nenastal",
  },
  dotaznik_odkazy: {
    pouzity: "odkaz vzniká nepoužitý (predvolená 0); označí ho až odoslanie dotazníka",
  },
  fio_transactions: {
    potvrdene_at: "potvrdenie výdavku v uzávierke — pri importe je kategória len návrh",
    potvrdil: "kto potvrdil — zapisuje sa spolu s potvrdene_at",
    moja_poznamka: "vlastná poznámka sa píše až po importe, výpis z banky ju nemá",
  },
  // Nové konto začína na DEFAULT 0 a stĺpec môže chýbať, kým nebeží migrácia 0129.
  users: {
    session_ver: "odhlásenie všade — nové konto ešte nikto neodhlasoval",
  },
  ponuky_terminov: {
    zrusene_at: "mäkké zrušenie — nová ponuka zrušená nevzniká",
  },
  klient_kalendar: {
    zrusene_at: "zneplatnenie odkazu — nový odkaz zneplatnený nevzniká",
  },
  fotky_odkazy: {
    zrusene_at: "zrušenie odkazu s fotkami — nový odkaz zrušený nevzniká",
  },
  jarvis_dokumenty: {
    zmazane_at: "mäkké mazanie — pri vzniku dokument zmazaný nie je",
  },
  // Platba je záznam v knihe: zrušiť sa dá, zmazať nie. Nová platba sa ale
  // nikdy nezakladá ako zrušená, takže do INSERTu ten stĺpec nepatrí.
  platby: {
    zrusene_at: "mäkké zrušenie — nová platba zrušená nevzniká",
  },
  // Balíček sa ruší mäkko (krok späť, doplnenie, ktoré posunie automatický
  // balíček). Nový balíček zrušený nevzniká.
  balicky: {
    zrusene_at: "mäkké zrušenie — nový balíček zrušený nevzniká",
  },
  // Odber vzniká v prehliadači; ako mu potom chodia správy, sa zisťuje až
  // pri prvom odoslaní. Predvyplniť to pri zápise by znamenalo tvrdiť niečo,
  // čo sa ešte nestalo.
  push_odbery: {
    posledne_ok: "posledné úspešné doručenie — pri prihlásení ešte žiadne nebolo",
    chyba: "chyba doručenia — vzniká až pri neúspešnom odoslaní",
  },
  // Faktúra vzniká ako vystavená a nezaplatená. Všetko ostatné sa k nej
  // dopisuje až podľa toho, čo sa s ňou naozaj stalo.
  vydane_faktury: {
    storno_at: "faktúra sa vystavuje platná; stornuje sa až neskôr",
    storno_dovod: "dôvod storna; pri vystavení faktúry žiadny dôvod neexistuje",
    odoslane_at: "kedy doklad odišiel klientovi — pri vystavení ešte neodišiel",
    odoslane_komu: "adresa, na ktorú doklad odišiel — dtto",
    uhradene_at: "deň úhrady; nová faktúra zaplatená nie je",
    platba_id: "platba, ktorá ju uhradila — existuje až keď peniaze prídu",
  },
  // Kontakt sa importuje ako nespárovaný; „nie je klient" povie človek až
  // pri prezeraní.
  fakturacne_kontakty: {
    odlozene_at: "označenie, že kontakt ku klientovi nepatrí — pri importe sa nevie",
  },
  jarvis_zavery: {
    vysledok: "vyhodnotenie záveru prichádza až po termíne overenia",
  },
  ig_prispevky: {
    faza: "príspevky zakladá import z Instagramu; fázu priraďuje človek neskôr",
  },
  mkt_napady: {
    pouzite_at: "deň použitia sa zapisuje pri prechode na „použitý“, nie pri vzniku",
    odkaz: "adresa hotového príspevku existuje až keď obsah vyjde",
  },
  // Dvojfázový zápis: sitemap založí riadok s adresou, obsah stránky sa
  // dopĺňa až pri jej načítaní. Do INSERTu tieto stĺpce nepatria — v tej
  // chvíli sa stránka ešte nečítala a prázdny text by sa nedal odlíšiť od
  // stránky, ktorá je naozaj prázdna.
  web_stranky: {
    h1: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    meta_popis: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    nacitane_at: "kedy sa stránka čítala — pri založení sa ešte nečítala",
    text: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    titulok: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    znakov: "dĺžka textu vzniká až s textom samotným",
  },
};

/**
 * SQL žije v reťazcoch — mimo nich by sa chytal bežný JavaScript.
 *
 * Skutočný prechod znakmi, nie regulárny výraz: slovenské úvodzovky v komentári
 * („takto") končia ASCII `"` a regulárny výraz od nej čítal zvyšok súboru
 * posunutý, takže test o stĺpcoch rozhodoval náhodne podľa komentárov.
 * Vnútro `${...}` v šablóne sa berie ako text, čo na zoznamy stĺpcov stačí.
 */
function retazce(zdroj: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = zdroj.length;
  while (i < n) {
    const c = zdroj[i];
    if (c === "/" && zdroj[i + 1] === "/") { i = zdroj.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && zdroj[i + 1] === "*") { i = zdroj.indexOf("*/", i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && zdroj[j] !== c) {
        if (zdroj[j] === "\\") j++;
        // Obyčajný reťazec sa nelomí; nájdený koniec riadku = apostrof v texte JSX, nie reťazec.
        else if (c !== "`" && zdroj[j] === "\n") break;
        j++;
      }
      if (j < n && zdroj[j] === c) { out.push(zdroj.slice(i + 1, j)); i = j + 1; continue; }
      i++;
      continue;
    }
    i++;
  }
  return out;
}

function zapisyVSubore(zdroj: string) {
  const ins = new Set<string>();
  const upd = new Set<string>();
  for (const lit of retazce(zdroj)) {
    if (!/\b(INSERT|UPDATE)\b/i.test(lit)) continue;
    for (const m of lit.matchAll(/INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+(\w+)\s*\(([^)]*)\)/gis)) {
      for (const c of m[2].split(",")) {
        const s = c.trim().replace(/[`"]/g, "");
        if (/^\w+$/.test(s)) ins.add(`${m[1]}.${s}`);
      }
    }
    for (const m of lit.matchAll(/UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:\bWHERE\b|$)/gi)) {
      for (const c of m[2].matchAll(/(?:^|,)\s*(\w+)\s*=/g)) {
        if (!/^(case|when|then|else|end)$/i.test(c[1])) upd.add(`${m[1]}.${c[1]}`);
      }
    }
  }
  return { ins, upd };
}

function subory(): { meno: string; zdroj: string }[] {
  const out: { meno: string; zdroj: string }[] = [];
  const apiDir = join(import.meta.dir, "../../routes/api");
  for (const f of readdirSync(apiDir)) {
    if (f.endsWith(".ts")) out.push({ meno: `api/${f}`, zdroj: readFileSync(join(apiDir, f), "utf8") });
  }
  // Serverové pomocníky (lib/psb/*.server.ts) — db.server.ts bol jediný, ale
  // zápisy žijú aj v ostatných (faktúry, platby, kalendár…).
  for (const f of readdirSync(import.meta.dir)) {
    if (f.endsWith(".server.ts")) out.push({ meno: f, zdroj: readFileSync(join(import.meta.dir, f), "utf8") });
  }
  // Verejné stránky klienta: tu sa píše bez prihlásenia a chyba sa nemá komu ohlásiť.
  const routesDir = join(import.meta.dir, "../../routes");
  for (const t of ["u", "v", "a", "f", "t", "d", "k", "m"]) {
    const f = `${t}.$token.tsx`;
    out.push({ meno: `routes/${f}`, zdroj: readFileSync(join(routesDir, f), "utf8") });
  }
  return out;
}

describe("čo sa dá upraviť, musí sa dať aj založiť", () => {
  const vsetky = subory();

  it("číta aj serverové pomocníky a verejné stránky — zoznam sa nesmie potichu zúžiť", () => {
    const mena = vsetky.map((s) => s.meno);
    expect(mena).toContain("db.server.ts");
    expect(mena).toContain("routes/t.$token.tsx");
    expect(mena.filter((m) => m.endsWith(".server.ts")).length).toBeGreaterThan(5);
    expect(retazce(`// „x"\nconst a = "INSERT"; /* „y" */ const b = 'c';`)).toEqual(["INSERT", "c"]);
  });

  it("nájde vôbec nejaké zápisy — inak by test bol zelený omylom", () => {
    const spolu = vsetky.reduce((n, s) => n + zapisyVSubore(s.zdroj).ins.size, 0);
    expect(spolu).toBeGreaterThan(30);
  });

  for (const { meno, zdroj } of vsetky) {
    const { ins, upd } = zapisyVSubore(zdroj);
    const tabulky = new Set([...ins].map((x) => x.split(".")[0]));
    const chybajuce = [...upd].filter((x) => {
      const [tab, stlpec] = x.split(".");
      if (!tabulky.has(tab)) return false;      // súbor tabuľku nezakladá, len upravuje
      if (ins.has(x)) return false;
      return VYNIMKY[tab]?.[stlpec] === undefined;
    });

    it(`${meno}: každý upraviteľný stĺpec je aj v INSERT`, () => {
      expect({ subor: meno, chybaVInsert: chybajuce.sort() })
        .toEqual({ subor: meno, chybaVInsert: [] });
    });
  }

  it("zoznam výnimiek nezhnije — každá má dôvod", () => {
    const bezDovodu: string[] = [];
    for (const [tab, stlpce] of Object.entries(VYNIMKY)) {
      for (const [stlpec, dovod] of Object.entries(stlpce)) {
        // Krátky text nie je dôvod. „to isté" tento test raz sám zachytil —
        // presne preto, aby zoznam výnimiek nezhnil na zoznam kódov.
        if (dovod.trim().length < 25) bezDovodu.push(`${tab}.${stlpec}`);
      }
    }
    expect(bezDovodu).toEqual([]);
  });
});
