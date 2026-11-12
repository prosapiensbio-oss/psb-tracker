import { describe, expect, it } from "bun:test";

import { maObsah, postavZnamych, roztried } from "./emailTriedenie";

const znami = postavZnamych({
  maily: [{ email: "lukas.h@seznam.cz", klient: "Lukáš Hanus" }, { email: "a@x.cz; b@y.cz", klient: "Anna Nová" }],
  klienti: ["Lukáš Hanus", "Anna Nová", "Martin Vaško", "Jakub Gerich"],
  dopyty: [{ email: "novy@gmail.com", meno: "Petr Nový" }, { email: "jakub@firma.cz", meno: "Jakub Gerich" }],
});
const VLASTNE = ["info@prosapiens.cz"];
const m = (o: Partial<{ od: string; predmet: string; text: string; odpovedat: string }>) =>
  ({ uid: "1", od: "", predmet: "", datum: "Wed, 12 Nov 2026 10:00:00 +0100", komu: "info@prosapiens.cz", odpovedat: "", text: "", ...o });

describe("roztried", () => {
  it("klient podľa e-mailu má prednosť aj pred odpoveďou v rozhovore", () => {
    const r = roztried(m({ od: "Lukas <lukas.h@seznam.cz>", predmet: "Re: Faktura 20260041" }), VLASTNE, [], znami);
    expect(r.kategoria).toBe("klient");
    expect(r.klient).toBe("Lukáš Hanus");
  });
  it("druhá adresa z fakturačných údajov tiež patrí klientovi", () => {
    expect(roztried(m({ od: "b@y.cz", predmet: "ahoj" }), VLASTNE, [], znami).klient).toBe("Anna Nová");
  });
  it("klient podľa celého mena bez diakritiky", () => {
    const r = roztried(m({ od: "Martin Vasko <mv@gmail.com>", predmet: "zítra" }), VLASTNE, [], znami);
    expect(r.klient).toBe("Martin Vaško");
  });
  it("e-mail z dopytu klienta sa naučí ku klientovi", () => {
    expect(roztried(m({ od: "jakub@firma.cz", predmet: "x" }), VLASTNE, [], znami).klient).toBe("Jakub Gerich");
  });
  it("človek, ktorý chce tréning, je nový", () => {
    const r = roztried(m({ od: "Eva <eva@gmail.com>", predmet: "Dotaz", text: "Dobrý den, bolí mě záda, chtěla bych trénink." }), VLASTNE, [], znami);
    expect(r.kategoria).toBe("novy");
  });
  it("odpoveď z dopytu je nový človek", () => {
    const r = roztried(m({ od: "novy@gmail.com", predmet: "Re: úvodní trénink" }), VLASTNE, [], znami);
    expect(r).toMatchObject({ kategoria: "novy", dovod: "odpoveď z dopytu" });
  });
  it("služby a vlastná doména sú prevádzka", () => {
    expect(roztried(m({ od: "noreply@wordpress.com", predmet: "Update" }), VLASTNE, [], znami).kategoria).toBe("prevadzka");
    expect(roztried(m({ od: "online@prosapiens.cz", predmet: "Hláška" }), VLASTNE, [], znami).kategoria).toBe("prevadzka");
  });
  it("naša pošta z Gmailu je prevádzka, aj keď spomína tréning", () => {
    const r = roztried(m({ od: "ProSapiens Biomechanic <prosapiensbio@gmail.com>", predmet: "You are invited to sign a document", text: "trénink" }), VLASTNE, [], znami);
    expect(r).toMatchObject({ kategoria: "prevadzka", dovod: "naša adresa" });
  });
  it("preposlané vyúčtovanie a energie sú prevádzka, nie nový človek", () => {
    expect(roztried(m({ od: "Kamil Konvička <kamil@seznam.cz>", predmet: "Re: Fwd: Vyúčtování 2024 - pro story" }), VLASTNE, [], znami).kategoria).toBe("prevadzka");
    expect(roztried(m({ od: "Kamil Konvička <kamil@seznam.cz>", predmet: "Fwd: RE: Re: Fwd: Váš přepis energií u innogy" }), VLASTNE, [], znami).kategoria).toBe("prevadzka");
  });
  it("faktúra dodávateľa je prevádzka", () => {
    expect(roztried(m({ od: "uctarna@pronajem.cz", predmet: "Faktura za listopad" }), VLASTNE, [], znami).kategoria).toBe("prevadzka");
  });
  it("obchodná ponuka je ostatné", () => {
    const r = roztried(m({ od: "sales@seo.com", predmet: "Více zákazníků", text: "Nabízíme SEO optimalizaci a spolupráci" }), VLASTNE, [], znami);
    expect(r.kategoria).toBe("ostatne");
  });
  it("Reply-To určuje, komu sa odpovedá", () => {
    const r = roztried(m({ od: "online@prosapiens.cz", odpovedat: "Hana <hana@seznam.cz>", predmet: "Nová zpráva od Hana Marko", text: "Jméno: Hana Marko\nE-mail: hana@seznam.cz\nZpráva: chci trénink" }), VLASTNE, [], znami);
    expect(r.odpovedatMail).toBe("hana@seznam.cz");
  });
});

describe("maObsah", () => {
  it("samotný pozdrav a podpis nie sú odpoveď", () => {
    expect(maObsah("Dobrý den,\n\n\n\nS pozdravem\nFilip Stráňavský\nProSapiens Biomechanic")).toBe(false);
    expect(maObsah("Dobrý den,\n\nS pozdravem\nTerezka\nProSapiens Biomechanic")).toBe(false);
    expect(maObsah("Dobrý den,\n\n\nS pozdravem\nTerezia Zatková\nProSapiens Biomechanic")).toBe(false);
  });
  it("jedna vlastná veta stačí", () => {
    expect(maObsah("Dobrý den,\nv úterý v 10 máme volno.\nS pozdravem\nFilip Stráňavský")).toBe(true);
  });
});
