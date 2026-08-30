import { useEffect, useMemo, useState } from "react";

import { clanky, prilezitosti, type Dopyt as GscDopytTyp } from "../../lib/psb/google";
import { GSC_DOPYTY, GSC_STRANY, marketingVerzia, WEB_STRANKY } from "../../lib/psb/marketing";
import { obsahPredDopytmi, type Riadok } from "../../lib/psb/obsahDopyt";
import { monthKey } from "../../lib/psb/format";
import { klucHotoveho, planObsahu, rozdelPodlaHotovych, type Navrh, type Vlastnik } from "../../lib/psb/planObsahu";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { AssistantChat } from "./Assistant";
import { Card, Empty, H3, Info } from "./ui";

/**
 * Čo publikovať ďalej.
 *
 * PREČO JE TO PRVÁ KARTA V „REELS & POSTY"
 *
 * Zvyšok záložky odpovedá na otázku „ako to dopadlo". Táto odpovedá na „čo
 * teraz" — a to je jediná otázka, pri ktorej sa niečo stane. Jerryho vlastné
 * pravidlo: číslo bez akcie je zbytočné.
 *
 * PREČO SA NEPÝTA JARVISA
 *
 * Návrhy sú počítané, nie generované. Model by ich napísal krajšie, ale pri
 * každom otvorení inak — a to, čo sa mení bez toho, aby sa zmenili dáta, sa
 * nedá brať vážne. Jarvis je až druhý krok: z vybraného návrhu urobí zadanie.
 */

type IgPrispevok = { datum: string; mesiac: string; kategoria: string };

export function PlanObsahu({ data, chat, onNavigate, onAck }: { data: PSBData; chat?: AssistantChat; onNavigate?: (tab: string, sub?: string) => void; onAck?: (kluc: string, zapnut: boolean) => void }) {
  const [ig, setIg] = useState<IgPrispevok[]>([]);

  useEffect(() => {
    void fetch("/api/meta?co=instagram", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { prispevky?: IgPrispevok[] }) => setIg(j.prispevky || []))
      .catch(() => {});
  }, []);

  const navrhy = useMemo<Navrh[]>(() => {
    // Kategórie hákov proti bežnému dňu — tá istá funkcia, akú kreslí karta
    // „obsah → dopyt". Dve rôzne čísla o tom istom by si protirečili.
    const hooky = obsahPredDopytmi(
      data.leads.map((l) => ({ date: l.date })),
      ig.filter((p) => p.kategoria).map((p) => ({ datum: p.datum, kategoria: p.kategoria })),
    ).riadky.map((r: Riadok) => ({
      kategoria: r.kategoria, dopytov: r.dopytov,
      podiel: r.podielDopytov, podielBezne: r.zaklad,
    }));

    // Tempo: koľko toho vychádza teraz verzus v mesiacoch s najviac dopytmi.
    const poMesiacoch = new Map<string, number>();
    for (const p of ig) poMesiacoch.set(p.mesiac, (poMesiacoch.get(p.mesiac) || 0) + 1);
    const dopytyPoMesiacoch = new Map<string, number>();
    for (const l of data.leads) {
      const m = monthKey(l.date);
      if (m) dopytyPoMesiacoch.set(m, (dopytyPoMesiacoch.get(m) || 0) + 1);
    }
    const mesiace = [...poMesiacoch.keys()].sort();
    const poslednePol = mesiace.slice(-6);
    const teraz = poslednePol.length
      ? poslednePol.reduce((a, m) => a + (poMesiacoch.get(m) || 0), 0) / poslednePol.length
      : 0;
    // „Silný mesiac" = horná tretina podľa dopytov, aspoň tri mesiace.
    const podlaDopytov = [...dopytyPoMesiacoch.entries()]
      .filter(([m]) => poMesiacoch.has(m))
      .sort((a, b) => b[1] - a[1]);
    const silne = podlaDopytov.slice(0, Math.max(3, Math.round(podlaDopytov.length / 3)));
    const vSilnych = silne.length >= 3
      ? silne.reduce((a, [m]) => a + (poMesiacoch.get(m) || 0), 0) / silne.length
      : null;

    // Kto na webe tému vlastní. Titulok je vlastníctvo, zmienka v texte nie —
    // presne ten rozdiel našiel Jarvis 17. 8. pri „subokcipitálních svalech":
    // Google na ne držal pozíciu 2,3, ale stránka o nich neexistovala.
    const vlastnik = (dopyt: string): Vlastnik => {
      const slova = dopyt.toLowerCase().split(/\s+/).filter((w) => w.length >= 5);
      if (!slova.length) return null;
      const sedi = (text: string) => slova.every((w) => text.toLowerCase().includes(w.slice(0, Math.max(5, w.length - 2))));
      // Porovnáva sa proti titulku, H1 a meta popisu — celý text stránok
      // v prehliadači nie je (leží v D1, je to megabajty). Na otázku „má web
      // o tejto téme stránku" to stačí: keď téma nie je ani v jednom z týchto
      // troch, vlastnú stránku nemá.
      const vTitulku = WEB_STRANKY.find((w) => sedi(w.titulok || "") || sedi(w.h1 || ""));
      if (vTitulku) return { url: vTitulku.url, titulok: vTitulku.titulok, druh: "titulok" };
      const vPopise = WEB_STRANKY.find((w) => sedi(w.metaPopis || ""));
      if (vPopise) return { url: vPopise.url, titulok: vPopise.titulok, druh: "zmienka" };
      return null;
    };

    return planObsahu({
      vlastnik,
      prilezitosti: prilezitosti(GSC_DOPYTY as unknown as GscDopytTyp[], 5),
      // Zo SEARCH CONSOLE, nie z interného prehľadu článkov. Ten meria iné
      // okno a inú vec — 17. 8. 2026 tvrdil pri jednej stránke 1 829
      // zobrazení, kým Search Console pri tej istej 188 zobrazení a 3 kliky.
      // Titulok sa berie z web_stranky, aby v návrhu bolo meno článku a nie
      // holá adresa; keď stránka v sitemape nie je, do návrhu nejde vôbec.
      // Len ČLÁNKY. Domovská stránka, kontakt či cenník majú kliky tiež —
      // 17. 8. 2026 karta ponúkla ako najlepší „článok" na pripomenutie
      // domovskú stránku so 447 klikmi. Pripomínať na Instagrame vlastnú
      // domovskú stránku nedáva zmysel; pripomína sa text, ktorý niečo
      // vysvetľuje.
      clanky: [...GSC_STRANY]
        .filter((g) => WEB_STRANKY.some((w) => w.url === g.url && w.typ === "clanok"))
        .sort((a, b) => b.kliky - a.kliky)
        .slice(0, 4)
        .map((g) => ({
          nazov: (WEB_STRANKY.find((w) => w.url === g.url)?.titulok || g.url).replace(/ [-–|] ProSapiens Biomechanic$/, ""),
          url: g.url,
          kliky: g.kliky,
          zobrazenia: g.zobrazenia,
        })),
      hooky,
      prispevkovMesacne: teraz,
      prispevkovVSilnychMesiacoch: vSilnych,
    });
    // marketingVerzia(): WEB_STRANKY a GSC_* sa plnia mimo Reactu; keď vlastný
    // fetch `ig` dobehol skôr než /api/marketing, memo zamrzlo nad prázdnym
    // skladom a karta tvrdila, že web o téme nemá stránku.
  }, [ig, data.leads, marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  const doZadania = (n: Navrh) => {
    if (!chat) return;
    // Zadanie sa rieši v Jarvisovom okne, nie v rohu obrazovky.
    //
    // Jerry, 17. 8. 2026: „presne toto by som chcel riešiť v tom samostatnom
    // okne — keď kliknem zadanie, tak by ma tam preplo." Malý panel je dobrý
    // na jednu otázku medzi prácou; nad zadaním sa sedí, dopytuje a vetví,
    // a na to je 300 pixelov v rohu málo. Rozhovor je jeden a ten istý,
    // takže sa nič nestráca — mení sa len okno, v ktorom je vidieť.
    // NOVÝ rozhovor, nie pokračovanie toho, čo bolo otvorené.
    //
    // 17. 8. 2026 sa dve zadania prilepili do rozhovoru s názvom „Ktorá
    // kategória hákov nám funguje najlepšie" — lebo `zachovajOkno` zabránilo
    // oknu založiť nový a zadanie skončilo v tom, čo bolo náhodou otvorené.
    // Nič sa nestratilo, ale nedalo sa to nájsť: názov rozhovoru sa berie
    // z PRVEJ otázky a tá bola o niečom inom.
    //
    // Samotné `newChat` nestačí — nastavuje stav a `ask` beží ešte so starým
    // zoznamom správ z uzáveru. Preto sa mu prázdna história odovzdáva rovno
    // tretím parametrom; to je jediný spôsob, ako to platí okamžite.
    chat.newChat("marketing");
    if (onNavigate) { chat.zachovajOkno(); onNavigate("jarvis"); }
    else chat.setFloatingOpen(true);
    void chat.ask([
      `Vyrob mi ZADANIE PRE CLAUDE PROJECT na tento obsah: ${n.co}`,
      "",
      `Prečo to navrhujem: ${n.preco}`,
      `Číslo, na ktorom to stojí: ${n.dokaz}`,
      "",
      "Drž PEVNÝ TVAR ZADANIA (docs/tvar-zadania.md) — tieto kolónky v tomto poradí:",
      "TÉMA · PREČO PRÁVE TOTO · ČÍSLA, NA KTORÝCH TO STOJÍ · PUBLIKUM A SYMPTÓM ·",
      "FORMÁT A DĹŽKA · JAZYK · ČO NESMIE ZAZNIEŤ · HOTOVÉ VETY · ČO CHCEM SPÄŤ.",
      "",
      "Kto je PSB, tón hlasu, FP pravidlá a index brand-konfliktov do zadania NEPÍŠ —",
      "Project ich má natrvalo v kánone. Zadanie nesie len to, čo je pre tento text nové.",
      "Pri číslach vždy uveď zdroj a dátum. Project nevidí dáta Kokpitu, takže čo",
      "nenapíšeš, to nemá. Do zadania nepatrí meno klienta ani zdravotný detail.",
      "Najprv over, či čísla sedia — a keď nesedia, povedz to namiesto zadania.",
    ].join("\n"), `Vyrob zadanie: ${n.co}`, []);
  };

  const farba: Record<Navrh["zdroj"], string> = {
    "vyhľadávanie": C.green, web: C.blue, obsah: C.accent, tempo: C.textMuted,
  };

  /**
   * Odklepnuté návrhy sa nezahadzujú — nechajú po sebe riadok.
   *
   * Zoznam, ktorý po odklepnutí vyzerá prázdny, tvrdí, že práca neexistuje.
   * Existuje, len sa na ňu chvíľu nepýtame. To isté robia hlásenia
   * v Marketingu.
   */
  const { platne, hotove } = rozdelPodlaHotovych(navrhy, data.anomalyAck, new Date());

  return (
    <Card>
      <H3>
        <Info
          label="Čo publikovať ďalej"
          text="Návrhy počítané z toho, čo appka už vie: témy, na ktoré sa web zobrazuje a nikto neklikne; články, ktoré ľudia čítajú sami od seba; typ začiatku, ktorý bol vidieť pred dopytmi častejšie než v bežný deň; a tempo publikovania proti mesiacom s najviac dopytmi. Každý návrh nesie číslo, na ktorom stojí — aby sa s ním dalo nesúhlasiť. Nič z toho netvrdí príčinu."
        />
      </H3>

      {platne.length === 0 && hotove.length === 0 ? (
        <Empty>
          Zatiaľ nemám z čoho navrhovať. Stiahni Instagram a Google v záložke Upload;
          návrhy sa objavia samy.
        </Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
          {platne.map((n, i) => (
            <div key={n.co + i} style={{
              display: "grid", gridTemplateColumns: "3px 1fr auto", gap: 0,
              background: mix(C.text, 4), borderRadius: 8, overflow: "hidden",
            }}>
              <div style={{ background: farba[n.zdroj] }} />
              <div style={{ padding: "11px 14px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 640, color: C.text, lineHeight: 1.4 }}>{n.co}</div>
                <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>{n.preco}</div>
                <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
                  {n.dokaz} · {n.zdroj}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 0 6px" }}>
                {onAck && (
                  <button onClick={() => onAck(klucHotoveho(n.kluc), true)}
                    title={`Skryje sa na ${n.skryDni} dní. Ak sa téma nepohne, vráti sa.`}
                    style={{
                      fontSize: 11.5, padding: "6px 10px", borderRadius: 6,
                      border: `1px solid ${C.border}`, background: "none",
                      color: C.textMuted, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                    }}>
                    hotové
                  </button>
                )}
                {chat && (
                  <button onClick={() => doZadania(n)} disabled={chat.busy}
                    style={{
                      fontSize: 11.5, padding: "6px 11px", borderRadius: 6,
                      border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10),
                      color: C.accentLight, cursor: chat.busy ? "default" : "pointer",
                      opacity: chat.busy ? 0.5 : 1, whiteSpace: "nowrap", fontFamily: "inherit",
                    }}>
                    Zadanie →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hotove.length > 0 && (
        <div style={{ marginTop: platne.length ? 12 : 4, display: "flex", flexDirection: "column", gap: 5 }}>
          {hotove.map(({ navrh, do: doKedy }) => (
            <div key={navrh.kluc}
              style={{ fontSize: 11.5, color: C.textDim, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>✓ {navrh.co} — hotové, vráti sa {doKedy.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" })}, ak sa téma nepohne.</span>
              {onAck && (
                <button onClick={() => onAck(klucHotoveho(navrh.kluc), false)}
                  style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 11.5, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
                  vrátiť
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 11, lineHeight: 1.6 }}>
        Poradie nie je dôležitosť, ale <b style={{ color: C.textMuted }}>cena práce</b>. Hore sú témy,
        kde je pozícia vo vyhľadávaní už zaplatená a chýba len dôvod kliknúť; dole to, čo si musíš
        vymyslieť od začiatku.
      </div>
    </Card>
  );
}
