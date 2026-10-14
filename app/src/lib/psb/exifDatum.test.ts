import { describe, expect, it } from "bun:test";

import { denZExifRetazca, denZFotky } from "./exifDatum";

/** Minimálny JPEG s APP1 Exif: IFD0 → ukazovateľ na Exif IFD → DateTimeOriginal. */
function jpegSExif(datum: string, le: boolean, ajDateTime?: string): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  // hlavička TIFF (8) + IFD0 s 1–2 položkami + Exif IFD s 1 položkou + reťazce
  const ifd0Poloziek = ajDateTime ? 2 : 1;
  const ifd0 = 8, ifd0Dlzka = 2 + ifd0Poloziek * 12 + 4;
  const exifIfd = ifd0 + ifd0Dlzka, exifDlzka = 2 + 12 + 4;
  const str1 = exifIfd + exifDlzka, str2 = str1 + 20;
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0));
  tiff.push(...u16(ifd0Poloziek), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd));
  if (ajDateTime) tiff.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(str2));
  tiff.push(...u32(0));
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(str1), ...u32(0));
  tiff.push(...ascii(datum));
  if (ajDateTime) tiff.push(...ascii(ajDateTime));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const dlzka = app1.length + 2;
  const bajty = [0xff, 0xd8, 0xff, 0xe1, dlzka >> 8, dlzka & 255, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9];
  return new Uint8Array(bajty).buffer;
}

describe("dátum fotenia z EXIF (Radek Baláž, 14. 10. 2026)", () => {
  it("JPEG little endian aj big endian", () => {
    expect(denZFotky(jpegSExif("2023:05:12 09:14:03", true), "2026-10-14")).toBe("2023-05-12");
    expect(denZFotky(jpegSExif("2023:05:12 09:14:03", false), "2026-10-14")).toBe("2023-05-12");
  });
  it("DateTimeOriginal má prednosť pred DateTime (ten býva dňom úpravy)", () => {
    expect(denZFotky(jpegSExif("2023:05:12 09:14:03", true, "2026:10:14 08:00:00"), "2026-10-14")).toBe("2023-05-12");
  });
  it("iný obal (HEIC) — prvý časový reťazec v tvare EXIF", () => {
    const b = new TextEncoder().encode("ftypheic....Exif\0\0MM....2023:07:01 18:30:00\0....").buffer;
    expect(denZFotky(b as ArrayBuffer, "2026-10-14")).toBe("2023-07-01");
  });
  it("bez EXIF (snímka, WhatsApp) nič — platí deň zvolený človekom", () => {
    expect(denZFotky(new TextEncoder().encode("\x89PNG nic tu nie je").buffer as ArrayBuffer)).toBeNull();
  });
  it("budúcnosť a nezmysel sa neberú", () => {
    expect(denZExifRetazca("2031:01:01 10:00:00", "2026-10-14")).toBeNull();
    expect(denZExifRetazca("2023:13:01 10:00:00")).toBeNull();
    expect(denZExifRetazca("1980:01:01 10:00:00")).toBeNull();
  });
});
