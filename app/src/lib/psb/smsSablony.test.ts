import { describe, expect, it } from "bun:test";

import { textSmsPonuky } from "./ponukaTerminov";
import { akciaSmsAuditu, DRUHY_SMS_MIMO_HODIN, dlzkaSpravy } from "./sms";
import { oslovenieDoSms, textSmsAnamnezy, textSmsFotiek, textSmsKalendara, zlozHromadnuSms } from "./smsSablony";
import { jeNahladTrenera, verejnyOdkaz } from "./verejnyOdkaz";

/**
 * JEDNA SMS, NIE DVE. V októbri 2026 odišli všetky SMS s odkazom na anamnézu,
 * fotky, kalendár a ponuku ako dve správy — diakritika v šablóne zhodila limit
 * na 70 znakov. Meria sa cez `dlzkaSpravy` (to isté, čo zapíše server) a so
 * skutočnou dĺžkou odkazu; tokeny v D1 majú 12–14 znakov.
 */
const WORKER = "https://kokpit.prosapiensbio.workers.dev";
const BETA = "https://kokpit-beta.prosapiensbio.workers.dev";
const TOKEN = "AbCdEfGhJkMnPq";
const MENA = ["Michal Knapčok", "Kateřina Mátlová", "Bartoloměj Šťastný", "Maximilián Dvořák", "Radka Kovaříková", "Lucia Hrubá", ""];

const jednaSprava = (t: string) => {
  const d = dlzkaSpravy(t);
  expect({ text: t, unicode: d.unicode, sprav: d.sprav }).toEqual({ text: t, unicode: false, sprav: 1 });
};

describe("šablóny SMS sú jedna správa", () => {
  it("anamnéza aj s dlhou adresou workera (a v bete)", () => {
    for (const origin of [WORKER, BETA]) {
      const url = verejnyOdkaz(`/a/${TOKEN}`, origin);
      jednaSprava(textSmsAnamnezy(url, true));
      jednaSprava(textSmsAnamnezy(url, false));
    }
  });

  it("kalendár, fotky a ponuka s každým menom", () => {
    for (const m of MENA) {
      jednaSprava(textSmsKalendara(m, verejnyOdkaz(`/k/${TOKEN}`, WORKER), "Terezka"));
      jednaSprava(textSmsFotiek(m, verejnyOdkaz(`/f/${TOKEN}`, WORKER), "Terezka"));
      jednaSprava(textSmsPonuky(m.split(" ")[0], verejnyOdkaz(`/t/${TOKEN}`, WORKER), "Terezka"));
    }
  });

  it("v šablónach nie je dlhá pomlčka — tá zhadzuje limit rovnako ako mäkčeň", () => {
    expect(textSmsKalendara("Michal Knapčok", "https://x.cz/k/a", "Filip")).toBe(
      "Michale, vase treninky si muzete dat do kalendare v mobilu - pripomene vam je sam: https://x.cz/k/a Filip",
    );
  });

  it("fotky oslovujú v 5. páde", () => {
    expect(textSmsFotiek("Michal Knapčok", "https://x.cz/f/a", "Filip")).toBe("Ahoj Michale, posilam ti srovnani tvych fotek: https://x.cz/f/a Filip");
    expect(textSmsFotiek("", "https://x.cz/f/a", "")).toBe("Ahoj, posilam ti srovnani tvych fotek: https://x.cz/f/a");
  });
});

describe("hromadná správa", () => {
  it("{meno} je 5. pád bez diakritiky", () => {
    expect(zlozHromadnuSms("Ahoj {meno}, mas 2 minuty?", "Kateřina Mátlová")).toBe("Ahoj Katerino, mas 2 minuty?");
    expect(zlozHromadnuSms("{MENO}!", "Tomáš Novák")).toBe("Tomasi!");
    expect(dlzkaSpravy(zlozHromadnuSms("Ahoj {meno}", "Kateřina Mátlová")).unicode).toBe(false);
  });
  it("neisté meno ostáva v 1. páde, ale bez diakritiky", () => {
    expect(oslovenieDoSms("Natália Pečková")).toBe("Natalia");
  });
});

describe("druh SMS v audite", () => {
  /** `sms-odoslana` umlčí „balíček minutý" a vyradí z kroku 2 · SMS. */
  it("SMS okolo úvodného NIE JE správa o hodinách (Radka Kovaříková, 31. 10.)", () => {
    expect(akciaSmsAuditu({ druh: "uvodny" })).toBe("sms-uvodny");
  });
  it("každý druh mimo hodín má vlastnú akciu, nikdy `sms-odoslana`", () => {
    for (const druh of DRUHY_SMS_MIMO_HODIN) expect(akciaSmsAuditu({ druh })).toBe(`sms-${druh}`);
    expect(akciaSmsAuditu({ hromadna: true })).toBe("sms-hromadna");
    expect(akciaSmsAuditu({ dotaznik: true, druh: "uvodny" })).toBe("sms-dotaznik");
  });
  it("správa o hodinách a neznámy druh ostávajú `sms-odoslana`", () => {
    expect(akciaSmsAuditu({})).toBe("sms-odoslana");
    expect(akciaSmsAuditu({ druh: "cokolvek" })).toBe("sms-odoslana");
    // Z tela požiadavky sa nedá podstrčiť vlastný názov akcie.
    expect(akciaSmsAuditu({ druh: "brana-nastavena" })).toBe("sms-odoslana");
  });
});

describe("krátka adresa /a/", () => {
  it("kým ju snippet 26 nepozná, ide na workera (inak 404)", () => {
    expect(verejnyOdkaz(`/a/${TOKEN}`, WORKER)).toBe(`${WORKER}/a/${TOKEN}`);
  });
});

describe("náhľad odkazu /v/", () => {
  it("?nahlad=1 sa nepočíta bez ohľadu na prihlásenie", () => {
    expect(jeNahladTrenera(new URL(`${WORKER}/v/abc?nahlad=1`))).toBe(true);
    expect(jeNahladTrenera(new URL(`${WORKER}/v/abc`))).toBe(false);
    expect(jeNahladTrenera(new URL(`${WORKER}/v/abc?nahlad=0`))).toBe(false);
  });
});
