/**
 * FIO API — pohyby z banky bez nahrávania súborov.
 *
 * Jerry, 3. 10. 2026: „existuje nejaké API na Fio banku?" Existuje, je to
 * obyčajné REST cez HTTPS s jedným tokenom v adrese (dokumentácia „API
 * Bankovnictví", verzia 16. 10. 2025).
 *
 * PREČO TO STOJÍ ZA TO: každý pohyb nesie `ID pohybu` (column22) — jedinečný
 * kľúč, ktorý z CSV exportu „Pohyby na všech účtech" od 9/2026 ZMIZOL a kvôli
 * ktorému sa duplicity musia číslovať podľa poradia v súbore. Cez API sa
 * duplicita nemá ako stať a `/last/` vráti len to, čo ešte nebolo stiahnuté.
 *
 * ČO HOVORÍ DOKUMENTÁCIA A ČO Z TOHO PLYNIE PRE NÁS:
 *   • minimálny odstup dvoch dotazov na ten istý token je 30 sekúnd,
 *   • naraz najviac 50 000 pohybov,
 *   • dáta staršie než 90 dní vyžadujú dočasné odomknutie histórie v IB,
 *   • token platí najviac 180 dní a predlžuje sa prihlásením do IB,
 *   • token patrí k JEDNÉMU účtu a má byť právo „Sledování účtu" — teda len
 *     čítanie. Appka nemá mať ako poslať platbu.
 *
 * Token je tajomstvo: žije ako secret na Cloudflare (`FIO_TOKEN`), nikdy
 * v databáze ani v odpovedi API. Preto sa v tomto súbore ani raz nelogu je.
 */

import { odhadniKategoriu, type FioRiadok } from "./fio";

const ZAKLAD = "https://fioapi.fio.cz/v1/rest";

/** Pohyby za obdobie: `/periods/{token}/{od}/{do}/transactions.json`. */
export const urlObdobie = (token: string, od: string, doDna: string) =>
  `${ZAKLAD}/periods/${encodeURIComponent(token)}/${od}/${doDna}/transactions.json`;

/** Len to, čo pribudlo od posledného stiahnutia (zarážka je na strane banky). */
export const urlNove = (token: string) =>
  `${ZAKLAD}/last/${encodeURIComponent(token)}/transactions.json`;

/** Posunutie zarážky na deň — ďalšie `/last/` vráti pohyby od neho. */
export const urlZarazka = (token: string, den: string) =>
  `${ZAKLAD}/set-last-date/${encodeURIComponent(token)}/${den}/`;

type Stlpec = { value: string | number | null; name: string; id: number } | null;
type Pohyb = Record<string, Stlpec>;

export type FioOdpoved = {
  accountStatement?: {
    info?: { accountId?: string; closingBalance?: number; dateStart?: string; dateEnd?: string; idLastDownload?: number | null };
    transactionList?: { transaction?: Pohyb[] } | null;
  };
};

const text = (s: Stlpec): string => (s && s.value != null ? String(s.value).trim() : "");
const cislo = (s: Stlpec): number => (s && s.value != null ? Number(s.value) : 0);

/**
 * Dátum z API chodí ako „2026-09-27+0200" (a v starších príkladoch ako
 * milisekundy). Berie sa prvých desať znakov, nie `new Date` — prevod cez
 * časovú zónu by pohyb spred polnoci presunul na predošlý deň.
 */
export function datumPohybu(s: Stlpec): string {
  const v = s?.value;
  if (v == null) return "";
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  const t = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
}

/**
 * Protistrana: názov protiúčtu, inak číslo účtu s kódom banky. To isté, čo
 * z výpisu vyčíta `parseFio` — kategórie sa učia podľa protistrany, takže keby
 * sa tvar líšil, naučené pravidlá by na pohyby z API nesadli.
 */
export function protistranaPohybu(p: Pohyb): string {
  const nazov = text(p.column10);
  if (nazov) return nazov;
  const ucet = text(p.column2);
  const kod = text(p.column3);
  return ucet ? (kod ? `${ucet}/${kod}` : ucet) : text(p.column12);
}

/**
 * Poznámka — to, podľa čoho sa platba páruje na klienta. Berie sa správa pre
 * príjemcu, potom komentár, upresnenie a identifikácia; variabilný symbol sa
 * pripája na koniec, lebo niektorí klienti sa podpisujú práve ním.
 */
export function poznamkaPohybu(p: Pohyb): string {
  const kusy = [text(p.column16), text(p.column25), text(p.column18), text(p.column7)].filter(Boolean);
  const vs = text(p.column5);
  if (vs && vs !== "0") kusy.push(`VS ${vs}`);
  return kusy.join(" · ").slice(0, 300);
}

/** Pohyby z JSON odpovede do tvaru, v akom ich appka zapisuje a zobrazuje. */
export function pohybyZOdpovede(
  o: FioOdpoved,
  pravidla: { vzor: string; kategoria: string }[] = [],
): FioRiadok[] {
  const zoznam = o?.accountStatement?.transactionList?.transaction || [];
  const out: FioRiadok[] = [];
  for (const p of zoznam) {
    const datum = datumPohybu(p.column0);
    if (!datum) continue;
    const protistrana = protistranaPohybu(p);
    const poznamka = poznamkaPohybu(p);
    const typ = text(p.column8);
    out.push({
      // ID pohybu je povinné pole API — bez neho by sa kľúč počítal z dátumu
      // a sumy a dve rovnaké výplaty v jeden deň by splynuli.
      id: text(p.column22),
      datum,
      suma: cislo(p.column1),
      protistrana,
      poznamka,
      typ,
      kategoria: odhadniKategoriu(`${protistrana} ${poznamka} ${typ}`, pravidla),
    });
  }
  // Od najstaršieho — ten istý poriadok, v akom chodia riadky z výpisu.
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Zostatok na účte ku koncu obdobia; `null` = odpoveď ho nenesie. */
export const zostatokZOdpovede = (o: FioOdpoved): number | null => {
  const z = o?.accountStatement?.info?.closingBalance;
  return typeof z === "number" ? z : null;
};

/**
 * Čo s odpoveďou, ktorá nie je 200. Kódy sú z dokumentácie; rozlišujú sa,
 * lebo každý znamená inú vec pre človeka pri obrazovke.
 */
export function chybaOdpovede(status: number): string {
  if (status === 409) return "Banka odmietla dotaz — medzi dvoma stiahnutiami musí byť aspoň 30 sekúnd. Skús o chvíľu.";
  if (status === 404) return "Token neplatí. Over ho v internetbankingu (Nastavení → API) a ulož znova.";
  if (status === 413) return "Príliš veľa pohybov naraz — vyber kratšie obdobie (limit je 50 000).";
  if (status === 422) return "Fio nerozumelo dotazu — skontroluj dátumy.";
  if (status === 500) return "Banka hlási chybu na svojej strane. Skús neskôr.";
  return `Banka odpovedala ${status}.`;
}
