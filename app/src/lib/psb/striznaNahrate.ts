/**
 * NAHRATIE VIDEA Z MOBILU DO STRIŽNE (12. 10. 2026).
 *
 * Video z iPhonu (4K = 100 MB až 2 GB) ide cez Kokpit do R2 a Strižňa
 * (Mac appka) si ho odtiaľ stiahne. Worker neprijme telo väčšie než ~100 MB,
 * preto sa súbor posiela po častiach (R2 multipart): štart → časti → dokončenie.
 *
 * Čisté funkcie — server aj obrazovka počítajú z tých istých čísel.
 */

/** Veľkosť jednej časti. R2 chce všetky časti okrem poslednej rovnako veľké
 *  a aspoň 5 MiB; Worker prijme do ~100 MB. 25 MiB = 80 častí na 2 GB. */
export const VELKOST_CASTI = 25 * 1024 * 1024;
/** Strop jedného súboru — dlhé 4K klipy z iPhonu bývajú do 5 GB. */
export const MAX_VELKOST = 8 * 1024 * 1024 * 1024;
/** Koľkokrát obrazovka skúsi jednu časť, kým to vzdá. */
export const POKUSY_NA_CAST = 3;
/** Prefix v buckete kokpit-fotky. Fotky klientov majú iný — tento sa nemieša. */
export const PREFIX = "strizna/nahrate/";

export type StavNahratia = "nahrava" | "nahrate" | "stiahnute";

export type Nahratie = {
  id: string;
  nazov: string;
  velkost: number;
  typ: string;
  stav: StavNahratia;
  nahrateKedy: string | null;
  stiahnuteKedy: string | null;
  kto: string;
};

export function pocetCasti(velkost: number, casti = VELKOST_CASTI): number {
  if (!(velkost > 0)) return 0;
  return Math.ceil(velkost / casti);
}

/** Od–do (vrátane) bajtov časti n (1…N) — to isté, čo obrazovka odreže z Blobu. */
export function rozsahCasti(n: number, velkost: number, casti = VELKOST_CASTI): { od: number; po: number } {
  const od = (n - 1) * casti;
  return { od, po: Math.min(velkost, od + casti) };
}

/** Meno súboru do kľúča v R2 a do Content-Disposition: bez lomítok a riadiacich
 *  znakov, rozumne dlhé, prípona zostáva. */
export function cisteMeno(nazov: string): string {
  const s = String(nazov || "")
    .normalize("NFC")
    // riadiace znaky (pod medzerou a DEL) aj lomítka → _
    .replace(/[/\\]+/g, "_")
    .split("").map((z) => (z.charCodeAt(0) < 32 || z.charCodeAt(0) === 127 ? "_" : z)).join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!s) return "video.mov";
  if (s.length <= 120) return s;
  const bodka = s.lastIndexOf(".");
  const pripona = bodka > 0 && s.length - bodka <= 8 ? s.slice(bodka) : "";
  return s.slice(0, 120 - pripona.length) + pripona;
}

export function klucObjektu(id: string, nazov: string): string {
  return `${PREFIX}${id}/${cisteMeno(nazov)}`;
}

/** Typ, ktorý sa smie uložiť. Safari pri .mov posiela video/quicktime,
 *  niekedy prázdny reťazec — vtedy podľa prípony. */
export function typVidea(typ: string, nazov: string): string | null {
  const t = String(typ || "").toLowerCase().trim();
  if (/^video\/[a-z0-9.+-]+$/.test(t)) return t;
  const p = String(nazov || "").toLowerCase().split(".").pop() || "";
  const podlaPripony: Record<string, string> = { mov: "video/quicktime", mp4: "video/mp4", m4v: "video/x-m4v", hevc: "video/quicktime" };
  if (!t || t === "application/octet-stream") return podlaPripony[p] || null;
  return null;
}

/** Overenie zoznamu častí pred dokončením: čísla 1…N bez dier, každá má etag. */
export function overCasti(casti: unknown, ocakavanych: number): { cislo: number; etag: string }[] | string {
  if (!Array.isArray(casti)) return "Chýba zoznam častí.";
  const zoznam = casti
    .map((c) => ({ cislo: Number((c as { cislo?: unknown })?.cislo), etag: String((c as { etag?: unknown })?.etag ?? "") }))
    .sort((a, b) => a.cislo - b.cislo);
  if (zoznam.length !== ocakavanych) return `Prišlo ${zoznam.length} častí z ${ocakavanych}.`;
  for (let i = 0; i < zoznam.length; i++) {
    if (zoznam[i].cislo !== i + 1) return `Chýba časť ${i + 1}.`;
    if (!zoznam[i].etag) return `Časť ${i + 1} nemá etag.`;
  }
  return zoznam;
}

/** Hlavička Range → { od, dlzka } alebo null (celý súbor) alebo "zly" (416).
 *  Podporuje „bytes=a-b“, „bytes=a-“ a „bytes=-n“ (jeden rozsah). */
export function rozsahZHlavicky(range: string | null, velkost: number): { od: number; dlzka: number } | null | "zly" {
  if (!range) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null; // viac rozsahov a pod. → celý súbor (dovolené)
  if (m[1] === "") {
    const n = Math.min(Number(m[2]), velkost);
    if (n <= 0) return "zly";
    return { od: velkost - n, dlzka: n };
  }
  const od = Number(m[1]);
  if (od >= velkost) return "zly";
  const po = m[2] === "" ? velkost - 1 : Math.min(Number(m[2]), velkost - 1);
  if (po < od) return "zly";
  return { od, dlzka: po - od + 1 };
}

export function velkostCitatelne(b: number): string {
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} GB`;
  if (b >= 1024 * 1024) return `${Math.round(b / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} kB`;
}
