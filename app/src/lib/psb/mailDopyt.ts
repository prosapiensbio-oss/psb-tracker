/**
 * Zo správy v schránke info@ urobí dopyt — alebo povie, prečo nie.
 *
 * PREČO
 *
 * Kokpit vidí dopyt len vtedy, keď prejde formulárom na webe. Kto napíše
 * rovno na info@prosapiens.cz (a 20. 9. 2026 to bol presne ten človek, ktorý
 * prišiel z platenej reklamy), do štatistiky nespadne — a cena za dopyt potom
 * vychádza vyššia, než aká naozaj je.
 *
 * PREČO SA VŠETKO NEZAPÍŠE
 *
 * V schránke nie sú len dopyty. Sú tam faktúry, DMARC hlásenia, newslettery
 * a odpovede na vlastné maily. Keby sa zapisovalo všetko, Dopyty by sa stali
 * druhou schránkou a stratili by zmysel — preto sa filtruje a preto každá
 * preskočená správa nesie DÔVOD, ktorý je vidieť v Údajoch. Zoznam vyradených
 * je poistka proti tichu: keď sa niečo vyhodí omylom, má sa to dať zbadať.
 */

export type MailVstup = { uid: string; od: string; komu: string; predmet: string; datum: string; text: string };

export type MailDopyt = {
  kluc: string;
  datum: string;      // ISO deň v Prahe
  meno: string;
  email: string;
  telefon: string;
  poznamka: string;
  zdroj: string;      // "mail" | "web" (formulár preposlaný mailom)
  zFormulara: boolean;
};

export type MailVysledok = { dopyt: MailDopyt } | { preskocene: string };

/** Technické adresy, ktoré nikdy nie sú dopyt. */
const TECHNICKE = [
  "no-reply", "noreply", "no_reply", "donotreply", "do-not-reply", "nereply",
  "mailer-daemon", "postmaster", "bounce", "bounces", "dmarc", "abuse",
  "notification", "notifications", "newsletter", "podpora", "support",
  "billing", "faktury", "fakturace", "info-noreply",
];

/** Domény služieb, s ktorými PSB pracuje — ich pošta nie je dopyt. */
const SLUZBY = [
  "facebookmail.com", "facebook.com", "meta.com", "google.com", "googlemail.com",
  "accounts.google.com", "youtube.com", "instagram.com", "apple.com", "icloud.com",
  "websupport.sk", "websupport.cz", "wedos.cz", "fio.cz", "ptminder.com",
  "mailer.com", "stripe.com", "paypal.com", "canva.com", "anthropic.com",
  "openai.com", "cloudflare.com", "wordpress.com", "jetpack.com",
];

/** Predmety, ktoré prezrádzajú stroj. */
const STROJOVE = [
  "report domain:", "dmarc", "delivery status notification", "undelivered mail",
  "automatická odpověď", "automaticka odpoved", "out of office", "mimo kancelář",
  "faktura", "faktúra", "invoice", "objednávka č", "potvrzení platby",
  "newsletter", "odhlásit", "unsubscribe",
];

const MESIACE_ISO = (d: Date, pasmo = "Europe/Prague") => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: pasmo, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(d);
};

/** Z „Jan Novák <jan@novak.cz>" vytiahne meno a adresu. */
export function rozdelAdresu(s: string): { meno: string; email: string } {
  const v = String(s || "").trim();
  const m = /<([^>]+)>/.exec(v);
  const email = (m ? m[1] : v).trim().replace(/^mailto:/i, "").toLowerCase();
  let meno = m ? v.slice(0, m.index).trim() : "";
  meno = meno.replace(/^["']|["']$/g, "").trim();
  // Keď meno chýba, poslúži časť pred zavináčom — „jan.novak" je stále lepšie
  // než prázdny riadok v zozname dopytov.
  if (!meno && email.includes("@")) {
    meno = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim()
      .split(/\s+/).filter(Boolean).map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(" ");
  }
  return { meno: meno.slice(0, 120), email: /.+@.+\..+/.test(email) ? email.slice(0, 160) : "" };
}

/** Telefón v texte správy — hľadá české a slovenské tvary. */
export function telefonZTextu(t: string): string {
  const m = /(?:\+42[01]\s*)?(?:\d{3}[\s.-]?){2}\d{3}\b/.exec(String(t || "").replace(/ /g, " "));
  if (!m) return "";
  const cislo = m[0].replace(/[\s.-]/g, "");
  // Roky a sumy sa na telefón netvária — deväť číslic a viac.
  return cislo.replace(/\D/g, "").length >= 9 ? cislo.slice(0, 40) : "";
}

/**
 * Správa z Contact Form 7 vyzerá ako pošta od webu, nie od človeka.
 *
 * Také dopyty už do Kokpitu chodia priamo zo snippetu — mail je len poistka
 * pre prípad, že snippet zlyhal. Preto sa im nechá KĽÚČ WEBOVÉHO DOPYTU:
 * keď obe cesty prejdú, vznikne jeden dopyt, nie dva, a kampaň zo snippetu
 * zostane, lebo mail ju prepísať nesmie (v e-maile UTM nie sú).
 */
export function zFormulara(v: MailVstup): { meno: string; email: string; telefon: string; sprava: string } | null {
  const t = v.text || "";
  const znaky = /(prosapiens|kontaktní formulář|kontaktni formular|nový příspěvek|test postury|úvodní trénink)/i.test(v.predmet + " " + t);
  const pole = (mena: string[]) => {
    for (const m of mena) {
      const r = new RegExp(`^\\s*${m}\\s*[:：]\\s*(.+)$`, "im").exec(t);
      if (r && r[1].trim()) return r[1].trim();
    }
    return "";
  };
  const email = pole(["e-?mail", "email", "váš e-?mail", "vas e-?mail"]);
  const meno = pole(["jm[ée]no", "meno", "jm[ée]no a p[řr][íi]jmen[íi]", "n[áa]zev"]);
  if (!znaky || (!email && !meno)) return null;
  return {
    meno: meno.slice(0, 120),
    email: email.toLowerCase().slice(0, 160),
    telefon: (pole(["telefon", "tel", "tel[eé]fon", "telefonn[íi] [čc][íi]slo"]) || telefonZTextu(t)).slice(0, 40),
    sprava: (pole(["zpr[áa]va", "spr[áa]va", "message", "dotaz", "pozn[áa]mka"]) || t).slice(0, 500),
  };
}

/**
 * Hlavné rozhodnutie: dopyt, alebo preskočiť (a prečo).
 *
 * `vlastne` sú adresy PSB — správa od seba samého je preposlanie alebo kópia,
 * nie nový človek. Výnimka je práve formulár, ktorý chodí z webu.
 */
export function naDopyt(v: MailVstup, vlastne: string[] = [], ignoruj: string[] = []): MailVysledok {
  const { meno, email } = rozdelAdresu(v.od);
  const predmet = (v.predmet || "").toLowerCase();
  const domena = email.split("@")[1] || "";
  const lokalne = email.split("@")[0] || "";

  const den = (() => {
    const d = new Date(v.datum);
    return isNaN(d.getTime()) ? MESIACE_ISO(new Date()) : MESIACE_ISO(d);
  })();

  const form = zFormulara(v);
  if (form) {
    const adresa = form.email || email;
    if (!adresa) return { preskocene: "formulár bez e-mailu" };
    return {
      dopyt: {
        // Rovnaký tvar ako v /api/lead-web — inak by ten istý dopyt existoval dvakrát.
        kluc: `web-${den}-${adresa.toLowerCase()}`.slice(0, 64),
        datum: den,
        meno: form.meno || rozdelAdresu(form.email).meno,
        email: adresa,
        telefon: form.telefon,
        poznamka: `${v.predmet} · ${form.sprava}`.replace(/\s+/g, " ").trim().slice(0, 500),
        zdroj: "web",
        zFormulara: true,
      },
    };
  }

  if (!email) return { preskocene: "bez odosielateľa" };
  if (vlastne.some((a) => a && email === a.toLowerCase())) return { preskocene: "vlastná adresa" };
  if (ignoruj.some((a) => a && (email === a.toLowerCase() || domena === a.toLowerCase().replace(/^@/, "")))) {
    return { preskocene: "na zozname ignorovaných" };
  }
  if (TECHNICKE.some((t) => lokalne.includes(t))) return { preskocene: `technická adresa (${lokalne})` };
  if (SLUZBY.some((d) => domena === d || domena.endsWith("." + d))) return { preskocene: `služba (${domena})` };
  if (STROJOVE.some((s) => predmet.includes(s))) return { preskocene: "strojový predmet" };
  // Odpoveď na vlastný mail nie je nový dopyt — človek už v Kokpite je.
  if (/^(re|odp|fwd|fw)\s*:/i.test(v.predmet || "")) return { preskocene: "odpoveď v rozhovore" };

  return {
    dopyt: {
      kluc: `mail-${den}-${email}`.slice(0, 64),
      datum: den,
      meno,
      email,
      telefon: telefonZTextu(v.text),
      poznamka: `${v.predmet} · ${String(v.text || "").replace(/\s+/g, " ").trim()}`.trim().slice(0, 500),
      zdroj: "mail",
      zFormulara: false,
    },
  };
}
