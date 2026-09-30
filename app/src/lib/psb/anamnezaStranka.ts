/**
 * VEREJNÁ STRÁNKA ANAMNÉZY — HTML sa sádže na serveri.
 *
 * Tá istá zásada ako pri maili klientovi: z prehliadača chodia len ÚDAJE,
 * stránku skladá worker. Je to formulár o zdraví, ktorý vypĺňa cudzí človek;
 * čím menej sa dá po ceste dopísať, tým lepšie.
 *
 * Sadzba je zámerne tá istá ako v maili (FARBY_MAILU) — klient práve dostal
 * odkaz od tej istej značky a nemá mať pocit, že preklikol inam.
 */

import { FARBY_MAILU } from "./mailKlientovi";
import { OBLASTI, type Formular, type Otazka } from "./anamnezaFormular";

const F = FARBY_MAILU;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type VstupStranky = {
  formular: Formular;
  klient: string;
  /** Riadok „toto o vás vieme" — bez písania, len na potvrdenie. */
  kontakt: { email?: string | null; telefon?: string | null; narodeniny?: string | null };
  /** Deň a čas úvodného tréningu z kalendára, keď ho appka pozná. */
  uvodny?: string | null;
  /** Už odoslané? Potom sa formulár nekreslí, len poďakovanie. */
  hotovo?: boolean;
  chyba?: string;
};

const STYL = `
  *{box-sizing:border-box}
  body{margin:0;background:${F.pozadie};color:${F.text};font:15px/1.6 Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
  .obal{max-width:480px;margin:0 auto;padding:34px 18px 60px}
  .znacka{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${F.slaba};text-align:center}
  h1{font-size:26px;font-weight:700;margin:12px 0 0;text-align:center;letter-spacing:-.3px}
  .lead{font-size:14px;color:${F.slaba};text-align:center;margin:8px 0 0}
  .viem{margin-top:20px;padding:13px 15px;border-radius:11px;background:${F.karta};font-size:13px;line-height:1.75}
  .viem b{color:${F.text}}
  .viem span{color:${F.slaba}}
  fieldset{border:0;margin:26px 0 0;padding:0}
  legend{padding:0;font-size:16px;line-height:1.4}
  .pomoc{font-size:12.5px;color:${F.slaba};margin-top:5px}
  .volby{margin-top:11px;display:flex;flex-direction:column;gap:2px}
  label.v{display:flex;gap:11px;align-items:flex-start;padding:9px 11px;border-radius:9px;cursor:pointer;background:${F.karta};font-size:14px;line-height:1.4}
  label.v:hover{background:${F.linka}}
  label.v input{margin:3px 0 0;accent-color:${F.platba};width:16px;height:16px;flex:0 0 auto}
  input[type=text],input[type=number],textarea{width:100%;padding:11px 12px;border-radius:9px;border:1px solid ${F.linka};background:${F.karta};color:${F.text};font:inherit;font-size:14px}
  textarea{min-height:82px;resize:vertical}
  .oblast{background:${F.karta};border-radius:9px;padding:9px 11px;margin-bottom:2px}
  .oblast .hlava{display:flex;gap:11px;align-items:center;font-size:14px;cursor:pointer}
  .oblast input[type=checkbox]{accent-color:${F.platba};width:16px;height:16px}
  .sila{margin-top:9px;padding-top:9px;border-top:1px solid ${F.linka}}
  .sila .popis{font-size:12px;color:${F.slaba};margin-bottom:7px}
  .stupnica{display:flex;gap:4px;flex-wrap:wrap}
  .stupnica label{flex:1;min-width:26px}
  .stupnica input{position:absolute;opacity:0;pointer-events:none}
  .stupnica span{display:block;text-align:center;padding:6px 0;border-radius:6px;border:1px solid ${F.linka};font-size:12.5px;color:${F.slaba};cursor:pointer}
  .stupnica input:checked+span{background:${F.platba};border-color:${F.platba};color:${F.platbaText};font-weight:700}
  .suhlasy{margin-top:28px;padding-top:20px;border-top:1px solid ${F.linka};display:flex;flex-direction:column;gap:13px}
  .suhlas{display:flex;gap:11px;align-items:flex-start;font-size:12.5px;line-height:1.55;color:${F.text}}
  .suhlas input{margin:2px 0 0;accent-color:${F.platba};width:16px;height:16px;flex:0 0 auto}
  .suhlas a{color:${F.platba}}
  .suhlas em{display:block;font-style:normal;color:${F.slaba};font-size:11.5px;margin-top:2px}
  button{margin-top:24px;width:100%;padding:14px;border:0;border-radius:10px;background:${F.platba};color:${F.platbaText};font:inherit;font-size:15px;font-weight:700;cursor:pointer}
  button:disabled{opacity:.5;cursor:not-allowed}
  .chyba{margin-top:14px;padding:11px 13px;border-radius:9px;background:rgba(226,160,127,.14);color:${F.minus};font-size:13px}
  .pata{margin-top:26px;text-align:center;font-size:11.5px;color:${F.slabsia};line-height:1.7}
  .hotovo{margin-top:40px;text-align:center}
  .hotovo .fajka{font-size:40px;color:${F.platba}}
  [hidden]{display:none!important}
`;

function otazkaHtml(o: Otazka): string {
  const vetva = o.vetva ? ` data-ked="${esc(o.vetva.otazka)}" data-hodnoty="${esc(o.vetva.hodnoty.join("|"))}"` : "";
  let vnutro = "";

  if (o.typ === "jedna" || o.typ === "viac") {
    const druh = o.typ === "jedna" ? "radio" : "checkbox";
    vnutro = `<div class="volby">${(o.moznosti || []).map((m) => `
      <label class="v"><input type="${druh}" name="${esc(o.id)}" value="${esc(m)}"><span>${esc(m)}</span></label>`).join("")}</div>`;
  } else if (o.typ === "ano-nie") {
    vnutro = `<div class="volby">
      <label class="v"><input type="radio" name="${esc(o.id)}" value="Ano"><span>Ano</span></label>
      <label class="v"><input type="radio" name="${esc(o.id)}" value="Ne"><span>Ne</span></label>
    </div>
    <div data-ked="${esc(o.id)}" data-hodnoty="Ano" hidden style="margin-top:9px">
      <input type="text" name="${esc(o.id)}_popis" placeholder="co přesně vám zakázal?">
    </div>`;
  } else if (o.typ === "oblasti") {
    // Zaškrtnutá oblasť si otvorí VLASTNÚ stupnicu. Jerry, 30. 9. 2026:
    // „keby vyberiem 3 oblasti, mohli by sa vytvoriť tri stupnice."
    vnutro = OBLASTI.map((m) => `
      <div class="oblast">
        <label class="hlava"><input type="checkbox" name="${esc(o.id)}" value="${esc(m)}" data-oblast="${esc(m)}"><span>${esc(m)}</span></label>
        <div class="sila" data-sila="${esc(m)}" hidden>
          <div class="popis">Jak silné to je, když je to nejhorší? (0 = žádná, 10 = nejhorší, jakou znám)</div>
          <div class="stupnica">${Array.from({ length: 11 }, (_, i) => `
            <label><input type="radio" name="sila_${esc(m)}" value="${i}"><span>${i}</span></label>`).join("")}</div>
        </div>
      </div>`).join("");
  } else if (o.typ === "dlhy") {
    vnutro = `<textarea name="${esc(o.id)}" placeholder="napište pár vět…"></textarea>`;
  } else {
    vnutro = `<input type="${o.typ === "cislo" ? "number" : "text"}" name="${esc(o.id)}">`;
  }

  return `<fieldset data-otazka="${esc(o.id)}"${vetva}${o.vetva ? " hidden" : ""}>
    <legend>${esc(o.text)}${o.povinna ? "" : " <span style=\"color:" + F.slabsia + ";font-size:13px\">(nepovinné)</span>"}</legend>
    ${o.pomoc ? `<div class="pomoc">${esc(o.pomoc)}</div>` : ""}
    ${vnutro}
  </fieldset>`;
}

export function strankaHtml(v: VstupStranky): string {
  const sekcia = v.formular.klient[0];
  const krstne = esc((v.klient || "").split(" ")[0]);

  const telo = v.hotovo
    ? `<div class="hotovo">
        <div class="fajka">✓</div>
        <h1 style="margin-top:10px">Máme to</h1>
        <p class="lead">Díky, ${krstne}. Vidíme se na úvodním tréninku${v.uvodny ? ` — ${esc(v.uvodny)}` : ""}.</p>
      </div>`
    : `<form method="post" id="f">
        <div class="viem">
          <b>${esc(v.klient)}</b><br>
          <span>${[v.kontakt.email, v.kontakt.telefon].filter(Boolean).map(esc).join(" · ")}</span>
          ${v.uvodny ? `<br><span>úvodní trénink: ${esc(v.uvodny)}</span>` : ""}
          <br><span style="font-size:11.5px">Nesedí něco? Napište nám, opravíme to.</span>
        </div>
        ${sekcia.otazky.map(otazkaHtml).join("")}
        <div class="suhlasy">
          <label class="suhlas"><input type="checkbox" name="suhlas_podmienky" required>
            <span>Souhlasím s <a href="https://www.prosapiens.cz/obchodni-podminky/" target="_blank" rel="noopener">obchodními podmínkami</a>.</span></label>
          <label class="suhlas"><input type="checkbox" name="suhlas_gdpr" required>
            <span>Souhlasím se zpracováním osobních údajů a údajů o zdravotním stavu podle <a href="https://www.prosapiens.cz/gdpr/" target="_blank" rel="noopener">zásad GDPR</a>, včetně fotografií držení těla pro potřeby mého tréninku.
            <em>Fotky zůstávají v naší kartotéce a nikde se nezveřejňují.</em></span></label>
          <label class="suhlas"><input type="checkbox" name="suhlas_newsletter">
            <span>Chci dostávat newsletter.<em>Nepovinné.</em></span></label>
        </div>
        ${v.chyba ? `<div class="chyba">${esc(v.chyba)}</div>` : ""}
        <button type="submit" id="odoslat">Odeslat</button>
        <div class="pata">ProSapiens Biomechanic<br>Odpovědi vidí jen váš trenér.</div>
      </form>`;

  return `<!doctype html><html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Než přijdete — ProSapiens</title>
<style>${STYL}</style>
</head><body><div class="obal">
<div class="znacka">ProSapiens Biomechanic</div>
${v.hotovo ? "" : `<h1>Než přijdete</h1><p class="lead">${esc(sekcia.pozn || "")}</p>`}
${telo}
</div>
<script>
(function () {
  var f = document.getElementById("f");
  if (!f) return;

  // Hodnoty jednej otázky — rádio aj zaškrtávačky naraz.
  function hodnoty(meno) {
    var out = [];
    f.querySelectorAll('[name="' + meno + '"]').forEach(function (i) {
      if ((i.type === "radio" || i.type === "checkbox") && i.checked) out.push(i.value);
    });
    return out;
  }

  // Vetvenie: ukáž len to, čo sa daného človeka týka. „*" znamená
  // čokoľvek okrem „nic z toho" — tak sa pýta doplnenie k vlajkám.
  function prekresli() {
    f.querySelectorAll("[data-ked]").forEach(function (el) {
      var h = hodnoty(el.getAttribute("data-ked"));
      var chcene = (el.getAttribute("data-hodnoty") || "").split("|");
      var vidno = chcene.indexOf("*") >= 0
        ? h.some(function (x) { return x && x !== "nic z toho"; })
        : h.some(function (x) { return chcene.indexOf(x) >= 0; });
      el.hidden = !vidno;
      // Skrytá otázka nesmie blokovať odoslanie povinnosťou.
      el.querySelectorAll("input,textarea").forEach(function (i) { i.disabled = !vidno; });
    });
    // Stupnica patrí k zaškrtnutej oblasti, nie ku všetkým.
    f.querySelectorAll("[data-oblast]").forEach(function (i) {
      var s = f.querySelector('[data-sila="' + i.getAttribute("data-oblast") + '"]');
      if (s) s.hidden = !i.checked;
    });
    // „nic z toho" vylučuje ostatné vlajky a naopak.
    var nic = f.querySelector('input[value="nic z toho"]');
    if (nic) {
      f.querySelectorAll('[name="' + nic.name + '"]').forEach(function (i) {
        if (i !== nic && nic.checked) i.checked = false;
      });
    }
  }

  f.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.value !== "nic z toho" && t.checked) {
      var nic = f.querySelector('input[value="nic z toho"]');
      if (nic && nic.name === t.name) nic.checked = false;
    }
    prekresli();
  });
  prekresli();

  f.addEventListener("submit", function () {
    var b = document.getElementById("odoslat");
    if (b) { b.disabled = true; b.textContent = "Odesílám…"; }
  });
})();
</script>
</body></html>`;
}
