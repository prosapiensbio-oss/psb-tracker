/**
 * ZÁSOBNÍK SNÍMOK — spoločný pre video editor a fotkový editor.
 *
 * Video editor sem ukladá snímky („screenshot" momentu z videa), fotkový
 * editor si ich odtiaľ berie do polovíc. V prehliadači je to IndexedDB, takže
 * snímky prežijú aj zatvorenie stránky. V Kokpite bude namiesto toho
 * kartotéka klienta (zašifrovaná v R2).
 *
 * Keď IndexedDB nejde (súkromné okno, niektoré náhľady), drží sa zásobník
 * aspoň v pamäti stránky — a povie to.
 */
window.skladSnimok = (() => {
  let dbP = null;
  let pamat = null; // náhradný zásobník, keď IndexedDB nejde
  let dalsieId = 1;
  const kanal = (() => { try { return new BroadcastChannel("skladacka-snimky"); } catch { return null; } })();
  const db = () => dbP || (dbP = new Promise((res, rej) => {
    try {
      const r = indexedDB.open("skladacka", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("snimky", { keyPath: "id", autoIncrement: true });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }));
  const poziadavka = async (mod, f) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction("snimky", mod);
      const r = f(t.objectStore("snimky"));
      t.oncomplete = () => res(r?.result);
      t.onerror = () => rej(t.error);
    });
  };
  const ohlas = () => { try { kanal?.postMessage("zmena"); } catch { /* nič */ } };
  const naPamat = () => { if (!pamat) pamat = []; return pamat; };

  return {
    /** { blob, den, cas, zdroj, oznacenie } → id */
    async pridaj(z) {
      const zaznam = { ...z, vytvorene: new Date().toISOString() };
      try { const id = await poziadavka("readwrite", (s) => s.add(zaznam)); ohlas(); return id; }
      catch { const id = dalsieId++; naPamat().push({ ...zaznam, id }); return id; }
    },
    async vsetky() {
      try { return (await poziadavka("readonly", (s) => s.getAll())) || []; }
      catch { return naPamat().slice(); }
    },
    async zmaz(id) {
      try { await poziadavka("readwrite", (s) => s.delete(id)); ohlas(); }
      catch { pamat = naPamat().filter((x) => x.id !== id); }
    },
    /** Zavolá f, keď druhá stránka (editor) zásobník zmení. */
    priZmene(f) {
      kanal?.addEventListener("message", f);
      addEventListener("focus", f);
    },
    get lenVPamati() { return pamat !== null; },
  };
})();
