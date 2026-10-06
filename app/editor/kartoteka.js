/**
 * KARTOTÉKA KLIENTA — spoločná pre editor fotiek aj editor videa
 * (Jerry, 6. 10. 2026: „napoj editor na kartotéku klienta, nech sa to ukladá").
 *
 * Klienta vyberá Kokpit nad editorom (karta Editor) a pošle ho správou
 * `psb-klient`. Editor sa naňho pri načítaní spýta sám (`psb-kto-je-klient`),
 * lebo správa z Kokpitu mohla prísť skôr, než tu niekto počúval.
 *
 * Ukladá sa cez to isté `/api/fotky` ako kartotéka v profile — zašifrovane
 * v R2, so súhlasom z anamnézy alebo osobným (ten sa potvrdí tu, otázkou).
 * Po uložení editor ohlási `psb-ulozene` a Kokpit obnoví kartotéku v profile.
 */
window.kartotekaKlienta = (() => {
  let klient = "";
  const poslucháči = new Set();
  const vKokpite = window.parent && window.parent !== window;
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.typ !== "psb-klient") return;
    const meno = String(e.data.meno || "");
    if (meno === klient) return;
    klient = meno;
    for (const f of poslucháči) { try { f(klient); } catch { /* nič */ } }
  });
  if (vKokpite) window.parent.postMessage({ typ: "psb-kto-je-klient" }, location.origin);

  /** Dnešok v Prahe (RRRR-MM-DD) — tak ako ho počíta server. */
  const dnes = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());

  /** Zmenší obrázok na najviac `strana` px dlhšej strany (JPEG) — strop kartotéky je 6 MB. */
  async function zmensi(blob, strana = 2000) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, strana / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const von = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));
    return { blob: von, sirka: c.width, vyska: c.height };
  }

  /**
   * Nahrá súbor ku klientovi. { blob, pohlad, den?, sirka?, vyska?, nazov? }
   * → { ok, id } alebo { ok: false, error }. Pri chýbajúcom súhlase sa spýta.
   */
  async function nahraj(z, osobne = false) {
    if (!klient) return { ok: false, error: "Najprv vyber klienta nad editorom." };
    const fd = new FormData();
    fd.append("klient", klient);
    fd.append("den", z.den || dnes());
    fd.append("pohlad", z.pohlad);
    if (z.sirka) fd.append("sirka", String(z.sirka));
    if (z.vyska) fd.append("vyska", String(z.vyska));
    if (osobne) fd.append("suhlasOsobne", "1");
    fd.append("subor", z.blob, z.nazov || "subor");
    let j;
    try {
      const r = await fetch("/api/fotky", { method: "POST", credentials: "same-origin", body: fd });
      j = await r.json().catch(async () => ({ ok: false, error: `HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` }));
      if (r.status === 403 && !osobne && /súhlas/i.test(j?.error || "")) {
        const ano = confirm(`${klient} nemá v anamnéze súhlas s fotkami.\n\nSúhlasil osobne? Pri uložení sa zapíše, že súhlas bol osobný a kto ho potvrdil.`);
        if (!ano) return { ok: false, error: "Neuložené — chýba súhlas klienta." };
        return nahraj(z, true);
      }
    } catch (e) {
      return { ok: false, error: `Spojenie zlyhalo: ${String(e).slice(0, 160)}` };
    }
    if (!j?.ok) return { ok: false, error: j?.error || "Neuložilo sa." };
    if (vKokpite) window.parent.postMessage({ typ: "psb-ulozene" }, location.origin);
    return j;
  }

  /** Fotky tela klienta (bez výstupov editora) — na vloženie do polovíc. */
  async function fotky() {
    if (!klient) return [];
    const j = await fetch(`/api/fotky?klient=${encodeURIComponent(klient)}`, { credentials: "same-origin" })
      .then((r) => r.json()).catch(() => ({ ok: false }));
    if (!j?.ok) throw new Error(j?.error || "Kartotéka sa nenačítala.");
    return (j.fotky || []).filter((f) => f.pohlad !== "porovnanie" && f.pohlad !== "video");
  }

  return {
    get klient() { return klient; },
    get vKokpite() { return vKokpite; },
    priZmene(f) { poslucháči.add(f); },
    nahraj, fotky, zmensi, dnes,
    adresa: (id) => `/api/fotky?id=${encodeURIComponent(id)}`,
  };
})();
