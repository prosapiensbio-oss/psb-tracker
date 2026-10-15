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
  // Kalendár na Macu sa hlási „macOS/14.5 (…) dataaccessd/1.0" — rovnaké
  // dataaccessd ako iPhone, takže Mac sa musí rozpoznať PRED ním (15. 10. 2026
  // sa odber z Macu zapísal ako „iPhone").
  if (/iPhone|iPad|^iOS\//i.test(u)) return "iPhone";
  if (/macOS|Macintosh|Mac OS X|CalendarAgent/i.test(u)) return "Mac";
  if (/dataaccessd/i.test(u)) return "iPhone";
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

/**
 * Z čoho klient otvoril STRÁNKU `/k/<token>` (nie feed — ten sťahuje
 * kalendár, nie človek). Android je tu to podstatné: Google Kalendár
 * v telefóne odber z odkazu nepridá a klient musí ísť inou cestou.
 */
export function platformaStranky(ua: string): string {
  const u = ua || "";
  if (/iPhone|iPad|iPod/i.test(u)) return "iPhone";
  if (/Android/i.test(u)) return "Android";
  if (/Macintosh|Mac OS X/i.test(u)) return "Mac";
  if (/Windows/i.test(u)) return "Windows";
  return "iný";
}

/**
 * Náhľad odkazu (správy, WhatsApp, Messenger) stránku stiahne bez človeka —
 * taký prístup sa za otvorenie nepočíta. Prehliadač človeka sa hlási ako
 * „Mozilla/…" a nenesie meno robota.
 */
export function jeNahladOdkazu(ua: string): boolean {
  const u = ua || "";
  if (!/^Mozilla\//.test(u)) return true;
  return /bot|crawler|spider|preview|facebookexternalhit|WhatsApp|Slack|Telegram|Discord|Viber|Skype|SkypeUriPreview|Google-|GoogleOther|HeadlessChrome|curl|python|okhttp/i.test(u);
}

/**
 * Veta o stave odberu pre dlaždicu v profile. Rozlišuje, kde sa to zaseklo:
 * stránku neotvoril / otvoril, ale kalendár si nepridal (a pri Androide
 * prečo) / odoberá.
 */
export function stavOdberu(o: {
  odobera: boolean; pocet: number; posledne: string | null; platforma: string | null;
  otvorene: string | null; otvorenePlatforma: string | null;
}): "odobera" | "prestal" | "otvoril" | "neotvoril" {
  if (o.odobera) return "odobera";
  if (o.pocet > 0 && o.posledne) return "prestal";
  return o.otvorene ? "otvoril" : "neotvoril";
}

export type Telefon = "iphone" | "android";
/** `?telefon=` z adresy → voľba, alebo null (nič iné sa nepúšťa ďalej). */
export const telefonZAdresy = (x: string | null | undefined): Telefon | null =>
  x === "iphone" || x === "android" ? x : null;

const escH = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * TELO STRÁNKY `/k/<token>` (Jerry, 15. 10. 2026: „design bude rovnaký ako
 * bol, ale bude tam otázka, aký máš telefón — iPhone, Android — a keď klikne
 * na Android, ukáže sa toto").
 *
 * Bez JavaScriptu: voľba je odkaz `?telefon=…#telefon`, server pošle stránku
 * s rozbalenou časťou a zapíše, čo klient zvolil. Kým nezvolí, pod otázkou
 * nie je nič — hádanie z hlavičky prehliadača sa vie pomýliť a zlá cesta je
 * presne to, čo Michalovi Knapčokovi ticho zlyhalo.
 *
 * Android: Google Kalendár v telefóne odber z odkazu nepridá. Cesta 1 je
 * počítač (adresa, mail sebe, a keď je stránka práve na počítači, rovno
 * tlačidlo do Google Kalendára), cesta 2 appka ICSx⁵ (platená).
 */
export function teloStrankyKalendara(v: {
  logo: string; oslovenie: string; telefon: Telefon | null;
  webcal: string; google: string; kratka: string; telefonTrenera: string; komu: string;
  /** Stránka je otvorená na počítači (Mac/Windows) — Android sa tam pridá rovno. */
  naPocitaci?: boolean;
}): string {
  const o = v.oslovenie.trim();
  const volba = (t: Telefon, nazov: string, pod: string) =>
    `<a class="volba${v.telefon === t ? " zvolena" : ""}" href="?telefon=${t}#telefon">${nazov}<small>${pod}</small></a>`;
  const iphone = `
<a class="btn" href="${escH(v.webcal)}">Přidat do kalendáře</a>
<p class="mala">Telefon se zeptá „Odebírat kalendář?" — stačí potvrdit. V kalendáři uvidíte jen své tréninky.</p>
<div class="rada">V dalším okně vypněte <b>„Odstranit upozornění"</b>, jinak vás telefon na trénink neupozorní.</div>`;
  const mail = `mailto:?subject=${encodeURIComponent("Tréninky do kalendáře")}&body=${encodeURIComponent(`Otevřít na počítači: ${v.kratka}`)}`;
  // Michal Knapčok, 15. 10. 2026: Android v telefóne, odkaz otvoril na
  // MacBooku a stará stránka ho poslala do Apple Calendar. Na počítači je
  // Google Kalendár na webe presne tá cesta, ktorá funguje — hneď navrchu.
  const androidNaPocitaci = `
<p style="margin-top:18px">Jste na počítači — to je pro Android nejlepší cesta. Klepněte níže a v Google Kalendáři potvrďte <b>Přidat</b>. Buďte přihlášeni stejným Google účtem jako v telefonu — tréninky se do telefonu dostanou samy, poprvé do několika hodin.</p>
<a class="btn" href="${escH(v.google)}">Přidat do Google Kalendáře</a>
<p class="mala">Nepoužívejte Kalendář na Macu (Apple) — do telefonu s Androidem se z něj tréninky nedostanou. V kalendáři uvidíte jen své tréninky.</p>`;
  const android = v.naPocitaci ? androidNaPocitaci : `
<p style="margin-top:18px">Na Androidu přidá tréninky jen Google Kalendář <b>na webu</b> — aplikace v mobilu odkaz neumí přijmout. Jsou dvě cesty:</p>
<h2>1 · Na počítači — zdarma, minuta</h2>
<p>Otevřete na počítači tuto adresu a klepněte na „Přidat přes Google Kalendář“. Buďte přihlášeni stejným Google účtem jako v mobilu — tréninky se do mobilu dostanou samy, poprvé do několika hodin.</p>
<div class="adresa">${escH(v.kratka.replace(/^https?:\/\//, ""))}</div>
<a class="btn" href="${escH(mail)}">Poslat si odkaz do e-mailu</a>
<a class="druha" href="${escH(v.google)}">Jste právě na počítači? Přidat přes Google Kalendář</a>
<h2>2 · Přímo v mobilu — aplikace ICSx⁵</h2>
<p>Je placená (jednorázově kolem 50 Kč). Nainstalujte ji, vraťte se sem a klepněte na „Přidat přes ICSx⁵“.</p>
<a class="btn svetle" href="https://play.google.com/store/apps/details?id=at.bitfire.icsdroid">Otevřít Google Play</a>
<a class="btn svetle" href="${escH(v.webcal)}">Přidat přes ICSx⁵</a>
<p class="mala">V kalendáři uvidíte jen své tréninky.</p>`;
  return `${v.logo}
<h1>Vaše tréninky v kalendáři</h1>
<p>${o ? `${escH(o)}, j` : "J"}edním klepnutím se vám tréninky objeví v kalendáři v mobilu. Když se termín změní, změní se i u vás — sám.</p>
<div class="otazka" id="telefon">Jaký máte telefon?</div>
<div class="volby">${volba("iphone", "iPhone", "Apple")}${volba("android", "Android", "Samsung, Xiaomi, Pixel…")}</div>
${v.telefon === "iphone" ? iphone : v.telefon === "android" ? android : ""}
<a class="druha" style="margin-top:22px" href="sms:${escH(v.telefonTrenera.replace(/[^\d+]/g, ""))}">Nejde to? Napsat ${escH(v.komu)}</a>`;
}
