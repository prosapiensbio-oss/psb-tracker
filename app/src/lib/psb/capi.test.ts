import { describe, expect, it } from "bun:test";

import { hash, normEmail, normTelefon, telo } from "./capi";

describe("normalizácia pred hašovaním", () => {
  it("e-mail sa oreže a zmenší", () => {
    // „Jan@Novak.CZ " a „jan@novak.cz" musia dať ten istý odtlačok, inak sa
    // človek nespáruje a celé to nemá zmysel.
    expect(normEmail("  Jan@Novak.CZ ")).toBe("jan@novak.cz");
  });

  it("deväťciferné číslo dostane predvoľbu", () => {
    // České a slovenské čísla sa píšu bez nej; Meta bez predvoľby nespáruje nič.
    expect(normTelefon("777 123 456")).toBe("420777123456");
    expect(normTelefon("+420 777 123 456")).toBe("420777123456");
    expect(normTelefon("00420777123456")).toBe("420777123456");
  });

  it("slovenské číslo si vie vypýtať vlastnú predvoľbu", () => {
    expect(normTelefon("911222333", "421")).toBe("421911222333");
  });

  it("prázdny alebo nezmyselný telefón nevyrobí odpad", () => {
    expect(normTelefon("")).toBe("");
    expect(normTelefon("—")).toBe("");
  });
});

describe("telo udalosti", () => {
  const zaklad = { id: "web-2026-09-01-jan@novak.cz", email: "Jan@Novak.cz", telefon: "777123456", stranka: "https://prosapiens.cz/uvodni-trenink/" };

  it("posiela odtlačky, nie samotné údaje", async () => {
    const t = await telo(zaklad);
    const ud = t.data[0].user_data as Record<string, string[]>;
    expect(ud.em[0]).toBe(await hash("jan@novak.cz"));
    expect(ud.em[0]).not.toContain("novak");
    expect(ud.ph[0]).toBe(await hash("420777123456"));
  });

  it("meno sa neposiela vôbec", async () => {
    const t = await telo(zaklad);
    const ud = t.data[0].user_data as Record<string, unknown>;
    expect(ud.fn).toBeUndefined();
    expect(ud.ln).toBeUndefined();
  });

  it("event_id je kľúč dopytu — dvojklik sa nezapočíta dvakrát", async () => {
    const t = await telo(zaklad);
    expect(t.data[0].event_id).toBe(zaklad.id);
  });

  it("čas je v sekundách, nie milisekundách", async () => {
    const t = await telo({ ...zaklad, cas: 1_780_000_000 });
    expect(t.data[0].event_time).toBe(1_780_000_000);
    // Bez zadania musí byť tiež v sekundách — desaťmiestne číslo, nie trinásť.
    const auto = await telo(zaklad);
    expect(String(auto.data[0].event_time)).toHaveLength(10);
  });

  it("technické údaje idú NEZAHAŠOVANÉ", async () => {
    const t = await telo({ ...zaklad, fbc: "fb.1.123.abc", fbp: "fb.1.456.def", ip: "1.2.3.4", userAgent: "Mozilla/5.0" });
    const ud = t.data[0].user_data as Record<string, string>;
    expect(ud.fbc).toBe("fb.1.123.abc");
    expect(ud.fbp).toBe("fb.1.456.def");
    expect(ud.client_ip_address).toBe("1.2.3.4");
  });

  it("chýbajúci telefón kľúč `ph` nevyrobí", async () => {
    const t = await telo({ ...zaklad, telefon: "" });
    expect((t.data[0].user_data as Record<string, unknown>).ph).toBeUndefined();
  });

  it("testovací kód sa pridá len keď je zadaný", async () => {
    expect(await telo(zaklad)).not.toHaveProperty("test_event_code");
    expect(await telo(zaklad, "TEST47084")).toHaveProperty("test_event_code", "TEST47084");
  });

  it("bez adresy sa `event_source_url` neposiela prázdne", async () => {
    const t = await telo({ ...zaklad, stranka: "" });
    expect(t.data[0]).not.toHaveProperty("event_source_url");
  });
});
