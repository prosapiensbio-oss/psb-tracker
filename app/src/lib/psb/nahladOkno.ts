/**
 * NÁHĽAD ODKAZU V ŠÍRKE TELEFÓNU (Jerry, 16. 10. 2026: „verím, že to funguje
 * naprieč všetkými odkazmi"). „Pozrieť, čo uvidí" otváral stránku v novej
 * karte — na počítači roztiahnutú na celú šírku, takže pôsobila inak než
 * u klienta v telefóne.
 *
 * OD 27. 10. 2026 JE TO VRSTVA V APPKE S KRÍŽIKOM, NIE NOVÉ OKNO. Jerry:
 * „keď si otvorím náhľad odkazu, nie je tam krok späť ani krížik a musím
 * celú appku zavrieť." Kokpit na telefóne beží ako appka na ploche a tam
 * `window.open` otvorí stránku v tom istom okne bez lišty — cesta späť
 * neexistuje. Vrstva s rámikom má krížik vždy, zavrie ju aj Esc a klik
 * vedľa; na počítači má šírku telefónu (390 px), na telefóne celú obrazovku.
 *
 * Vrstva sa stavia mimo Reactu priamo v `document.body` — volá sa z piatich
 * obrazoviek a vnútri Workspace by `position: fixed` platilo voči karte
 * (pravidlo z 12. 10. 2026).
 */
export const SIRKA_TELEFONU = 390;

/** Odkaz z SMS ide cez prosapiens.cz (presmerovanie na webe) — rámik smie len vlastnú adresu. */
export function adresaNahladu(url: string): string {
  const cesta = url.replace(/^https?:\/\/(www\.)?prosapiens\.cz(?=\/)/, "");
  if (/[?&]nahlad=1\b/.test(cesta)) return cesta;
  return `${cesta}${cesta.includes("?") ? "&" : "?"}nahlad=1`;
}

export function otvorNahlad(e: { preventDefault: () => void }, url: string): void {
  e.preventDefault();
  if (typeof document === "undefined") return;
  document.getElementById("psb-nahlad")?.remove();
  const adresa = adresaNahladu(url);
  const uzke = window.matchMedia("(max-width: 640px)").matches;

  const vrstva = document.createElement("div");
  vrstva.id = "psb-nahlad";
  vrstva.setAttribute("role", "dialog");
  vrstva.setAttribute("aria-label", "Náhľad toho, čo uvidí klient");
  Object.assign(vrstva.style, {
    position: "fixed", inset: "0", zIndex: "2000", background: "rgba(10, 14, 12, 0.72)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: uzke ? "0" : "16px", boxSizing: "border-box",
  });

  const ram = document.createElement("div");
  Object.assign(ram.style, {
    width: uzke ? "100%" : `${SIRKA_TELEFONU}px`, height: uzke ? "100%" : "min(844px, calc(100vh - 32px))",
    display: "flex", flexDirection: "column", background: "#fff", borderRadius: uzke ? "0" : "18px",
    overflow: "hidden", boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
  });

  const lista = document.createElement("div");
  Object.assign(lista.style, {
    display: "flex", alignItems: "center", gap: "10px", padding: uzke ? "calc(env(safe-area-inset-top) + 8px) 12px 8px" : "8px 12px",
    background: "#1A2E24", color: "#fff", fontFamily: "system-ui, sans-serif", fontSize: "13px", flexShrink: "0",
  });
  const nadpis = document.createElement("span");
  nadpis.textContent = "Takto to uvidí klient";
  nadpis.style.flex = "1";
  const novaKarta = document.createElement("a");
  novaKarta.href = adresa;
  novaKarta.target = "_blank";
  novaKarta.rel = "noreferrer";
  novaKarta.textContent = "↗";
  novaKarta.title = "Otvoriť v novej karte";
  Object.assign(novaKarta.style, { color: "#cfe3d8", textDecoration: "none", fontSize: "16px", padding: "2px 6px" });
  const krizik = document.createElement("button");
  krizik.type = "button";
  krizik.textContent = "✕";
  krizik.setAttribute("aria-label", "Zavrieť náhľad");
  Object.assign(krizik.style, {
    background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", fontSize: "18px", lineHeight: "1",
    width: "36px", height: "36px", borderRadius: "18px", cursor: "pointer",
  });
  lista.append(nadpis, novaKarta, krizik);

  const ramik = document.createElement("iframe");
  ramik.src = adresa;
  ramik.title = "Náhľad odkazu";
  Object.assign(ramik.style, { flex: "1", width: "100%", border: "0", background: "#fff" });

  ram.append(lista, ramik);
  vrstva.append(ram);

  const predtym = document.body.style.overflow;
  const zavri = () => {
    vrstva.remove();
    document.body.style.overflow = predtym;
    window.removeEventListener("keydown", naKlaves);
  };
  const naKlaves = (ev: KeyboardEvent) => { if (ev.key === "Escape") zavri(); };
  krizik.addEventListener("click", zavri);
  vrstva.addEventListener("click", (ev) => { if (ev.target === vrstva) zavri(); });
  window.addEventListener("keydown", naKlaves);
  document.body.style.overflow = "hidden";
  document.body.append(vrstva);
}
