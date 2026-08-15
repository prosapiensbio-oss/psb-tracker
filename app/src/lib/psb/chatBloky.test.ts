import { describe, expect, test } from "bun:test";

import { blokyNaSpravu } from "./chatBloky";

/**
 * Chyba v skládaní správy sa neprejaví pri písaní ani pri builde — až naživo
 * v rozhovore, buď chybou z API, alebo tichou stratou kontextu. Preto testy.
 */

describe("vlastné bloky sa skládajú z častí", () => {
  test("text prejde", () => {
    expect(blokyNaSpravu([{ type: "text", text: "ahoj" }]))
      .toEqual([{ type: "text", text: "ahoj" }]);
  });

  test("thinking si nesie podpis", () => {
    // Podpis je to, čím server overuje, že úvaha nebola upravená. Bez neho
    // API správu odmietne.
    const v = blokyNaSpravu([{ type: "thinking", thinking: "hm", signature: "sig123" }]);
    expect(v).toEqual([{ type: "thinking", thinking: "hm", signature: "sig123" }]);
  });

  test("tool_use sa poskládá z prúdu JSON-u", () => {
    const v = blokyNaSpravu([
      { type: "tool_use", id: "t1", name: "dopyt_db", _json: '{"sql":"SELECT 1"}' },
    ]);
    expect(v).toEqual([{ type: "tool_use", id: "t1", name: "dopyt_db", input: { sql: "SELECT 1" } }]);
  });

  test("pokazený JSON nezhodí správu", () => {
    const v = blokyNaSpravu([{ type: "tool_use", id: "t1", name: "x", _json: "{neplatn" }]);
    expect(v).toEqual([{ type: "tool_use", id: "t1", name: "x", input: {} }]);
  });
});

describe("serverové bloky sa vracajú BEZ ZMENY", () => {
  test("server_tool_use ide cez _raw", () => {
    // Toto je celý dôvod, prečo funkcia existuje: starý map by z toho urobil
    // { type: "text", text: undefined } a rozhovor by spadol.
    const raw = { type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "trenér brno" } };
    expect(blokyNaSpravu([{ type: "server_tool_use", _raw: raw }])).toEqual([raw]);
  });

  test("výsledok hľadania ide cez _raw vrátane obsahu", () => {
    const raw = {
      type: "web_search_tool_result",
      tool_use_id: "srv1",
      content: [{ type: "web_search_result", url: "https://x.cz", title: "X" }],
    };
    expect(blokyNaSpravu([{ type: "web_search_tool_result", _raw: raw }])).toEqual([raw]);
  });

  test("neznámy typ bloku sa nepremení na text", () => {
    // Keď Anthropic pridá nový typ, má prejsť nezmenený — nie potichu
    // skončiť ako text s prázdnym obsahom.
    const raw = { type: "nieco_nove_20270101", data: "x" };
    expect(blokyNaSpravu([{ type: "nieco_nove_20270101", _raw: raw }])).toEqual([raw]);
  });
});

describe("prázdny text sa zahodí", () => {
  test("blok bez textu do správy nepatrí", () => {
    // API odmieta prázdne textové bloky. Pri odpovedi, ktorá je zatiaľ celá
    // z hľadania, by inak vznikol neplatný obsah.
    expect(blokyNaSpravu([{ type: "text", text: "" }])).toEqual([]);
    expect(blokyNaSpravu([{ type: "text" }])).toEqual([]);
  });

  test("prázdne miesta v poli sa preskočia", () => {
    expect(blokyNaSpravu([undefined, { type: "text", text: "a" }, undefined]))
      .toEqual([{ type: "text", text: "a" }]);
  });
});

describe("celé kolo s hľadaním", () => {
  test("úvaha, hľadanie, výsledok a text v správnom poradí", () => {
    const srv = { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } };
    const res = { type: "web_search_tool_result", tool_use_id: "s1", content: [] };
    const v = blokyNaSpravu([
      { type: "thinking", thinking: "overím to", signature: "sg" },
      { type: "server_tool_use", _raw: srv },
      { type: "web_search_tool_result", _raw: res },
      { type: "text", text: "Našel som toto." },
    ]);
    expect(v).toHaveLength(4);
    expect(v[1]).toEqual(srv);
    expect(v[2]).toEqual(res);
    expect(v[3]).toEqual({ type: "text", text: "Našel som toto." });
  });
});
