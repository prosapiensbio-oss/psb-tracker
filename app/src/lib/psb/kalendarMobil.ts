import { prahaNaUtcIcs } from "./ponukaTerminov";

/**
 * KALENDÁR V MOBILE — čisté časti (Jerry, 7. 10. 2026, náčrt A1 + B1).
 *
 * Klient NEODOBERÁ kalendár trénera. Kokpit mu poskladá vlastný kalendár
 * len z udalostí s jeho menom (`feedKlienta`); trénerov Google kalendár
 * zostáva súkromný a jeho zdieľanie sa nemení. Jerry sa pýtal presne na to:
 * „uvidí všetky moje udalosti, alebo len tie svoje?" — len svoje.
 *
 * V udalosti je len to, čo klientovi patrí: tréning, s kým, ako sa ozvať.
 * Žiadne hodiny ani peniaze (kalendár sa obnovuje sám a číslo by o deň
 * neplatilo), žiadne iné mená.
 */

export type UdalostFeedu = { uid: string; trener: string; zaciatok: string; koniec: string | null };

/** Riadok .ics dlhší než 75 bajtov sa podľa normy láme (pokračovanie začína medzerou). */
export function zalom(riadok: string): string {
  const enc = new TextEncoder();
  if (enc.encode(riadok).length <= 75) return riadok;
  const kusy: string[] = [];
  let akt = "";
  let dlzka = 0;
  for (const znak of riadok) {
    const n = enc.encode(znak).length;
    const strop = kusy.length ? 74 : 75; // pokračovanie má na začiatku medzeru
    if (dlzka + n > strop) { kusy.push(akt); akt = ""; dlzka = 0; }
    akt += znak;
    dlzka += n;
  }
  kusy.push(akt);
  return kusy.join("\r\n ");
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
const uidUdalosti = (uid: string) => `${uid.replace(/[^A-Za-z0-9]/g, "").slice(0, 120)}@kalendar.prosapiens.cz`;

export function feedKlienta(
  udalosti: UdalostFeedu[],
  trener: (t: string) => { krstne: string; telefon: string },
  teraz = new Date(),
): string {
  const stamp = teraz.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const riadky = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ProSapiens Biomechanic//Kokpit//CS", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:ProSapiens", "X-WR-TIMEZONE:Europe/Prague",
    // Telefónu sa povie, ako často sa má pýtať — iPhone to berie ako návrh.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const u of [...udalosti].sort((a, b) => a.zaciatok.localeCompare(b.zaciatok))) {
    const t = trener(u.trener);
    const koniec = u.koniec || `${u.zaciatok.slice(0, 11)}${String(Math.min(23, Number(u.zaciatok.slice(11, 13)) + 1)).padStart(2, "0")}${u.zaciatok.slice(13, 16)}`;
    riadky.push(
      "BEGIN:VEVENT",
      `UID:${uidUdalosti(u.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${prahaNaUtcIcs(u.zaciatok)}`,
      `DTEND:${prahaNaUtcIcs(koniec)}`,
      "SUMMARY:Trénink ProSapiens",
      `DESCRIPTION:${esc(`Trénink s ${u.trener === "Terezka" ? "Terezkou" : "Filipem"}. Změna termínu? Napište: ${t.telefon}. Termín se upravuje u nás — změny se vám objeví samy.`)}`,
      "LOCATION:ProSapiens Biomechanic",
      // Pripomienky: deň vopred a dve hodiny pred tréningom.
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Zítra trénink ProSapiens", "TRIGGER:-P1D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Trénink ProSapiens za 2 hodiny", "TRIGGER:-PT2H", "END:VALARM",
      "END:VEVENT",
    );
  }
  riadky.push("END:VCALENDAR", "");
  return riadky.map(zalom).join("\r\n");
}

/** Čím si kalendár sťahuje — z hlavičky User-Agent (len na prehľad v profile). */
export function platformaZAgenta(ua: string): string {
  const u = ua || "";
  if (/Google-Calendar-Importer|Google/i.test(u)) return "Google Kalendár";
  if (/iPhone|iPad|iOS|dataaccessd/i.test(u)) return "iPhone";
  if (/Macintosh|Mac OS X|CalendarAgent/i.test(u)) return "Mac";
  if (/Android/i.test(u)) return "Android";
  if (/Microsoft|Outlook/i.test(u)) return "Outlook";
  return "iný";
}

/**
 * Odoberá? Telefón sa ozýva sám (iPhone po hodinách, Google Kalendár raz
 * za pol dňa až deň). Kto sa neozval tri dni, už pravdepodobne neodoberá.
 */
export const odoberaKalendar = (posledne: string | null | undefined, teraz = Date.now()) =>
  !!posledne && teraz - Date.parse(posledne) < 3 * 86400000;
