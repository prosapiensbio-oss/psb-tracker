import { describe, expect, it } from "bun:test";

import { adresyMailu, mimeSprava, poLudsky } from "./mime";

const dekoduj = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)));

describe("MIME správa", () => {
  const zaklad = {
    od: "info@prosapiens.cz", odMeno: "ProSapiens Biomechanic",
    komu: ["klient@example.cz"], predmet: "Faktura 20261001 — ProSapiens Biomechanic",
    telo: "Ahoj Anna,\n\nposílám fakturu na 9 400,00 Kč.",
  };

  it("predmet s diakritikou ide zakódovaný", () => {
    // Nezakódovaná hlavička s „á" dorazí ako kaša — a je to prvé, čo klient vidí.
    const m = mimeSprava(zaklad);
    expect(m).toContain("Subject: =?UTF-8?B?");
    expect(m).not.toContain("Subject: Faktura 20261001 —");
  });

  it("text sa dá prečítať späť", () => {
    const m = mimeSprava({ ...zaklad, prilohy: [] });
    const telo = m.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    expect(dekoduj(telo)).toBe(zaklad.telo);
  });

  it("príloha má meno, typ aj obsah", () => {
    const data = new TextEncoder().encode("%PDF-1.4 skuska").buffer;
    const m = mimeSprava({ ...zaklad, prilohy: [{ meno: "Faktura 20261001.pdf", typ: "application/pdf", data }] }, "HRANICA");
    expect(m).toContain("multipart/mixed; boundary=\"HRANICA\"");
    expect(m).toContain('filename="Faktura 20261001.pdf"');
    expect(m).toContain("Content-Type: application/pdf");
    expect(m.trimEnd().endsWith("--HRANICA--")).toBe(true);
    const cast = m.split("--HRANICA")[2].split("\r\n\r\n")[1];
    expect(dekoduj(cast)).toBe("%PDF-1.4 skuska");
  });

  it("base64 je zalomený na 76 znakov", () => {
    // Dlhší riadok než 998 znakov je podľa normy chyba a niektoré servery
    // správu odmietnu; 76 je bezpečná hodnota, ktorú čaká každý klient.
    const data = new Uint8Array(4000).fill(65).buffer;
    const m = mimeSprava({ ...zaklad, prilohy: [{ meno: "a.pdf", typ: "application/pdf", data }] });
    // Len telo — hlavička „Subject" so zakódovanou diakritikou býva dlhšia
    // a norma to dovoľuje; obmedzenie 76 platí na base64 riadky.
    const telo = m.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    expect(telo.split("\r\n").every((r: string) => r.length <= 76)).toBe(true);
  });

  it("odosielateľ nesie meno aj adresu", () => {
    expect(mimeSprava(zaklad)).toContain("<info@prosapiens.cz>");
  });

  it("každá správa má vlastné Message-ID", () => {
    const a = mimeSprava(zaklad), b = mimeSprava(zaklad);
    const id = (m: string) => /Message-ID: <([^>]+)>/.exec(m)?.[1];
    expect(id(a)).not.toBe(id(b));
    expect(id(a)).toContain("@prosapiens.cz");
  });
});

describe("chyba servera po ľudsky", () => {
  it("535 radí najprv skúsiť znova, až potom heslo, a nechá znenie servera", () => {
    const t = poLudsky("prihlásenie: 535 535 5.7.8 Error: authentication failed: (reason unavailable)");
    expect(t).toContain("skús o chvíľu znova");
    expect(t).toContain("prepíš heslo v Údajoch");
    expect(t).toContain("535");
  });

  it("cudzia chyba sa nepreloží nasilu", () => {
    expect(poLudsky("server neodpovedal do 25 s")).toBe("server neodpovedal do 25 s");
  });
});

describe("adresyMailu", () => {
  it("rozdelí viac adries a zahodí duplicitu", () => {
    const r = adresyMailu("A@firma.cz, a@firma.cz\nsukromny@email.cz");
    expect(r.adresy).toEqual(["a@firma.cz", "sukromny@email.cz"]);
    expect(r.zle).toEqual([]);
  });

  it("pokazenú adresu nezahodí ticho", () => {
    const r = adresyMailu("dobry@email.cz; toto nie je mail");
    expect(r.adresy).toEqual(["dobry@email.cz"]);
    expect(r.zle).toEqual(["toto nie je mail"]);
  });

  it("z prázdneho poľa nevyrobí adresáta", () => {
    expect(adresyMailu("  ,\n ; ")).toEqual({ adresy: [], zle: [] });
  });
});

describe("HTML a obrázok vnútri správy", () => {
  const zakl = { od: "info@prosapiens.cz", komu: ["k@k.cz"], predmet: "Test", telo: "holý text" };

  it("bez HTML a bez príloh zostáva správa obyčajný text", () => {
    const m = mimeSprava(zakl);
    expect(m).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(m).not.toContain("multipart");
  });

  it("s HTML pribudne alternative a obe podoby", () => {
    const m = mimeSprava({ ...zakl, html: "<b>ahoj</b>" });
    expect(m).toContain("multipart/alternative");
    expect(dekoduj(m.split("Content-Transfer-Encoding: base64")[1].split("--")[0])).toContain("holý text");
    expect(m).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it("obrázok s cid ide do related a nesie Content-ID", () => {
    const m = mimeSprava({
      ...zakl, html: '<img src="cid:qr@psb">',
      prilohy: [{ meno: "qr.gif", typ: "image/gif", data: new Uint8Array([71, 73, 70]).buffer, cid: "qr@psb" }],
    });
    expect(m).toContain("multipart/related");
    expect(m).toContain("Content-ID: <qr@psb>");
    expect(m).toContain("Content-Disposition: inline");
  });

  it("príloha na stiahnutie zostáva prílohou, aj keď je v správe obrázok", () => {
    const m = mimeSprava({
      ...zakl, html: "<b>x</b>",
      prilohy: [
        { meno: "qr.gif", typ: "image/gif", data: new Uint8Array([71]).buffer, cid: "qr@psb" },
        { meno: "faktura.pdf", typ: "application/pdf", data: new Uint8Array([37, 80]).buffer },
      ],
    });
    expect(m).toContain("multipart/mixed");
    expect(m).toContain("multipart/related");
    expect(m).toContain('Content-Disposition: attachment; filename="faktura.pdf"');
  });
});
