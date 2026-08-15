/**
 * Skládanie odpovede modelu späť do správy pre ďalšie kolo.
 *
 * PREČO TO NIE JE JEDEN `map` V ROUTE
 *
 * Bolo. A fungovalo, kým mal Jarvis len vlastné nástroje: každý blok bol buď
 * `thinking`, `tool_use`, alebo text — a čokoľvek iné sa dalo bez škody
 * vyhlásiť za text. Hľadanie na webe to zlomilo: pribudli serverové bloky
 * (`server_tool_use`, `web_search_tool_result`), ktoré sa NEDAJÚ poskládať
 * z častí. Musia sa vrátiť presne tak, ako prišli, inak si server nemá ako
 * spárovať, čo už vyhľadal, a rozhovor spadne alebo stratí kontext.
 *
 * Starý `map` by z takého bloku urobil `{ type: "text", text: undefined }` —
 * čo je neplatná správa. Preto je to funkcia s testami: chyba tu sa neprejaví
 * pri písaní ani pri buildoch, len naživo v rozhovore.
 */

/** Blok tak, ako ho poskládal stream. `_raw` je jeho pôvodná podoba. */
export type StreamBlok = {
  type?: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  _json?: string;
  _raw?: unknown;
};

/**
 * Bloky, ktoré patria serveru a vraciame ich nezmenené.
 *
 * Zámerne to nie je zoznam „všetko okrem": keď Anthropic pridá nový typ bloku,
 * chcem, aby prešel cez `_raw` vetvu nižšie a nie aby sa potichu premenil na
 * text. Tento zoznam je pre čitateľa, nie pre podmienku.
 */
export const SERVEROVE_BLOKY = [
  "server_tool_use",
  "web_search_tool_result",
  "web_fetch_tool_result",
] as const;

/** Typy, ktoré vieme poskládať z častí. Všetko ostatné ide cez `_raw`. */
const VLASTNE = new Set(["thinking", "tool_use", "text"]);

export function blokyNaSpravu(bloky: (StreamBlok | undefined)[]): unknown[] {
  const von: unknown[] = [];
  for (const b of bloky) {
    if (!b) continue;

    if (b.type === "thinking") {
      von.push({ type: "thinking", thinking: b.thinking, signature: b.signature });
      continue;
    }

    if (b.type === "tool_use") {
      let input: unknown = {};
      try { input = JSON.parse(b._json || "{}"); } catch { /* nechaj prázdne */ }
      von.push({ type: "tool_use", id: b.id, name: b.name, input });
      continue;
    }

    // Serverový alebo neznámy blok — presne ako prišel, bez skládania.
    if (!VLASTNE.has(String(b.type)) && b._raw) {
      von.push(b._raw);
      continue;
    }

    // Prázdny textový blok API odmieta. Pri odpovedi, ktorá je celá
    // z hľadania a ešte nemá ani slovo, by inak vznikol neplatný obsah.
    const text = b.text || "";
    if (text) von.push({ type: "text", text });
  }
  return von;
}
