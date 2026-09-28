import { describe, expect, it } from "bun:test";

import { bezAktivnehoBalicka, type KlientPreKartu } from "./bezBalicka";
import type { Balicek } from "./balickyEvidencia";

const DNES = "2026-09-28";

const kl = (o: Partial<KlientPreKartu> & { name: string }): KlientPreKartu => ({
  status: "Aktívny", primaryTrainer: "Jerry", membership: "OFF - 6h BEZ viazanosti",
  packageRemaining: 0, packageTotal: 6, packageValidTo: "2026-10-04",
  lastSession: "2026-09-23", ...o,
});

const bal = (o: Partial<Balicek> & { klient: string }): Balicek => ({
  id: "b", nazov: "OFF - 6h BEZ viazanosti", hodiny: 6, platnostOd: "2026-09-25",
  platnostDo: "2026-11-25", cenaCzk: 7790, zdroj: "rucne", zruseneAt: null, ...o,
});

describe("bezAktivnehoBalicka", () => {
  it("vezme aktívneho klienta bez hodín", () => {
    const v = bezAktivnehoBalicka([kl({ name: "Richard Matl" })], [], [], DNES);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ meno: "Richard Matl", dovod: "hodiny minuté", dni: 5 });
  });

  it("neaktívneho ani na pauze nevezme", () => {
    const l = [kl({ name: "A", status: "Neaktívny" }), kl({ name: "B", status: "Pauza" })];
    expect(bezAktivnehoBalicka(l, [], [], DNES)).toHaveLength(0);
  });

  it("kto má hodiny, v zozname nie je", () => {
    expect(bezAktivnehoBalicka([kl({ name: "A", packageRemaining: 3 })], [], [], DNES)).toHaveLength(0);
  });

  it("hodiny má, ale platnosť skončila — patrí tam", () => {
    const v = bezAktivnehoBalicka([kl({ name: "Jakub Gerich", packageRemaining: 1, packageValidTo: "2026-09-02" })], [], [], DNES);
    expect(v[0]).toMatchObject({ dovod: "platnosť skončila", platnostDo: "2026-09-02" });
  });

  it("balíček nahodený v Kokpite ho zo zoznamu vezme preč", () => {
    // Presne to, čo Jerry robí: klientovi došli hodiny, zapíše mu nový
    // balíček — a karta sa musí vyprázdniť, inak sa prestane čítať.
    const l = [kl({ name: "Richard Matl" })];
    expect(bezAktivnehoBalicka(l, [bal({ klient: "Richard Matl" })], [], DNES)).toHaveLength(0);
  });

  it("aj balíček z Kokpitu sa dá minúť", () => {
    const udalosti = ["2026-09-25", "2026-09-26", "2026-09-27"].map((d) => ({ klient: "Richard Matl", zaciatok: `${d}T17:00`, typ: "trening" }));
    const l = [kl({ name: "Richard Matl" })];
    expect(bezAktivnehoBalicka(l, [bal({ klient: "Richard Matl", hodiny: 3 })], udalosti, DNES)).toHaveLength(1);
  });

  it("paušál nie je chýbajúci balíček", () => {
    // GOLD a spol. stoja v exporte navždy na 0/0 — nemíňajú sa po hodinách.
    const l = [kl({ name: "Paušalista", membership: "GOLD", packageTotal: 0, packageValidTo: "2026-12-31" })];
    expect(bezAktivnehoBalicka(l, [], [], DNES)).toHaveLength(0);
  });

  it("paušál po platnosti do zoznamu patrí", () => {
    const l = [kl({ name: "Paušalista", membership: "GOLD", packageTotal: 0, packageValidTo: "2026-08-31" })];
    expect(bezAktivnehoBalicka(l, [], [], DNES)).toHaveLength(1);
  });

  it("klient úplne bez členstva má vlastný dôvod", () => {
    const v = bezAktivnehoBalicka([kl({ name: "Nový", membership: "", packageTotal: 0, packageValidTo: "" })], [], [], DNES);
    expect(v[0].dovod).toBe("žiadne členstvo");
  });

  it("hore je ten, kto má objednaný termín", () => {
    const udalosti = [{ klient: "S termínom", zaciatok: "2026-10-01T17:00", typ: "trening" }];
    const l = [kl({ name: "Bez termínu", lastSession: "2026-09-27" }), kl({ name: "S termínom", lastSession: "2026-09-01" })];
    const v = bezAktivnehoBalicka(l, [], udalosti, DNES);
    expect(v.map((x) => x.meno)).toEqual(["S termínom", "Bez termínu"]);
    expect(v[0].objednanych).toBe(1);
  });
});
