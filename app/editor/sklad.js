/**
 * ZÁSOBNÍK SNÍMOK — spoločný pre video editor a fotkový editor.
 *
 * Video editor sem ukladá snímky („screenshot" momentu z videa), fotkový
 * editor si ich odtiaľ berie do polovíc.
 *
 * OD 12. 10. 2026 NA SERVERI (`/api/editor-snimky`, šifrovane v R2). Jerry:
 * „prečo fotky, ktoré upravím v PC, nie sú potom v iPade" — v IndexedDB
 * prehliadača boli len na jednom zariadení. Staré snímky z IndexedDB sa pri
 * prvom spustení prenesú na server a lokálne zmažú.
 *
 * Záznam: { id, den, cas, zdroj, oznacenie, url } — `url` je adresa obrázka
 * (trvalá, dá sa uložiť aj do rozrobeného návrhu). Keď server nejde (bez
 * siete, mimo Kokpitu), drží sa zásobník aspoň v pamäti stránky — a povie to.
 */
window.skladSnimok = (() => {
  let pamat = null; // náhradný zásobník, keď server nejde
  let dalsieId = -1;
  const kanal = (() => { try { return new BroadcastChannel("skladacka-snimky"); } catch { return null; } })();
  const ohlas = () => { try { kanal?.postMessage("zmena"); } catch { /* nič */ } };
  const naPamat = () => { if (!pamat) pamat = []; return pamat; };

  async function server(telo) {
    const r = await fetch("/api/editor-snimky", telo ? { method: "POST", credentials: "same-origin", ...telo } : { credentials: "same-origin" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }
  async function nahraj(z) {
    const fd = new FormData();
    fd.append("subor", z.blob, "snimka.jpg");
    for (const k of ["den", "cas", "zdroj", "oznacenie"]) if (z[k] != null) fd.append(k, String(z[k]));
    return (await server({ body: fd })).id;
  }

  // Jednorazový prenos starých snímok z IndexedDB tohto prehliadača.
  const prenos = (async () => {
    let db;
    try {
      db = await new Promise((res, rej) => {
        const r = indexedDB.open("skladacka", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("snimky", { keyPath: "id", autoIncrement: true });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const stare = await new Promise((res, rej) => {
        const t = db.transaction("snimky", "readonly").objectStore("snimky").getAll();
        t.onsuccess = () => res(t.result || []); t.onerror = () => rej(t.error);
      });
      for (const z of stare.sort((a, b) => a.id - b.id)) {
        if (!z.blob) continue;
        await nahraj(z);
        await new Promise((res) => { const t = db.transaction("snimky", "readwrite"); t.objectStore("snimky").delete(z.id); t.oncomplete = res; t.onerror = res; });
      }
      if (stare.length) ohlas();
    } catch { /* bez IndexedDB alebo bez servera — prenesie sa nabudúce */ }
  })();

  return {
    /** { blob, den, cas, zdroj, oznacenie } → id */
    async pridaj(z) {
      try { const id = await nahraj(z); ohlas(); return id; }
      catch { const id = dalsieId--; naPamat().push({ ...z, id, url: URL.createObjectURL(z.blob) }); return id; }
    },
    async vsetky() {
      await prenos;
      try { return [...(await server()).snimky, ...(pamat || [])]; }
      catch { return naPamat().slice(); }
    },
    async zmaz(id) {
      if (id < 0) { pamat = naPamat().filter((x) => x.id !== id); return; }
      try { await server({ headers: { "content-type": "application/json" }, body: JSON.stringify({ akcia: "zmaz", id }) }); ohlas(); }
      catch { /* nepodarilo sa — zoznam sa obnoví a snímka ostane */ }
    },
    /** Zavolá f, keď druhá stránka (editor) zásobník zmení — alebo sa sem vrátiš z iného zariadenia. */
    priZmene(f) {
      kanal?.addEventListener("message", f);
      addEventListener("focus", f);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) f(); });
    },
    get lenVPamati() { return pamat !== null && pamat.length > 0; },
  };
})();
