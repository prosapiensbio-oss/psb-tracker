import { describe, expect, test } from "bun:test";
import { textZostatku, vetaZostatku } from "./zostatokText";

describe("zostatok hodín — jeden text pre všetky obrazovky", () => {
  test("mínus sa neoreže: Monika 2 h nad rámec, nie 0/6", () => {
    expect(textZostatku({ zostava: -2, spolu: 6 })).toBe("2 h nad rámec");
    expect(textZostatku({ zostava: -2, spolu: 1 })).toBe("2 h nad rámec");
  });
  test("kladný a nulový zostatok ostáva zlomok", () => {
    expect(textZostatku({ zostava: 0, spolu: 6 })).toBe("0/6");
    expect(textZostatku({ zostava: 4, spolu: 6, odvodene: true })).toBe("≈4/6");
  });
  test("polhodiny s desatinnou čiarkou", () => {
    expect(textZostatku({ zostava: -1.5, spolu: 6 })).toBe("1,5 h nad rámec");
  });
  test("veta do profilu", () => {
    expect(vetaZostatku(-2)).toBe("2 h nad rámec");
    expect(vetaZostatku(3, true)).toBe("≈3 h zostáva");
  });
});
