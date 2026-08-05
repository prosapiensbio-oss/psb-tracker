// Čítanie textu z PDF — bez knižnice a bez modelu.
//
// Faktúry z Alzy nesú skutočnú textovú vrstvu, nie obrázok. Posielať ich
// Jarvisovi (ako mesačnú zostavu z Metricoolu, ktorá je vykreslená do grafiky)
// by bolo drahšie, pomalšie a menej presné — model by musel odhadovať to, čo je
// v súbore napísané presne. Preto sa text vyberá priamo.
//
// Beží v PROHLIADAČI: PDF má aj 500 kB a posielať ho na server len preto, aby
// sa z neho vytiahli tri kilobajty textu, nedáva zmysel. Na server ide až
// hotový rozpis položiek.
//
// Text je v CID fonte (Type0/CIDFontType2), takže bajty v obsahu nie sú znaky —
// sú to indexy glyfov. Preklad na písmená drží mapa ToUnicode, ktorá je v tom
// istom súbore. Bez nej z toho vyjde nečitateľná kaša.

/** Jeden vizuálny riadok stránky — text zložený zľava doprava. */
export type PdfRiadok = { strana: number; y: number; text: string };

const inflate = async (data: Uint8Array): Promise<Uint8Array | null> => {
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const ds = new DecompressionStream(format);
      const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      /* skús ďalší formát */
    }
  }
  return null;
};

/** Nájde všetky `stream … endstream` bloky a rozbalí tie, ktoré sa rozbaliť dajú. */
async function streamy(bajty: Uint8Array): Promise<string[]> {
  const out: string[] = [];
  const zaciatok = new TextEncoder().encode("stream");
  const koniec = new TextEncoder().encode("endstream");
  const najdi = (ihla: Uint8Array, od: number): number => {
    vonku: for (let i = od; i <= bajty.length - ihla.length; i++) {
      for (let j = 0; j < ihla.length; j++) if (bajty[i + j] !== ihla[j]) continue vonku;
      return i;
    }
    return -1;
  };
  let i = 0;
  while (i < bajty.length) {
    const a = najdi(zaciatok, i);
    if (a < 0) break;
    let s = a + zaciatok.length;
    // Za slovom „stream" je CRLF alebo LF.
    if (bajty[s] === 13) s++;
    if (bajty[s] === 10) s++;
    const b = najdi(koniec, s);
    if (b < 0) break;
    const surove = bajty.subarray(s, b);
    const rozbalene = await inflate(surove);
    if (rozbalene) out.push(new TextDecoder("latin1").decode(rozbalene));
    i = b + koniec.length;
  }
  return out;
}

/** Zloží mapu „index glyfu → znak" zo všetkých ToUnicode CMap v súbore. */
function toUnicode(bloky: string[]): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const s of bloky) {
    if (!s.includes("beginbf")) continue;
    for (const m of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        mapa.set(parseInt(p[1], 16), String.fromCharCode(parseInt(p[2].slice(0, 4), 16)));
      }
    }
    for (const m of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const p of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(p[1], 16);
        const hi = Math.min(parseInt(p[2], 16), lo + 5000);
        const dst = parseInt(p[3].slice(0, 4), 16);
        for (let i = lo; i <= hi; i++) mapa.set(i, String.fromCharCode(dst + i - lo));
      }
    }
  }
  return mapa;
}

// Text sa zbiera aj so súradnicou, lebo poradie fragmentov v súbore nemá s
// vizuálnym poradím nič spoločné. Bez pozícií vyjde jeden dlhý zlepenec, v
// ktorom sa nedá povedať, ktorá cena patrí ktorej položke.
const TOKEN = /(BT)|([-\d.]+)\s+([-\d.]+)\s+Td|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|<([0-9A-Fa-f]+)>/g;

export async function pdfRiadky(subor: ArrayBuffer): Promise<PdfRiadok[]> {
  const bloky = await streamy(new Uint8Array(subor));
  const mapa = toUnicode(bloky);
  if (!mapa.size) return [];
  const dekoduj = (hex: string) => {
    let out = "";
    for (let i = 0; i + 3 < hex.length; i += 4) out += mapa.get(parseInt(hex.slice(i, i + 4), 16)) ?? "";
    return out;
  };

  const kusy: { strana: number; y: number; x: number; text: string }[] = [];
  let strana = 0;
  for (const s of bloky) {
    if (!s.includes("Tj") && !s.includes("TJ")) continue;
    strana++;
    let x = 0, y = 0;
    for (const m of s.matchAll(TOKEN)) {
      if (m[1]) { x = 0; y = 0; }                       // BT = nový textový blok
      else if (m[2] !== undefined) { x += +m[2]; y += +m[3]; }  // Td je relatívne
      else if (m[4] !== undefined) { x = +m[8]; y = +m[9]; }    // Tm je absolútne
      else if (m[10] !== undefined) {
        const t = dekoduj(m[10]);
        if (t.trim()) kusy.push({ strana, y: Math.round(y), x, text: t });
      }
    }
  }

  const podlaRiadkov = new Map<string, { strana: number; y: number; kusy: { x: number; text: string }[] }>();
  for (const k of kusy) {
    const kluc = `${k.strana}|${k.y}`;
    const e = podlaRiadkov.get(kluc) || { strana: k.strana, y: k.y, kusy: [] };
    e.kusy.push({ x: k.x, text: k.text });
    podlaRiadkov.set(kluc, e);
  }
  return [...podlaRiadkov.values()]
    .map((r) => ({
      strana: r.strana,
      y: r.y,
      text: r.kusy.sort((a, b) => a.x - b.x).map((k) => k.text).join(" ").replace(/\s+/g, " ").trim(),
    }))
    .filter((r) => r.text)
    .sort((a, b) => a.strana - b.strana || b.y - a.y);
}

/** Rýchla odpoveď na „je toto PDF s textom, alebo obrázok?" */
export const maTextovuVrstvu = (riadky: PdfRiadok[]) => riadky.length > 5;
