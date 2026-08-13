import { describe, expect, it } from "bun:test";

import type { ClientAgg } from "../../lib/psb/compute";
import type { Lead, PaymentRow, PSBData, SessionRow } from "../../lib/psb/types";
import { krokyZa } from "./MarketingLievik";

/**
 * Konverzia dopyt → klient.
 *
 * Vzniklo z „Z dopytu klient 124 %" vo vrchnom pásiku (13. 8.). Percento nad
 * stovkou nebolo chybou počítania — delili sa dve rôzne skupiny ľudí.
 */

const lead = (id: string, date: string, name: string): Lead => ({
  id, date, name, source: "web", referrer: "", status: "novy", note: "",
  email: "", telefon: "", kampan: "", utm: "", stranka: "",
} as Lead);

const session = (client: string, date: string, sessionType: SessionRow["sessionType"], price = 900): SessionRow =>
  ({ date, time: "09:00", client, sessionTrainer: "Jerry", sessionName: "Tréning", sessionType, duration: 60, price });

const payment = (client: string, date: string, amount = 5000): PaymentRow =>
  ({ date, client, amount, method: "bank" });

const klient = (name: string, firstSession: string, sessions: SessionRow[]): ClientAgg =>
  ({ name, firstSession, sessions, vratenie: false } as ClientAgg);

/** Prázdny dataset, do ktorého sa dopĺňa len to, na čom v teste záleží. */
const psb = (p: Partial<PSBData>): PSBData =>
  ({ leads: [], sessions: [], payments: [], ...p } as PSBData);

const MES = ["2026-01", "2026-02"];

describe("dopyt → klient", () => {
  it("klient bez zapísaného dopytu konverziu nenafúkne", () => {
    // Presne prípad zo 124 %: dvaja platiaci klienti, jeden zapísaný dopyt.
    // Jana prišla z odporúčania a dopyt sa jej nikdy nezapísal.
    const s = [
      session("Petra", "2026-01-10", "UVODNE"), session("Petra", "2026-01-17", "OFFLINE"),
      session("Jana", "2026-01-12", "UVODNE"), session("Jana", "2026-01-19", "OFFLINE"),
    ];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2026-01-05", "Petra")],
        sessions: s,
        payments: [payment("Petra", "2026-01-20"), payment("Jana", "2026-01-22")],
      }),
      {
        Petra: klient("Petra", "2026-01-10", [s[0], s[1]]),
        Jana: klient("Jana", "2026-01-12", [s[2], s[3]]),
      },
      MES,
    );
    expect(k.klienti).toBe(2);
    expect(k.dopyty).toBe(1);
    // Staré `klienti / dopyty` by dalo 200 %. Konvertoval sa jeden dopyt z jedného.
    expect(k.zDopytu).toBe(1);
    expect((k.zDopytu / k.dopyty) * 100).toBeLessThanOrEqual(100);
  });

  it("dopyt, z ktorého klient nebol, sa neráta", () => {
    const s = [session("Petra", "2026-01-10", "UVODNE"), session("Petra", "2026-01-17", "OFFLINE")];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2026-01-05", "Petra"), lead("l2", "2026-01-06", "Nikto Neprišiel")],
        sessions: s,
        payments: [payment("Petra", "2026-01-20")],
      }),
      { Petra: klient("Petra", "2026-01-10", s) },
      MES,
    );
    expect(k.dopyty).toBe(2);
    expect(k.zDopytu).toBe(1);
  });

  it("kto zaplatil ZA úvodný a už neprišiel, nie je klient", () => {
    // Presne prípad, ktorý 13. 8. robil zo 100 % konverzie nezmysel: úvodný
    // tréning je platený, takže „má platbu" spĺňal každý, kto naň prišiel.
    // Osem ľudí v roku 2026 malo jedno sedenie, jednu platbu 1 100 Kč v deň
    // úvodného a odvtedy nič.
    const s = [session("Petra", "2026-01-10", "UVODNE", 1100)];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2026-01-05", "Petra")],
        sessions: s,
        payments: [payment("Petra", "2026-01-10", 1100)],
      }),
      { Petra: klient("Petra", "2026-01-10", s) },
      MES,
    );
    expect(k.uvodne).toBe(1);
    expect(k.klienti).toBe(0);
    expect(k.zDopytu).toBe(0);
  });

  it("druhý tréning je konverzia — vtedy sa človek rozhodol", () => {
    const s = [session("Petra", "2026-01-10", "UVODNE", 1100), session("Petra", "2026-01-17", "OFFLINE")];
    const k = krokyZa(
      psb({ sessions: s, payments: [payment("Petra", "2026-01-10", 1100)] }),
      { Petra: klient("Petra", "2026-01-10", s) },
      MES,
    );
    expect(k.klienti).toBe(1);
  });

  it("meno sa páruje bez ohľadu na diakritiku a veľké písmená", () => {
    const s = [session("Tereza Nováková", "2026-01-10", "UVODNE"), session("Tereza Nováková", "2026-01-17", "OFFLINE")];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2026-01-05", "tereza novakova")],
        sessions: s,
        payments: [payment("Tereza Nováková", "2026-01-20")],
      }),
      { "Tereza Nováková": klient("Tereza Nováková", "2026-01-10", s) },
      MES,
    );
    expect(k.zDopytu).toBe(1);
  });

  it("dopyt mimo okna sa neráta ani keď z neho klient bol", () => {
    const s = [session("Petra", "2025-11-10", "UVODNE")];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2025-11-05", "Petra")],
        sessions: s,
        payments: [payment("Petra", "2025-11-20")],
      }),
      { Petra: klient("Petra", "2025-11-10", s) },
      MES,
    );
    expect(k.dopyty).toBe(0);
    expect(k.zDopytu).toBe(0);
  });

  it("krstné meno sa na plné meno NEPÁRUJE — radšej podceniť než pripísať cudziemu", () => {
    // „Petra“ by sedela na Petru Novú aj na Petru Svobodovú. Zhoda je preto
    // presná, rovnako ako pri párovaní kampaní. Konverzia tým môže vyjsť nižšie,
    // než v skutočnosti je — to je bezpečnejší smer chyby než opačný.
    const s = [session("Petra Nováková", "2026-01-10", "UVODNE")];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2026-01-05", "Petra")],
        sessions: s,
        payments: [payment("Petra Nováková", "2026-01-20")],
      }),
      { "Petra Nováková": klient("Petra Nováková", "2026-01-10", s) },
      MES,
    );
    expect(k.zDopytu).toBe(0);
  });

  it("dopyt bez mena nespáruje kohokoľvek", () => {
    const s = [session("Petra", "2026-01-10", "UVODNE")];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2026-01-05", "")],
        sessions: s,
        payments: [payment("Petra", "2026-01-20")],
      }),
      { Petra: klient("Petra", "2026-01-10", s) },
      MES,
    );
    expect(k.zDopytu).toBe(0);
  });
});

describe("kto je za číslami", () => {
  it("dopyty, úvodné aj klienti nesú mená a dátumy", () => {
    const s = [session("Petra", "2026-01-10", "UVODNE"), session("Petra", "2026-01-20", "OFFLINE")];
    const k = krokyZa(
      psb({
        leads: [lead("l1", "2026-01-05", "Petra"), lead("l2", "2026-01-06", "Nikto")],
        sessions: s,
        payments: [payment("Petra", "2026-01-22")],
      }),
      { Petra: klient("Petra", "2026-01-10", s) },
      MES,
    );
    expect(k.kto.dopyty.map((x) => x.meno)).toEqual(["Nikto", "Petra"]);   // od najnovšieho
    expect(k.kto.uvodne).toEqual([{ meno: "Petra", datum: "2026-01-10" }]);
    expect(k.kto.klienti[0]).toEqual({ meno: "Petra", prvy: "2026-01-10", zaplatil: "2026-01-22" });
  });

  it("kto prišiel na úvodný dvakrát, je v zozname raz a s prvým dátumom", () => {
    const s = [session("Petra", "2026-02-03", "UVODNE"), session("Petra", "2026-01-10", "UVODNE")];
    const k = krokyZa(psb({ sessions: s }), {}, MES);
    expect(k.uvodne).toBe(1);
    expect(k.kto.uvodne).toEqual([{ meno: "Petra", datum: "2026-01-10" }]);
  });

  it("dopyt bez mena sa nestratí, len sa označí", () => {
    const k = krokyZa(psb({ leads: [lead("l1", "2026-01-05", "")] }), {}, MES);
    expect(k.kto.dopyty[0].meno).toBe("(bez mena)");
  });
});
