/**
 * DEŇ, KEDY BOLA FOTKA ODFOTENÁ — z EXIF, nie z dňa nahratia.
 *
 * Jerry, 14. 10. 2026 pri Radkovi Balážovi: „nahral som k nemu fotky… ukazuje
 * mi, že sú fotené 14. 10. 2026, pričom sú fotené v 2023." Kartotéka fotku
 * pred nahratím zmenší a prekóduje, čím sa EXIF zahodí (zámerne — aj s polohou).
 * Dátum sa preto musí prečítať z PÔVODNÉHO súboru ešte pred zmenšením.
 *
 * Poradie: DateTimeOriginal (0x9003) → DateTimeDigitized (0x9004) → DateTime
 * (0x0132, ten vie byť dňom úpravy). JPEG sa číta poriadne cez segment APP1;
 * iné formáty (HEIC z iPhonu) majú EXIF v inom obale — tam sa hľadá prvý
 * časový reťazec v tvare EXIF („2023:05:12 09:14:03"), lebo EXIF ho ukladá
 * ako ASCII v každom obale rovnako.
 *
 * Vracia „RRRR-MM-DD" alebo `null` — fotka zo WhatsAppu či snímka obrazovky
 * EXIF nemá a vtedy platí deň, ktorý zvolil človek.
 */

const ASCII_CAS = /((?:19|20)\d\d):([01]\d):([0-3]\d) [0-2]\d:[0-5]\d:[0-5]\d/;

/** „2023:05:12 09:14:03" → „2023-05-12", alebo null pri nezmysle. */
export function denZExifRetazca(s: string, dnes?: string): string | null {
  const m = ASCII_CAS.exec(s);
  if (!m) return null;
  const den = `${m[1]}-${m[2]}-${m[3]}`;
  const [r, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || d < 1 || d > 31 || r < 1990) return null;
  // Fotoaparát s nenastavenými hodinami vie zapísať budúcnosť — tá sa neberie.
  if (dnes && den > dnes) return null;
  return den;
}

function citajJpeg(v: DataView, dnes?: string): string | null {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    if (v.getUint8(o) !== 0xff) return null;
    const znacka = v.getUint8(o + 1);
    const dlzka = v.getUint16(o + 2);
    if (znacka === 0xda || znacka === 0xd9) return null; // začiatok obrazu — EXIF už nepríde
    if (znacka === 0xe1 && o + 10 <= v.byteLength
      && v.getUint32(o + 4) === 0x45786966 /* "Exif" */ && v.getUint16(o + 8) === 0) {
      return citajTiff(v, o + 10, Math.min(v.byteLength, o + 2 + dlzka), dnes);
    }
    o += 2 + dlzka;
  }
  return null;
}

function citajTiff(v: DataView, zaciatok: number, koniec: number, dnes?: string): string | null {
  if (zaciatok + 8 > koniec) return null;
  const poradie = v.getUint16(zaciatok);
  const le = poradie === 0x4949; // "II" = little endian, "MM" = big endian
  if (!le && poradie !== 0x4d4d) return null;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const retazec = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n && o + i < koniec; i++) s += String.fromCharCode(v.getUint8(o + i));
    return s;
  };
  const najdi: Record<number, string> = {};
  const citajIfd = (ifd: number): number | null => {
    const o = zaciatok + ifd;
    if (o + 2 > koniec) return null;
    const pocet = u16(o);
    let exifIfd: number | null = null;
    for (let i = 0; i < pocet; i++) {
      const e = o + 2 + i * 12;
      if (e + 12 > koniec) break;
      const tag = u16(e);
      if (tag === 0x8769) exifIfd = u32(e + 8);
      if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
        const n = u32(e + 4);
        najdi[tag] = retazec(zaciatok + (n > 4 ? u32(e + 8) : e + 8 - zaciatok), Math.min(n, 32));
      }
    }
    return exifIfd;
  };
  const exifIfd = citajIfd(u32(zaciatok + 4));
  if (exifIfd != null) citajIfd(exifIfd);
  for (const tag of [0x9003, 0x9004, 0x0132]) {
    const den = najdi[tag] ? denZExifRetazca(najdi[tag], dnes) : null;
    if (den) return den;
  }
  return null;
}

/** Deň odfotenia z bajtov súboru. Číta stačí začiatok (prvých ~256 kB). */
export function denZFotky(buf: ArrayBuffer, dnes?: string): string | null {
  const v = new DataView(buf);
  const zJpeg = citajJpeg(v, dnes);
  if (zJpeg) return zJpeg;
  // HEIC a iné obaly: EXIF je tam tiež, len ináč zabalený — stačí ASCII čas.
  const kus = new Uint8Array(buf, 0, Math.min(buf.byteLength, 262144));
  let s = "";
  for (let i = 0; i < kus.length; i++) s += String.fromCharCode(kus[i]);
  return denZExifRetazca(s, dnes);
}
