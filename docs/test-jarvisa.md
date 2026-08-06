# Test Jarvisa

Pusti ho po **každej zmene systémového promptu** (`app/src/routes/api/chat.ts`)
alebo kontextu (`app/src/lib/psb/aiContext.ts`).

Dôvod: 2026-08-06 sme opravili jednu chybu a rovno zaviedli druhú. Hrubý zisk
hlásil 168 500 namiesto 153 944; po „oprave" hlásil 132 200. Obe znelo
sebavedomo. Bez testu po nasadení by to bežalo mesiace.

## Prompt pre Clauda

> Pusti test Jarvisa podľa `docs/test-jarvisa.md`. Otázky sú v tom súbore.
> Ku každej numerickej otázke si najprv vytiahni správnu odpoveď z databázy
> (`website_db`), aby si mal proti čomu merať — nehodnoť „znie to rozumne".
> Výsledky mi zhrň po kategóriách a oddeľ CHYBU (odpovedal zle) od CHÝBAJÚCEJ
> FUNKCIE (nemá ako odpovedať). Nič neklikaj — akcie iba vypíš, nespúšťaj.

## Ako sa púšťa

Beží v prehliadači nad živou appkou, kde je prihlásená relácia. Kontext sa
zachytí z jedného skutočného volania (appka ho na `window` nevystavuje):

```js
// 1) odchyt kontextu
if (!window.__origFetch) window.__origFetch = window.fetch;
window.fetch = function (u, o) {
  try { if (String(u).includes('/api/chat') && o?.body) { const b = JSON.parse(o.body); if (b.context) window.__psbCtx = b.context; } } catch (e) {}
  return window.__origFetch.apply(this, arguments);
};
// …teraz pošli Jarvisovi hocijakú správu cez UI, aby sa kontext zachytil…

// 2) bežec — každá otázka je SAMOSTATNÝ rozhovor, inak by sa odpovede
//    ovplyvňovali a test by meral pamäť, nie schopnosť
window.__jarvisTest = async function (otazky, ctx) {
  const out = [];
  for (const [i, q] of otazky.entries()) {
    let text = "";
    const r = await window.__origFetch("/api/chat", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: q }], context: ctx, deep: false }),
    });
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const casti = buf.split("\n\n"); buf = casti.pop() || "";
      for (const c of casti) {
        const line = c.replace(/^data: /, "").trim(); if (!line) continue;
        try { const o = JSON.parse(line); if (typeof o.t === "string") text += o.t; } catch (e) {}
      }
    }
    const akcie = [...text.matchAll(/```psb-action\s*([\s\S]*?)```/g)].map((m) => m[1].trim());
    const cisty = text.replace(/```psb-action[\s\S]*?```/g, "").trim();
    out.push({ i, q, slov: cisty.split(/\s+/).filter(Boolean).length, akcie, odpoved: cisty });
    window.__jarvisVysledky = out;
    window.__jarvisProgress = `${i + 1}/${otazky.length}`;
  }
  return out.length;
};
window.__jarvisTest(window.__otazky, window.__psbCtx);
```

Trvá ~20 minút na 40 otázok. Priebeh: `window.__jarvisProgress`.

## Na čo sa pozerať

| Kategória | Kritérium |
|---|---|
| Faktografia | číslo sedí s databázou **do koruny**, nie „približne" |
| Pasce domény | mzdové hodiny bez úvodných · zisk z POSLANÉHO, nie z nároku · dlh cez 850 Kč/h, nie cez cenu sedenia · mesiace do jún 26 z Excelu, nie z banky |
| Dĺžka | priemer ≤ 60 slov; dlhšie len pri vyžiadanom rozbore |
| Akcie | správny `key`, správny mesiac, **veta pred blokom** |
| Neznalosť | prizná, neponúkne vymyslené číslo, povie čo by sa muselo merať |
| Odkazy | `⟦text\|tab\|sub⟧` namiesto opisu cesty slovami |

## Otázky (40)

Faktografia: mzdové hodiny Jerry/Terezka júl · počet sedení · úvodné · tržby ·
aktívni klienti · kto mal najviac sedení · nájom jún · hrubý zisk júl ·
hodiny týždenne Terezka

Editácia: appka za 780 v apríli → oprav · poznámka k Balážovi · pauza Novák ·
nájom júl na nulu · zmena trénera u Doležalovej

Navigácia: tempo klienta · dlh voči trénerom · zrušené tréningy · upload CSV ·
cena sedenia

Rozbor: 99 → 120 hodín · dlh za pol roka · kto odchádza · kde tečie ·
+10 % tržby · oplatí sa Instagram

Neznalosť: letáky · spokojnosť · zrušené v júli · konkurencia · NPS ·
odchody kvôli cene

Akcie: uzavri nájom · odlož Vankovú o 2 týždne · kronika zdraženie ·
skry všetky o nechodení

Formulácia: koľko klientov · 10 nápadov na obsah · „jakub stigut" (diakritika) ·
najhorší mesiac
