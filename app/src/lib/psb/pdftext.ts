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

// Dekompresia po kúskoch, nie naraz.
//
// Chrome je pri DecompressionStream prísnejší než Node: keď za zlib dátami
// nasledujú prebytočné bajty — a v PDF za nimi býva CR/LF pred „endstream" —
// vyhodí chybu. Node ju prehltne. Preto sa číta prúdovo a chyba na konci sa
// ignoruje: to, čo dovtedy prišlo, je platné a je to celý obsah streamu.
// Bez tohto parser fungoval pri vývoji a v prehliadači mlčky nevrátil nič.
const inflate = async (data: Uint8Array): Promise<string | null> => {
  // Prvá obrana: odrež koncové biele znaky, ktoré do zlib dát nepatria.
  let koniec = data.length;
  while (koniec > 0 && (data[koniec - 1] === 10 || data[koniec - 1] === 13 || data[koniec - 1] === 32)) koniec--;
  const cisté = data.subarray(0, koniec);
  if (cisté.length < 2) return null;
  // 0x78 = zlib hlavička. Čokoľvek iné je nekomprimovaný alebo iný filter.
  const format = cisté[0] === 0x78 ? "deflate" : "deflate-raw";
  try {
    const ds = new DecompressionStream(format);
    const stream = new Blob([cisté as BlobPart]).stream().pipeThrough(ds);
    const reader = stream.getReader();
    const kusy: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) kusy.push(value as Uint8Array);
      }
    } catch {
      /* prebytočné bajty na konci — to, čo prišlo, stačí */
    }
    if (!kusy.length) return null;
    let dlzka = 0;
    for (const k of kusy) dlzka += k.length;
    const spolu = new Uint8Array(dlzka);
    let o = 0;
    for (const k of kusy) { spolu.set(k, o); o += k.length; }
    return new TextDecoder("latin1").decode(spolu);
  } catch {
    return null;
  }
};

/** Nájde všetky `stream … endstream` bloky a rozbalí tie, ktoré sa rozbaliť dajú. */
async function streamy(bajty: Uint8Array): Promise<string[]> {
  // Hľadá sa v latin1 podobe súboru: jeden bajt = jeden znak, takže indexy
  // sedia s bajtovým poľom, a indexOf je natívne rýchly. Pôvodné ručné
  // porovnávanie bajtov bolo kvadratické a pri polmegabajtovom PDF zbytočne
  // pomalé.
  const text = new TextDecoder("latin1").decode(bajty);
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const a = text.indexOf("stream", i);
    if (a < 0) break;
    // „endstream" obsahuje „stream" — za skutočným začiatkom musí byť zlom riadku.
    let s = a + 6;
    if (text.charCodeAt(s) === 13) s++;
    if (text.charCodeAt(s) === 10) s++;
    else if (s === a + 6) { i = a + 6; continue; }
    const b = text.indexOf("endstream", s);
    if (b < 0) break;
    const rozbalene = await inflate(bajty.subarray(s, b));
    if (rozbalene) out.push(rozbalene);
    i = b + 9;
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
