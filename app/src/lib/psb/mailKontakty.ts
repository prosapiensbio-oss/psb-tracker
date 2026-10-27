import { rozdelRiadok } from "./kontaktyIdokladu";

/**
 * CSV EXPORT Z MAILERLITE → `mail_odberatelia`.
 *
 * Jerry, 27. 10. 2026: „vedel by si to niekde do Kokpitu uložiť a pripraviť
 * stavbu maileru niekedy v budúcnosti?" MailerLite stojí 515 Kč mesačne za
 * zoznam, ktorému sa nepíše; po zrušení predplatného by tie kontakty žili len
 * v troch CSV v Downloads — a to je presne ten druh dát, ktorý sa stratí pri
 * prvej výmene notebooku.
 *
 * ODBERATELIA UŽ V KOKPITE SÚ. `mail_odberatelia` ich má od 13. 8. 2026 zo
 * sťahu cez API MailerLite — druhá tabuľka na to isté by bola presne tá
 * chyba, pred ktorou varuje „jedna definícia na jednom mieste". Tento modul
 * preto číta CSV export a dopĺňa ním TÚ ISTÚ tabuľku: čerstvý stav plus to,
 * čo sťah cez API nenosil (dátum a dôvod odhlásenia, telefón, firma, krajina
 * a správanie konkrétneho človeka).
 *
 * ČO SA MUSÍ PRENIESŤ A PREČO
 *
 * Nestačí zoznam adries. Odhlásení (43) sú v tomto najdôležitejší riadok:
 * komu sa písať NESMIE, sa po zrušení MailerLite nedá zistiť odnikiaľ inde —
 * a poslať mail človeku, ktorý sa odhlásil, je porušenie jeho rozhodnutia aj
 * zákona. Preto sa importujú všetky tri exporty a stav sa skladá z nich:
 * kto je v „aktívnych", je aktívny; kto v „odhlásených", je odhlásený; kto je
 * len v „všetci", je nedoručiteľný (v exporte z 27. 10. 2026 to bolo 12
 * bouncov, sťažností a nepotvrdených bolo nula).
 */

/** Slovník MailerLite — `mail_odberatelia.status` ho nesie od prvého sťahu. */
export type StavKontaktu = "active" | "unsubscribed" | "bounced";

export type MailKontakt = {
  /** Kľúč riadku — malými písmenami, orezaný. */
  email: string;
  meno: string;
  priezvisko: string;
  firma: string;
  telefon: string;
  stav: StavKontaktu;
  /** Skupiny z MailerLite = lead magnety a klientske skupiny. */
  skupiny: string[];
  /** Deň prihlásenia (RRRR-MM-DD), prázdny keď ho export nemá. */
  prihlasenyAt: string;
  odhlasenyAt: string;
  dovod: string;
  odoslanych: number;
  otvoreni: number;
  klikov: number;
  krajina: string;
};

const cislo = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** „2025-09-03 20:19:04" → „2025-09-03"; čokoľvek iné → prázdno. */
const den = (v: string | undefined) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? "").trim());
  return m ? m[1] : "";
};

/**
 * Jeden export z MailerLite. Hlavička sa číta podľa NÁZVOV stĺpcov, nie podľa
 * poradia: čo je v súbore, určuje „Set columns" v ich tabuľke, takže ten istý
 * export má pri druhom stiahnutí iné poradie aj iný počet stĺpcov.
 */
export function riadkyExportu(csv: string): Record<string, string>[] {
  const riadky = String(csv || "").split(/\r?\n/).filter((r) => r.trim());
  if (riadky.length < 2) return [];
  const hlavicka = rozdelRiadok(riadky[0].replace(/^﻿/, "")).map((h) => h.toLowerCase());
  const von: Record<string, string>[] = [];
  for (const r of riadky.slice(1)) {
    const kusy = rozdelRiadok(r);
    const o: Record<string, string> = {};
    hlavicka.forEach((h, i) => { o[h] = kusy[i] ?? ""; });
    von.push(o);
  }
  return von;
}

function zRiadku(o: Record<string, string>, stav: StavKontaktu): MailKontakt | null {
  const email = String(o.subscriber || o.email || "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  return {
    email,
    meno: (o.name || "").trim(),
    priezvisko: (o["last name"] || "").trim(),
    firma: (o.company || "").trim(),
    telefon: (o.phone || "").trim(),
    stav,
    skupiny: (o.groups || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean),
    prihlasenyAt: den(o.subscribed),
    odhlasenyAt: den(o["unsubscribed at"]),
    dovod: (o["unsubscribe reason"] || "").trim(),
    odoslanych: cislo(o.sent),
    otvoreni: cislo(o.opens),
    klikov: cislo(o.clicks),
    krajina: (o.location || "").trim(),
  };
}

/**
 * Tri exporty → jeden zoznam so stavom.
 *
 * Poradie je zámer: základ je „všetci" (tam sú aj bounce), cez neho sa
 * prekryjú aktívni a nakoniec odhlásení. Odhlásenie prebíja všetko — keby sa
 * ten istý človek objavil v oboch súboroch, mlčanie je vždy bezpečnejšie než
 * mail navyše.
 */
export function kontaktyZExportu(subory: {
  vsetci?: string;
  aktivni?: string;
  odhlaseni?: string;
}): MailKontakt[] {
  const podla = new Map<string, MailKontakt>();
  const nalej = (csv: string | undefined, stav: StavKontaktu, prebijaj: boolean) => {
    for (const o of riadkyExportu(csv || "")) {
      const k = zRiadku(o, stav);
      if (!k) continue;
      const uz = podla.get(k.email);
      if (!uz) { podla.set(k.email, k); continue; }
      // Novší súbor dopĺňa prázdne polia; stav prepisuje len ten, čo prebíja.
      podla.set(k.email, {
        ...uz,
        meno: uz.meno || k.meno,
        priezvisko: uz.priezvisko || k.priezvisko,
        firma: uz.firma || k.firma,
        telefon: uz.telefon || k.telefon,
        skupiny: uz.skupiny.length ? uz.skupiny : k.skupiny,
        prihlasenyAt: uz.prihlasenyAt || k.prihlasenyAt,
        odhlasenyAt: k.odhlasenyAt || uz.odhlasenyAt,
        dovod: k.dovod || uz.dovod,
        odoslanych: Math.max(uz.odoslanych, k.odoslanych),
        otvoreni: Math.max(uz.otvoreni, k.otvoreni),
        klikov: Math.max(uz.klikov, k.klikov),
        krajina: uz.krajina || k.krajina,
        stav: prebijaj ? stav : uz.stav,
      });
    }
  };
  nalej(subory.vsetci, "bounced", true);
  nalej(subory.aktivni, "active", true);
  nalej(subory.odhlaseni, "unsubscribed", true);
  return [...podla.values()].sort((a, b) => a.email.localeCompare(b.email));
}

/** Zhrnutie pre obrazovku aj pre Jarvisa — jedno miesto, nie dve kópie. */
export function suhrnKontaktov(k: MailKontakt[]): {
  spolu: number; aktivni: number; odhlaseni: number; nedorucitelni: number;
  sMenom: number; otvoriliAsponRaz: number;
  skupiny: { nazov: string; pocet: number }[];
  odkedy: string; dokedy: string;
} {
  const poc = (s: StavKontaktu) => k.filter((x) => x.stav === s).length;
  const skupiny = new Map<string, number>();
  for (const x of k) for (const s of x.skupiny) skupiny.set(s, (skupiny.get(s) || 0) + 1);
  const dni = k.map((x) => x.prihlasenyAt).filter(Boolean).sort();
  return {
    spolu: k.length,
    aktivni: poc("active"),
    odhlaseni: poc("unsubscribed"),
    nedorucitelni: poc("bounced"),
    sMenom: k.filter((x) => x.meno).length,
    otvoriliAsponRaz: k.filter((x) => x.otvoreni > 0).length,
    skupiny: [...skupiny.entries()].map(([nazov, pocet]) => ({ nazov, pocet }))
      .sort((a, b) => b.pocet - a.pocet || a.nazov.localeCompare(b.nazov)),
    odkedy: dni[0] || "",
    dokedy: dni[dni.length - 1] || "",
  };
}
