/**
 * Fotka do titulky.
 *
 * PREČO VLASTNÁ FOTKA A NIE GENEROVANÝ OBRÁZOK
 *
 * Jerryho výhrada k prvým verziám bola „ploché, bez hĺbky, bez emócie". To nie
 * je chyba sadzby, to je chýbajúci obraz — a hĺbku dá Petra s bolesťou do
 * kolena alebo prvý snímok z reelu, ktorý o hodinu ide von. Nič, čo model
 * nakreslí, nebude osobnejšie.
 *
 * PREČO SA ZMENŠUJE
 *
 * Fotka z telefónu má 12 Mpx. Vnútri SVG sa nesie ako `data:` URI, takže by
 * z exportu boli megabajty a rastrovanie by trvalo sekundy. Titulka je
 * 1080×1920 — väčší obrázok nemá kam ísť.
 *
 * PREČO JPEG A NIE PNG
 *
 * Fotografia v PNG je päťkrát väčšia pri nerozoznateľnom rozdiele. Výsledná
 * titulka je aj tak PNG; komprimuje sa len vstup.
 */

export const CIEL = { sirka: 1080, vyska: 1920, kvalita: 0.86 } as const;

export type Vlozena = { dataUri: string; sirka: number; vyska: number; kb: number };

/** Prijímame len to, čo prehliadač naozaj vykreslí. */
export function jeObrazok(f: File): boolean {
  return /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(f.type);
}

/**
 * Súbor na `data:` URI zmenšený tak, aby sa vošiel do plátna.
 *
 * Zmenšuje sa POMEROM, nie na presné rozmery: orezáva až skladba podľa toho,
 * kam obrázok v nej ide. Orezať tu by znamenalo zahodiť časť fotky skôr, než
 * sa vie, či ju skladba potrebuje.
 */
export async function vloz(subor: File): Promise<Vlozena> {
  if (!jeObrazok(subor)) throw new Error("To nie je obrázok.");
  const bitmapa = await nacitaj(subor);
  const k = Math.min(1, CIEL.sirka / bitmapa.width, CIEL.vyska / bitmapa.height);
  const w = Math.max(1, Math.round(bitmapa.width * k));
  const h = Math.max(1, Math.round(bitmapa.height * k));

  const platno = document.createElement("canvas");
  platno.width = w; platno.height = h;
  const ctx = platno.getContext("2d");
  if (!ctx) throw new Error("Plátno sa nedá otvoriť.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmapa, 0, 0, w, h);
  if ("close" in bitmapa) bitmapa.close();

  const dataUri = platno.toDataURL("image/jpeg", CIEL.kvalita);
  return { dataUri, sirka: w, vyska: h, kb: Math.round((dataUri.length * 3) / 4 / 1024) };
}

async function nacitaj(subor: File): Promise<ImageBitmap | HTMLImageElement> {
  // `createImageBitmap` rešpektuje EXIF otočenie, `<img>` v starších
  // prehliadačoch nie — fotka z telefónu by inak vyšla naležato.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(subor, { imageOrientation: "from-image" });
    } catch { /* padne sa na `<img>` */ }
  }
  const url = URL.createObjectURL(subor);
  try {
    const img = new Image();
    await new Promise<void>((ok, chyba) => {
      img.onload = () => ok();
      img.onerror = () => chyba(new Error("Obrázok sa nedá načítať."));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * To isté pre obrázok, ktorý neprišiel súborom.
 *
 * Vygenerovaný obrázok ide tou istou cestou ako fotka z počítača — zmenší sa
 * a prekomprimuje rovnako. Druhá vetva by znamenala druhé miesto, kde sa dá
 * zabudnúť na zmenšenie.
 */
export async function vlozZDataUri(uri: string): Promise<Vlozena> {
  const odpoved = await fetch(uri);
  const blob = await odpoved.blob();
  return vloz(new File([blob], "obrazok", { type: blob.type || "image/jpeg" }));
}
