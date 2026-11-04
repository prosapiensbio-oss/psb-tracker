/**
 * KOMU SA SMIE NAPÍSAŤ — skupiny pre Mailer (Jerry, 4. 11. 2026).
 *
 * Skupiny sa počítajú samy z toho, čo sa naozaj stalo. Žiadne „Klienti sep.25",
 * ktoré o rok klamú. Čistá funkcia bez databázy: obrazovka aj odoslanie volajú
 * to isté, takže číslo na tlačidle je počet ľudí, ktorí mail naozaj dostanú.
 *
 * PRÁVNY ZÁKLAD (zákon 480/2004 Sb., § 7):
 *  • vlastný zákazník: smie sa, kým sám neodmietol. Nezaškrtnutý newsletter
 *    v anamnéze sa berie ako odmietnutie (Jerry, 4. 11. 2026);
 *  • starý zoznam z MailerLite: prihlásili sa, stav `active`;
 *  • nové kontakty z webu: LEN so zaškrtnutým políčkom a potvrdením v maili.
 *    Stiahnutý dokument ani test postury samy osebe súhlas nie sú.
 */

export type SkupinaId =
  | "trenuje" | "pauza" | "len_uvodny" | "skoncil"
  | "newsletter_web" | "dokument_2025" | "dokument_novy" | "test_postury" | "dopyt";

export type Prekazka =
  | "odhlaseny" | "nedorucitelny" | "anamneza_nie" | "bez_suhlasu" | "caka_potvrdenie" | "nedavno" | "bez_mailu";

export const NAZVY_PREKAZOK: Record<Prekazka, string> = {
  odhlaseny: "odhlásil sa",
  nedorucitelny: "adresa nefunguje",
  anamneza_nie: "v anamnéze nezaškrtol newsletter",
  bez_suhlasu: "nedal súhlas",
  caka_potvrdenie: "ešte nepotvrdil v maili",
  nedavno: "dostal mail v posledných 14 dňoch",
  bez_mailu: "nemáme mail",
};

export const SKUPINY: { id: SkupinaId; nazov: string; popis: string; dovodVMaili: string }[] = [
  { id: "trenuje", nazov: "Trénuje teraz", popis: "Aktívni a sporadickí klienti.", dovodVMaili: "kvůli tréninku u nás" },
  { id: "pauza", nazov: "Má pauzu", popis: "Klienti označení ako pauza.", dovodVMaili: "kvůli tréninku u nás" },
  { id: "len_uvodny", nazov: "Bol len na jednom tréningu", popis: "Prišiel raz alebo len na úvodný a ďalej nepokračoval.", dovodVMaili: "kvůli úvodnímu tréninku u nás" },
  { id: "skoncil", nazov: "Skončil po viacerých tréningoch", popis: "Chodil pravidelnejšie a dnes už nechodí.", dovodVMaili: "kvůli tréninku u nás" },
  { id: "newsletter_web", nazov: "Prihlásený z webu", popis: "Zaškrtol newsletter a potvrdil ho v maili.", dovodVMaili: "kvůli přihlášení k odběru na našem webu" },
  { id: "dokument_2025", nazov: "Stiahol si dokument do roku 2025", popis: "Starý zoznam z MailerLite, nie sú klienti.", dovodVMaili: "kvůli staženému dokumentu z našeho webu" },
  { id: "dokument_novy", nazov: "Dokument od 9/2026", popis: "Stiahli si dokument bez súhlasu, písať sa im nesmie.", dovodVMaili: "" },
  { id: "test_postury", nazov: "Spravil test postury", popis: "Bez zaškrtnutého súhlasu sa im písať nesmie.", dovodVMaili: "" },
  { id: "dopyt", nazov: "Pýtal sa, ale neprišiel", popis: "Formulár slúžil na odpoveď, nie na newsletter.", dovodVMaili: "" },
];

export type KlientVstup = {
  name: string;
  status: string;
  sessions: { sessionType?: string; date?: string }[];
};
export type OdberatelVstup = {
  email: string; meno?: string; status?: string; klient?: string | null;
  skupiny?: string; suhlas_at?: string; potvrdene_at?: string;
};
export type FakturaciaVstup = { klient: string; email?: string | null };
export type LeadVstup = { email?: string | null; name?: string | null; druh?: string | null; note?: string | null; status?: string | null };
export type AnamnezaVstup = { klient: string; suhlasy_json?: string | null };
export type NedavnyVstup = { email: string; odoslane_at: string };

export type Adresat = { email: string; meno: string; klient: string | null; skupina: SkupinaId };
export type Vynechany = { email: string; meno: string; prekazka: Prekazka };
export type Skupina = {
  id: SkupinaId; nazov: string; popis: string; dovodVMaili: string;
  vsetkych: number; adresati: Adresat[]; vynechani: Vynechany[];
};

/** Brzda: nikto nedostane dva hromadné maily do 14 dní. */
export const BRZDA_DNI = 14;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const cistyMail = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const platnyMail = (v: unknown) => EMAIL.test(cistyMail(v));
const klucMena = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const jeLenUvodny = (k: KlientVstup) =>
  k.sessions.length <= 1 || k.sessions.every((s) => s.sessionType === "UVODNE");

export function skupinaKlienta(k: KlientVstup): SkupinaId {
  if (k.status === "Aktívny" || k.status === "Sporadický") return "trenuje";
  if (k.status === "Pauza") return "pauza";
  return jeLenUvodny(k) ? "len_uvodny" : "skoncil";
}

export function spocitajSkupiny(vstup: {
  klienti: KlientVstup[];
  odberatelia: OdberatelVstup[];
  fakturacia: FakturaciaVstup[];
  leady: LeadVstup[];
  anamnezy: AnamnezaVstup[];
  nedavne: NedavnyVstup[];
  teraz: Date;
}): Skupina[] {
  const { klienti, odberatelia, fakturacia, leady, anamnezy, nedavne, teraz } = vstup;

  const odberatelPodlaMailu = new Map<string, OdberatelVstup>();
  for (const o of odberatelia) {
    const m = cistyMail(o.email);
    if (m) odberatelPodlaMailu.set(m, o);
  }

  // Mail klienta: faktúra má prednosť, potom párovanie zo zoznamu, potom dopyt.
  const mailKlienta = new Map<string, string>();
  for (const f of fakturacia) if (platnyMail(f.email)) mailKlienta.set(klucMena(f.klient), cistyMail(f.email));
  for (const o of odberatelia) {
    const k = klucMena(o.klient);
    if (k && platnyMail(o.email) && !mailKlienta.has(k)) mailKlienta.set(k, cistyMail(o.email));
  }
  for (const l of leady) {
    const k = klucMena(l.name);
    if (k && platnyMail(l.email) && !mailKlienta.has(k)) mailKlienta.set(k, cistyMail(l.email));
  }

  const nechceAnamneza = new Set<string>();
  for (const a of anamnezy) {
    try {
      const s = JSON.parse(a.suhlasy_json || "{}") as { newsletter?: unknown };
      if ("newsletter" in s && !s.newsletter) nechceAnamneza.add(klucMena(a.klient));
    } catch { /* poškodený riadok nie je odmietnutie */ }
  }

  const hranica = teraz.getTime() - BRZDA_DNI * 86400000;
  const nedavno = new Set(
    nedavne.filter((n) => Date.parse(n.odoslane_at) >= hranica).map((n) => cistyMail(n.email)),
  );

  /** Stav zo zoznamu: čo platí bez ohľadu na skupinu. */
  const zakaz = (mail: string): Prekazka | null => {
    const s = odberatelPodlaMailu.get(mail)?.status;
    if (s === "unsubscribed") return "odhlaseny";
    if (s === "bounced" || s === "complained") return "nedorucitelny";
    return null;
  };

  const vysledok = new Map<SkupinaId, Skupina>(
    SKUPINY.map((s) => [s.id, { ...s, vsetkych: 0, adresati: [], vynechani: [] }]),
  );
  const pridane = new Set<string>(); // adresa ide len do prvej skupiny
  const pridaj = (id: SkupinaId, mail: string, meno: string, klient: string | null, prekazka: Prekazka | null) => {
    const sk = vysledok.get(id)!;
    sk.vsetkych++;
    const finalna = prekazka ?? (nedavno.has(mail) ? "nedavno" : null);
    if (finalna) sk.vynechani.push({ email: mail, meno, prekazka: finalna });
    else sk.adresati.push({ email: mail, meno, klient, skupina: id });
  };

  // 1) Klienti. Kto zdieľa mail (rodič a dieťa), dostane mail len raz.
  const mailyKlientov = new Set<string>();
  for (const k of klienti) {
    const id = skupinaKlienta(k);
    const mail = mailKlienta.get(klucMena(k.name));
    if (!mail) { pridaj(id, "", k.name, k.name, "bez_mailu"); continue; }
    mailyKlientov.add(mail);
    if (pridane.has(mail)) continue;
    pridane.add(mail);
    pridaj(id, mail, k.name, k.name, zakaz(mail) ?? (nechceAnamneza.has(klucMena(k.name)) ? "anamneza_nie" : null));
  }

  // 2) Prihlásení z webu a starý zoznam.
  for (const o of odberatelia) {
    const mail = cistyMail(o.email);
    if (!platnyMail(mail) || pridane.has(mail) || mailyKlientov.has(mail) || klucMena(o.klient)) continue;
    if (o.suhlas_at) {
      pridane.add(mail);
      const p: Prekazka | null = o.status === "caka_potvrdenie" ? "caka_potvrdenie" : zakaz(mail);
      pridaj("newsletter_web", mail, o.meno || "", null, p);
      continue;
    }
    // Kto bol len v ručných skupinách „Klienti…" alebo „Test", si dokument nestiahol.
    const zoSkupin = String(o.skupiny || "").split("·").map((x) => x.trim()).filter(Boolean);
    const len = zoSkupin.length > 0 && zoSkupin.every((g) => /^Klienti|^Test$/i.test(g));
    if (o.status === "active" && !len) { pridane.add(mail); pridaj("dokument_2025", mail, o.meno || "", null, null); }
  }

  // 3) Web bez súhlasu: vidno ich, ale písať sa im nedá.
  for (const l of leady) {
    const mail = cistyMail(l.email);
    if (!platnyMail(mail) || pridane.has(mail) || mailyKlientov.has(mail)) continue;
    pridane.add(mail);
    const note = String(l.note || "");
    const id: SkupinaId = /TEST POSTURY/i.test(note) ? "test_postury"
      : l.druh === "magnet" || /LEAD MAGNET/i.test(note) ? "dokument_novy"
      : "dopyt";
    pridaj(id, mail, l.name || "", null, zakaz(mail) ?? "bez_suhlasu");
  }

  return SKUPINY.map((s) => vysledok.get(s.id)!);
}

/** Adresáti vybraných skupín bez duplicít, v poradí skupín. */
export function adresatiSkupin(skupiny: Skupina[], vybrane: string[]): Adresat[] {
  const vyber = new Set(vybrane);
  const videne = new Set<string>();
  const out: Adresat[] = [];
  for (const s of skupiny) {
    if (!vyber.has(s.id)) continue;
    for (const a of s.adresati) {
      if (videne.has(a.email)) continue;
      videne.add(a.email);
      out.push(a);
    }
  }
  return out;
}
