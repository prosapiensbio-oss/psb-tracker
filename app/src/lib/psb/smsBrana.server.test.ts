import { afterEach, describe, expect, it } from "bun:test";

import { posliSms } from "./smsBrana.server";

/**
 * Brána sa v teste nevolá — kontroluje sa TVAR požiadavky.
 *
 * Toto je presne to miesto, kde chyba nič nezhodí: odpoveď príde, appka
 * povie „odoslané" a klientovi buď nepríde nič, alebo príde text bez
 * diakritiky. Preto sa tu drží každé pole, ktoré ich API vyžaduje.
 */
const povodny = globalThis.fetch;
afterEach(() => { globalThis.fetch = povodny; });

function odchyt(odpoved: unknown, stav = 200) {
  const zachytene: { url: string; hlavicky: Record<string, string>; telo: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    zachytene.push({
      url: String(url),
      hlavicky: (init.headers || {}) as Record<string, string>,
      telo: JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(odpoved), { status: stav, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return zachytene;
}

const ucet = { druh: "smsmanager", kluc: "TAJNE", odosielatel: "" };

describe("posliSms — SMS Manager v2", () => {
  it("posiela na v2, kľúč ide v hlavičke a číslo bez plusu", async () => {
    const z = odchyt({ request_id: "r1", accepted: [{ message_id: "m1" }] });
    const v = await posliSms(ucet, "+420777123456", "Ahoj");
    expect(v).toEqual({ ok: true, id: "m1" });
    expect(z[0].url).toBe("https://api.smsmngr.com/v2/message");
    expect(z[0].hlavicky["x-api-key"]).toBe("TAJNE");
    expect(z[0].telo.to).toEqual([{ phone_number: "420777123456" }]);
  });

  it("drží utf a transactional — bez nich mizne diakritika a platí okno 8-20", async () => {
    const z = odchyt({ request_id: "r1", accepted: [{ message_id: "m1" }] });
    await posliSms(ucet, "+420777123456", "Zostávajú 2 h");
    expect(z[0].telo.tag).toBe("transactional");
    expect((z[0].telo.flow as { sms: Record<string, unknown> }[])[0].sms.type).toBe("utf");
    expect(z[0].telo.body).toBe("Zostávajú 2 h");
  });

  it("odosielateľa pridá len keď je nastavený", async () => {
    const bez = odchyt({ request_id: "r1", accepted: [{ message_id: "m1" }] });
    await posliSms(ucet, "+420777123456", "Ahoj");
    expect((bez[0].telo.flow as { sms: Record<string, unknown> }[])[0].sms.sender).toBeUndefined();

    const s = odchyt({ request_id: "r1", accepted: [{ message_id: "m1" }] });
    await posliSms({ ...ucet, odosielatel: "ProSapiens" }, "+420777123456", "Ahoj");
    expect((s[0].telo.flow as { sms: Record<string, unknown> }[])[0].sms.sender).toBe("ProSapiens");
  });

  it("chybu povie slovami brány, nikdy nie kľúčom", async () => {
    odchyt({ message: "Insufficient credit" }, 402);
    const v = await posliSms(ucet, "+420777123456", "Ahoj");
    expect(v.ok).toBe(false);
    expect(v.chyba).toBe("Insufficient credit");
    expect(v.chyba).not.toContain("TAJNE");
  });

  it("bez kľúča sa nikam nevolá", async () => {
    const z = odchyt({});
    const v = await posliSms({ ...ucet, kluc: "" }, "+420777123456", "Ahoj");
    expect(v.ok).toBe(false);
    expect(z).toHaveLength(0);
  });
});
