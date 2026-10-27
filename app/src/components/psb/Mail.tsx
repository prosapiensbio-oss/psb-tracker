import { useEffect, useMemo, useState } from "react";

import { fmtDMY, monthLabel } from "../../lib/psb/format";
import {
  aktivni, mieryKampane, prihlaseniaPoMesiacoch, zostavaZoznamu,
  type MailKampan, type Odberatel,
} from "../../lib/psb/mailer";
import { btn, C, mix, S } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, RolovaciaTabulka, ValueBars } from "./ui";

/**
 * E-mail — najlacnejšie publikum, o ktorom appka nevedela nič.
 *
 * PREČO JE PRVÁ OTÁZKA „PRIBÚDAJÚ ODBERATELIA"
 *
 * Formulár na /dychani zbiera MAILY, nie dopyty. Onboarding od júla hlási, že
 * má vysoké zobrazenia a nula odoslaní, a kampaň naň minula 1 804 Kč. Odpoveď
 * nie je v Mete ani v Kokpite — je tu: keď formulár funguje, rad prihlásení
 * rastie. Keď nie, je plochý.
 *
 * Preto je graf prihlásení hore a kampane až pod ním. Kampane sú zaujímavé;
 * tá otázka je naliehavá.
 */

export function Mail() {
  const [odb, setOdb] = useState<Odberatel[]>([]);
  const [kam, setKam] = useState<MailKampan[]>([]);
  const [nacitane, setNacitane] = useState(false);
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    void fetch("/api/mailer", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`server odpovedal ${r.status}`);
        return r.json();
      })
      .then((j: { odberatelia?: Odberatel[]; kampane?: MailKampan[] }) => {
        setOdb(j.odberatelia || []); setKam(j.kampane || []);
      })
      .catch((e) => setChyba(String(e?.message || e).slice(0, 120)))
      .finally(() => setNacitane(true));
  }, []);

  const rad = useMemo(() => prihlaseniaPoMesiacoch(odb), [odb]);

  /**
   * Koľko odberateľov sú klienti — od 27. 10. 2026 sa to NEHÁDA na obrazovke.
   * Párovanie na meno klienta je v databáze (`mail_odberatelia.klient`,
   * spravené pri CSV importe proti fakturačným mailom aj dopytom), takže
   * obrazovka, Jarvis aj budúci mailer čítajú to isté číslo.
   */
  const zostava = useMemo(() => zostavaZoznamu(odb), [odb]);
  const odhlaseni = useMemo(
    () => odb.filter((o) => o.status === "unsubscribed")
      .sort((a, b) => String(b.odhlaseny_at || "").localeCompare(String(a.odhlaseny_at || ""))),
    [odb],
  );

  const poslednePrihlasenie = odb.reduce((a, o) => (o.prihlaseny > a ? o.prihlaseny : a), "");

  if (!nacitane) return null;
  if (!odb.length && !kam.length) {
    return (
      <Card>
        <H3><Info label="E-mail (MailerLite)" text="Napĺňa sa v záložke Upload → MailerLite." /></H3>
        <Empty>
          {chyba
            ? `Nepodarilo sa načítať: ${chyba}`
            : "Ešte som z MailerLite nič nestiahol. Vlož token v záložke Upload a klikni „Stiahnuť odberateľov a kampane“."}
        </Empty>
      </Card>
    );
  }

  // Posledné tri mesiace radu — na otázku „chodí ešte niekto" stačia.
  const posledne = rad.slice(-3);
  const suchoMesiacov = (() => {
    let n = 0;
    for (let i = rad.length - 1; i >= 0 && rad[i].v === 0; i--) n++;
    return n;
  })();

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3>
            <Info
              label="Pribúdajú odberatelia?"
              text="Prihlásenia po mesiacoch z MailerLite. Toto je jediná odpoveď na otázku, či formulár na /dychani funguje — zbiera maily, nie dopyty, takže sa jeho úspech nedá zmerať v Kokpite ani v Mete. Mesiace bez prihlásenia sú v grafe ako nula, nie preskočené: prázdne obdobie by inak vyzeralo ako rast."
            />
          </H3>
          {poslednePrihlasenie && (
            <span style={{ fontSize: 11.5, color: C.textDim }}>posledné prihlásenie {fmtDMY(poslednePrihlasenie)}</span>
          )}
        </div>

        {/* Verdikt navrchu — kvôli nemu celá karta vznikla. */}
        <div style={{ margin: "12px 0", padding: "11px 13px", borderRadius: 8, lineHeight: 1.6, fontSize: 12.5, color: C.textMuted,
          background: mix(suchoMesiacov >= 2 ? C.red : C.accent, 8) }}>
          <b style={{ color: C.text }}>Čo z toho čítať:</b>{" "}
          {suchoMesiacov >= 2 ? (
            <>
              Za posledné <b style={{ color: C.red }}>{suchoMesiacov} mesiace</b> sa neprihlásil nikto.
              To potvrdzuje, čo hlási onboarding: formulár na <b style={{ color: C.text }}>/dychani</b> síce
              ľudia vidia, ale neodošlú — a kampaň, ktorá naň mierila, platila prekliky do prázdna.
            </>
          ) : posledne.some((m) => m.v > 0) ? (
            <>Odberatelia pribúdajú. Formulár teda funguje a otázka sa presúva ďalej: čo im posielaš.</>
          ) : (
            <>Zatiaľ nemám dosť mesiacov na záver.</>
          )}
        </div>

        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 12 }}>
          <Cifra popis="Odberateľov" hodnota={String(odb.length)} />
          <Cifra popis="Z toho aktívnych" hodnota={String(aktivni(odb))} farba={C.accentLight} />
          <Cifra popis="Odberateľov, čo sú klienti" hodnota={`${zostava.klientov}`} farba={zostava.klientov ? C.green : C.textDim} />
        </div>

        {rad.length > 0 && (
          <ValueBars data={rad.map((r) => ({ label: monthLabel(r.m), value: r.v }))}
            color={C.accent} fmt={(n) => String(Math.round(n))} height={150} alignEnd />
        )}

        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.55 }}>
          „Odberateľov, čo sú klienti" je <b style={{ color: C.textMuted }}>dolná hranica</b>, nie presné číslo:
          páruje sa na e-mail a ten appka pozná len tam, kde ho klient niekedy nechal.
          Pri starších chýba, takže skutočné číslo bude vyššie.
        </div>
      </Card>

      <ZoznamPoExporte zostava={zostava} odhlaseni={odhlaseni} />

      <Card>
        <H3>
          <Info
            label="Kampane"
            text="Odoslané kampane z MailerLite. Otvorenia a prekliky sú UNIKÁTNE počty — jeden človek, čo si mail otvoril päťkrát, by v celkových vyzeral ako päť ľudí. Stĺpec „preklik z otvorených“ oddeľuje predmet od obsahu: nízka celková preklikovosť pri vysokej tejto znamená, že text funguje a zlyháva predmet — a opravovať sa má to prvé."
          />
        </H3>
        {kam.length === 0 ? (
          <Empty>Zatiaľ žiadne stiahnuté kampane.</Empty>
        ) : (
          <RolovaciaTabulka pocet={3}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Kampaň</th>
                <th style={{ ...S.th, textAlign: "right" }}>Komu</th>
                <th style={{ ...S.th, textAlign: "right" }}>Otvorilo</th>
                <th style={{ ...S.th, textAlign: "right" }}>Kliklo</th>
                <th style={{ ...S.th, textAlign: "right" }}>Z otvorených</th>
                <th style={{ ...S.th, textAlign: "right" }}>Odhlásilo</th>
              </tr>
            </thead>
            <tbody>
              {kam.map((k) => {
                const m = mieryKampane(k);
                return (
                  <tr key={k.id}>
                    <td style={{ ...S.td, color: C.text }}>
                      {k.nazov || k.id}
                      <div style={{ fontSize: 10.5, color: C.textDim }}>{fmtDMY(k.odoslane)}</div>
                    </td>
                    <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{k.prijemcov}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: (m.otvorenost ?? 0) >= 25 ? C.green : (m.otvorenost ?? 0) >= 15 ? C.textMuted : C.orange }}>
                      {m.otvorenost == null ? "—" : `${Math.round(m.otvorenost)} %`}
                      <span style={{ color: C.textDim, fontSize: 11 }}> ({k.otvorenia})</span>
                    </td>
                    <td style={{ ...S.td, textAlign: "right", color: (m.preklikovost ?? 0) >= 3 ? C.green : C.textMuted }}>
                      {m.preklikovost == null ? "—" : `${m.preklikovost.toFixed(1)} %`}
                    </td>
                    <td style={{ ...S.td, textAlign: "right", color: C.textDim }}>
                      {m.preklikZOtvorenych == null ? "—" : `${Math.round(m.preklikZOtvorenych)} %`}
                    </td>
                    <td style={{ ...S.td, textAlign: "right", color: (m.odhlasenost ?? 0) > 1 ? C.red : C.textDim }}>
                      {m.odhlasenost == null ? "—" : `${m.odhlasenost.toFixed(1)} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </RolovaciaTabulka>
        )}
      </Card>
    </>
  );
}

function Cifra({ popis, hodnota, farba }: { popis: string; hodnota: string; farba?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: farba || C.text, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 11.5, color: C.textMuted }}>{popis}</div>
    </div>
  );
}

/**
 * ZOZNAM PRED ZRUŠENÍM MAILERLITE (Jerry, 27. 10. 2026).
 *
 * CSV export z 27. 10. je POSLEDNÝ obraz zoznamu — po zrušení účtu sa už
 * nemá odkiaľ obnoviť. Karta preto hovorí dve veci, ktoré sa inde nedozvie:
 * koľko ľudí zoznam naozaj číta (a teda či má zmysel ho oživovať) a kto sa
 * odhlásil, s dátumom a dôvodom. Tých 43 je jediná vec, ktorú MUSÍ budúci
 * mailer rešpektovať — napísať odhlásenému nie je chyba vkusu, ale porušenie
 * jeho rozhodnutia.
 */
function ZoznamPoExporte({ zostava, odhlaseni }: {
  zostava: ReturnType<typeof zostavaZoznamu>;
  odhlaseni: Odberatel[];
}) {
  const [otvorene, setOtvorene] = useState(false);
  if (!zostava.spolu) return null;
  const citaPct = zostava.aktivni ? Math.round((zostava.citaju / zostava.aktivni) * 100) : 0;
  return (
    <Card>
      <H3>
        <Info
          label="Stav zoznamu"
          text="Z CSV exportu z 27. 10. 2026 — posledný úplný obraz zoznamu pred zrušením MailerLite. Po zrušení účtu sa už neobnoví: čo je tu, je všetko, čo o tých ľuďoch budeme vedieť."
        />
      </H3>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "10px 0 12px" }}>
        <Cifra popis="Aktívnych" hodnota={String(zostava.aktivni)} farba={C.accentLight} />
        <Cifra popis="Aspoň raz otvorili" hodnota={`${zostava.citaju}`} farba={C.green} />
        <Cifra popis="Odhlásených" hodnota={String(zostava.odhlaseni)} farba={zostava.odhlaseni ? C.orange : C.textDim} />
        <Cifra popis="Nedoručiteľných" hodnota={String(zostava.nedorucitelni)} farba={C.textDim} />
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.textMuted, padding: "11px 13px", borderRadius: 8, background: mix(C.accent, 8) }}>
        <b style={{ color: C.text }}>Čo z toho čítať:</b>{" "}
        Zoznam <b style={{ color: C.text }}>číta {citaPct} %</b> aktívnych ({zostava.citaju} z {zostava.aktivni})
        a <b style={{ color: C.text }}>{zostava.klientov}</b> z nich sú klienti PSB. To je publikum, ktoré
        sa dá osloviť bez platenia za dosah — a jediné, ktoré po zrušení MailerLite zostáva v Kokpite.
        Posielať sa z neho zatiaľ nedá: Kokpit odosielanie kampaní nemá postavené.
      </div>
      <button onClick={() => setOtvorene(!otvorene)} style={{ ...btn(), marginTop: 10 }}>
        {otvorene ? "Skryť odhlásených" : `Ukázať odhlásených (${odhlaseni.length})`}
      </button>
      {otvorene && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 6, lineHeight: 1.5 }}>
            Týmto ľuďom sa <b style={{ color: C.textMuted }}>písať nesmie</b> — ani z budúceho vlastného maileru.
            {zostava.odhlaseniKlienti > 0 && <> Z toho {zostava.odhlaseniKlienti} sú klienti PSB.</>}
          </div>
          <RolovaciaTabulka pocet={8}>
            <thead>
              <tr>{["E-mail", "Odhlásil sa", "Dôvod", "Klient"].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {odhlaseni.map((o) => (
                <tr key={o.email}>
                  <td style={S.td}>{o.email}</td>
                  <td style={S.td}>{o.odhlaseny_at ? fmtDMY(o.odhlaseny_at) : "—"}</td>
                  <td style={{ ...S.td, color: C.textMuted }}>{o.dovod || "—"}</td>
                  <td style={{ ...S.td, color: o.klient ? C.green : C.textDim }}>{o.klient || "—"}</td>
                </tr>
              ))}
            </tbody>
          </RolovaciaTabulka>
        </div>
      )}
    </Card>
  );
}
