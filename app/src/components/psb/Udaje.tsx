import { useEffect, useRef, useState } from "react";

import { fmtDMY } from "../../lib/psb/format";
import { jeBankovyVypis } from "../../lib/psb/fio";
import { C, mix, S, badge, btn } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { AssistantChat } from "./Assistant";
import { Zosit } from "./Zosit";
import type { IngestResult } from "../../lib/psb/db.server";
import type { Actions, KrokUzavierky, NavFocus } from "./App";
import { fetchVzasSettings, saveVzasSetting, type BtcNakup } from "../../lib/psb/client";
import { BtcParovanie } from "./BtcParovanie";
import { BankovyImport } from "./Banka";
import { BankaUlozene } from "./BankaUlozene";
import { FakturyNahlad } from "./Faktury";
import { parseFaktura, precoNieFaktura, type Faktura } from "../../lib/psb/faktura";
import { maTextovuVrstvu, pdfRiadky } from "../../lib/psb/pdftext";
import { ThemeSwitch } from "./ThemeSwitch";
import { Uzavierky } from "./Uzavierky";
import { Card, H3, Info } from "./ui";

// Údaje — jedno miesto pre všetko, čo nie je pohľad na štúdio, ale obsluha
// appky: nahrávanie súborov, uzávierky, audit, kontá, záloha, vzhľad a reset.
//
// Doteraz to viselo pod Dashboardom. Dashboard má byť displej — ukazuje, čo sa
// deje teraz. Nemá zmysel, aby sa pod aktuálnou situáciou nachádzalo tlačidlo
// „Vymazať všetky dáta"; v lietadle nie je páka na vysunutie podvozku na
// budíku rýchlosti. Uzávierky sem prišli z VZAS z rovnakého dôvodu: nie sú to
// peniaze, je to obsluha dát.

// Zdroj `banka` nie je v PSBData — bankové pohyby žijú vo vlastnej tabuľke a
// načítavajú sa až na obrazovke, kde treba. V zozname je preto zvlášť: nie je
// z PTmindera, ale je to piaty súbor, bez ktorého appka nevie, kam idú peniaze.
const REPORTS: { key: keyof PSBData; label: string; path: string }[] = [
  { key: "sessions", label: "Payroll by Session", path: "PTminder → Payroll Reports › By Session" },
  { key: "services", label: "Payroll by Service", path: "PTminder → Payroll Reports › By Service" },
  { key: "payments", label: "Payments Recorded", path: "PTminder → Financial Reports › Payments Recorded" },
  { key: "packages", label: "Packages & Memberships", path: "PTminder → General Reports › Packages & Memberships (všetky 4 pohľady)" },
];

const BANKA_ZDROJ = {
  label: "Fio banka — pohyby",
  path: "Fio → Výpisy a reporty › Výpis z účtu (CSV) — ten má ID operácií aj kontrolné súčty, na rozdiel od „Vyhledané pohyby“",
};
const FAKTURY_ZDROJ = {
  label: "Faktúry z Alzy (PDF)",
  path: "Alza → Môj účet › Objednávky › Faktúra (PDF). Doklad sa rozpíše na položky a každá dostane vlastnú kategóriu — granule pre Ahsoku, drogéria do štúdia, zvyšok súkromné. Aj viac faktúr naraz.",
};

// Marketingové zdroje. Zatiaľ sa len ukladajú — obrazovka Marketing beží na
// jednorazovom exporte spracovanom ručne.
//
// POZOR na „november": dlho tu stálo, že Metricoolu v novembri prepadnú
// staršie príspevky. Bol to omyl v pochopení — Jerry novembrom myslel, že
// vtedy DÔJDE NAPLÁNOVANÝ OBSAH (natočený a naplánovaný v decembri 2025,
// publikuje sa automaticky). Termín teda nepatrí sťahovaniu dát, ale výrobe
// nového obsahu. Stiahnuť staré CSV má stále zmysel, len bez paniky.
const MARKETING_ZDROJE: { druh: string; label: string; path: string }[] = [
  { druh: "metricool", label: "Metricool — príspevky, reels, stories", path: "Dve cesty, obe sem. (1) Analytics › Export › CSV — tri súbory instagram-posts, instagram-reels, instagram-stories; z nich má appka Instagram príspevok po príspevku. (2) Mesačná zostava v PDF — tú appka prečítať nevie (čísla sú vykreslené do grafov), tak ju prečíta Jarvis a vytiahne z nej všetky kanály naraz vrátane Facebooku, TikToku a Meta Ads. Stačí ju sem pretiahnuť. PPTX a XLSX nie." },
  { druh: "ga4", label: "Google Analytics 4", path: "GA4 → Prehľady › Prehľad stavu prehľadov › Stiahnuť CSV (jeden súbor za mesiac)" },
  { druh: "gsc", label: "Google Search Console", path: "Search Console → Výsledky vyhľadávania › Exportovať › CSV. Stiahne sa ZIP — rozbaľ ho a nahraj tri súbory: Graf.csv (kliky po dňoch), Dopyty.csv (na čo ťa ľudia našli), Strany.csv (ktorý článok ťahá). Krajiny, Zariadenia a Filtre appka zatiaľ nepoužíva." },
  // Anamnéza je tu NEPOVINNE a zámerne posledná. Zdroj klienta sa dnes plní sám
  // z dopytov (za apríl–júl 2026 na sto percent), takže mesačne ju netreba —
  // tlačidlo je tu na dobehnutie histórie, keby sa niekedy nazbierali ľudia bez
  // zapísaného dopytu. Pri prestavbe obrazovky vypadlo, hoci parser aj serverová
  // časť celý čas fungovali.
  { druh: "anamneza", label: "Anamnéza — len zdroj klienta (nepovinné)", path: "Google Forms → Odpovede › Exportovať do Sheets › Súbor › Stiahnuť › CSV. Appka z celého formulára berie JEDINÉ pole: „Jak jste se o nás dozvěděli?“ (plus meno toho, kto klienta poslal). Zdravotná časť sa neukladá vôbec — nie je na ňu v appke dôvod a bola by to najcitlivejšia vec v databáze. Mesačne to netreba: zdroj sa plní sám zo zapísaných dopytov." },
];

export function Udaje({ data, actions, chat, prekazky, kroky, podklady, onNavigate, btc }: { data: PSBData; actions: Actions; chat?: AssistantChat; prekazky?: (mesiac: string) => string[]; kroky?: (mesiac: string) => KrokUzavierky[]; podklady?: (mesiac: string) => string; onNavigate?: (tab: string, sub?: string, focus?: NavFocus) => void; btc?: { platby: BtcNakup[]; faktury: { cislo: string; datum: string; celkom: number; dodavatel: string }[]; parovanie: Record<string, string[]>; onSparuj: (id: number, f: string[]) => void } }) {
  const missing = REPORTS.filter((r) => (data[r.key] as unknown[]).length === 0);
  return (
    <>
      <UploadCard data={data} missing={missing} actions={actions} chat={chat} />

      {/* Zošit je zdroj dát ako každý iný — patrí sem, medzi nahrávanie. */}
      <Zosit onZapisane={() => void actions.refresh()} />

      {btc && <BtcParovanie platby={btc.platby} faktury={btc.faktury} parovanie={btc.parovanie} onSparuj={btc.onSparuj} />}
      <Uzavierky prekazky={prekazky} kroky={kroky} podklady={podklady} onNavigate={onNavigate} chat={chat} />

      <Card>
        <H3>
          <Info text="Zmení farebnú schému celej appky. Uloží sa v tomto prehliadači." label="Vzhľad / farebná schéma" />
        </H3>
        <ThemeSwitch />
      </Card>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {data.uploadLog[0] ? `Posledný upload: ${new Date(data.uploadLog[0].date).toLocaleString("cs-CZ")}` : "Zatiaľ žiadny upload"}
        </div>
        <ResetButton onReset={actions.reset} />
      </div>
    </>
  );
}

function UploadCard({ data, missing, actions, chat }: { data: PSBData; missing: typeof REPORTS; actions: Actions ; chat?: AssistantChat }) {
  const [uploadResult, setUploadResult] = useState<IngestResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  // Collapsed by default — CSV can also be uploaded via the AI assistant. Auto-open when reports are missing.
  const [open, setOpen] = useState(missing.length > 0);
  // Bankový výpis sa nedá nahrať naslepo: každý výdavok potrebuje kategóriu a na
  // účte sú aj súkromné veci. Preto JEDNO miesto na nahrávanie, ale dve
  // správania — výpis z PTmindera sa zapíše hneď, výpis z banky otvorí náhľad
  // rovno tu. Dve samostatné obrazovky boli len zbytočné blúdenie.
  const [bankovyText, setBankovyText] = useState("");
  // Stav bankových pohybov sa nedá prečítať z PSBData — má vlastnú tabuľku.
  const [bankaStav, setBankaStav] = useState<{ pocet: number; posledny: string } | null>(null);
  const [zositStav, setZositStav] = useState<{ pocet: number; posledny: string } | null>(null);
  const [faktury, setFaktury] = useState<Faktura[]>([]);
  const [fakturaChyba, setFakturaChyba] = useState<{ meno: string; dovod: string; ukazka: string[] }[]>([]);
  const [fakturyNahrate, setFakturyNahrate] = useState(0);
  useEffect(() => {
    void fetch("/api/faktury", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { polozky?: unknown[] }) => setFakturyNahrate((j.polozky || []).length))
      .catch(() => {});
  }, []);
  useEffect(() => {
    void fetch("/api/fio", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        const p = (j.pohyby || []) as { datum: string; typ?: string }[];
        setBankaStav({ pocet: p.length, posledny: p.reduce((m, x) => (x.datum > m ? x.datum : m), "") });
        const h = p.filter((x) => x.typ === "hotovosť");
        setZositStav({ pocet: h.length, posledny: h.reduce((m, x) => (x.datum > m ? x.datum : m), "") });
      })
      .catch(() => { setBankaStav({ pocet: 0, posledny: "" }); setZositStav({ pocet: 0, posledny: "" }); });
  }, [bankovyText]);
  const bankaNahrata = (bankaStav?.pocet || 0) > 0;
  const zositNahraty = (zositStav?.pocet || 0) > 0;
  const bankaInfo = bankaStav?.posledny ? `dáta do ${fmtDMY(bankaStav.posledny)}` : "";
  const [surove, setSurove] = useState<{ druh: string; pocet: number; posledny: string }[]>([]);
  useEffect(() => {
    void fetch("/api/raw-uploads", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => setSurove(j.subory || []))
      .catch(() => setSurove([]));
  }, [uploadResult]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [neCsv, setNeCsv] = useState<{ meno: string; pripona: string }[]>([]);
  const [pdfStav, setPdfStav] = useState("");

  // Mesačná zostava z Metricoolu. Appka ju prečítať nevie — text je v
  // podmnožinách fontov a čísla sú vykreslené do grafov — tak ju prečíta model,
  // ktorý sa na strany pozerá ako človek. Odpoveď chodí po kúskoch, lebo to
  // trvá aj minútu a tichý request by spadol na timeout.
  const citajPdf = async (f: File) => {
    setPdfStav(`${f.name}: pripravujem…`);
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    const base64 = btoa(bin);
    try {
      const r = await fetch("/api/pdf-import", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: f.name, base64 }),
      });
      const reader = r.body?.getReader();
      if (!reader) { setPdfStav(`${f.name}: bez odpovede`); return; }
      const dec = new TextDecoder();
      let zvysok = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        zvysok += dec.decode(value, { stream: true });
        const casti = zvysok.split("\n\n");
        zvysok = casti.pop() || "";
        for (const c of casti) {
          const line = c.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const o = JSON.parse(line) as { s?: string; e?: string; hotovo?: { riadkov: number; mesiace: string[]; kanaly: string[]; odhady: number } };
            if (o.s) setPdfStav(`${f.name}: ${o.s}`);
            if (o.e) setPdfStav(`${f.name}: ${o.e}`);
            if (o.hotovo) {
              const h = o.hotovo;
              setPdfStav(`${f.name}: načítaných ${h.riadkov} metrík za ${h.mesiace.join(", ")} — ${h.kanaly.join(", ")}${h.odhady ? ` (${h.odhady} odčítaných z grafu)` : ""}. Nájdeš to v Marketing → Kanály.`);
              void actions.refresh();
            }
          } catch { /* neúplný riadok */ }
        }
      }
    } catch (e) {
      setPdfStav(`${f.name}: nepodarilo sa — ${String(e).slice(0, 100)}`);
    }
  };

  // Fotka ide Jarvisovi s inštrukciou, nie ako holý obrázok — bez nej by sa
  // spýtal „čo s tým?" a Jerry by musel vysvetľovať to isté pri každej fotke.
  // Fotka pretiahnutá do zóny pre CSV sa NEPOSIELA Jarvisovi.
  //
  // Pôvodne sa poslala aj s inštrukciou, ale príloha sa nastavovala do stavu a
  // správa odchádzala v tom istom kroku — stav sa nestihol prejaviť a Jarvis
  // dostal holý text. Odpovedal „nevidím žiadnu fotku", čo znelo ako jeho
  // chyba a bola moja.
  //
  // Opravovať to načasovaním by bolo krehké a hlavne zbytočné: zošit má odvtedy
  // vlastnú kartu s náhľadom, kde sa riadky dajú skontrolovať a opraviť pred
  // zápisom. Chat na to je horšie miesto — odpoveď sa nedá prejsť riadok po
  // riadku ani potvrdiť.
  const posliFotkyJarvisovi = async (fotky: File[]) => {
    setPdfStav(
      `${fotky.length === 1 ? "Fotka patrí" : "Fotky patria"} do karty „Zošit — hotovostné platby“ nižšie na tejto obrazovke. ` +
      "Prepíše riadky do tabuľky, kde ich skontroluješ a opravíš, a až potom sa zapíšu.",
    );
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    const files: { filename: string; text: string }[] = [];
    const bankove: string[] = [];
    const neCsv: { meno: string; pripona: string }[] = [];
    const pdfka: File[] = [];
    const fotky: File[] = [];
    for (const f of Array.from(fileList)) {
      // PDF, XLSX ani ZIP sa nedajú prečítať ako text. Doteraz sa aj tak
      // poslali na server a ten odpovedal „Súbor je príliš veľký" — pravda o
      // veľkosti, ale úplne zavádzajúca rada. Metricool ponúka PDF ako prvé,
      // takže na to naozaj narazí každý.
      const pripona = f.name.toLowerCase().split(".").pop() || "";
      // PDF sa neodmieta — pošle sa Jarvisovi, ktorý si strany vykreslí a
      // prečíta ich vrátane grafov. Jedno miesto na nahrávanie, ako to má byť:
      // človek nemá riešiť, ktorý formát appka zvláda.
      if (pripona === "pdf") { pdfka.push(f); continue; }
      // Fotka zošita. Hotovostné platby sa zapisujú rukou a doteraz nemali ako
      // doraziť — appka fotku odmietla ako „neznámy formát". Prečítať rukopis
      // vie len Jarvis, tak k nemu ide rovno, aj s tým, čo z nej má vytiahnuť.
      if (["jpg", "jpeg", "png", "heic", "webp"].includes(pripona)) { fotky.push(f); continue; }
      if (["xlsx", "xls", "zip", "pptx", "docx"].includes(pripona)) {
        neCsv.push({ meno: f.name, pripona });
        continue;
      }
      const text = await f.text();
      if (jeBankovyVypis(text)) bankove.push(text);
      else files.push({ filename: f.name, text });
    }
    setNeCsv(neCsv);
    // PDF má dve podoby a stoja úplne inak. Faktúra nesie textovú vrstvu —
    // prečíta sa priamo v prehliadači, presne a zadarmo. Mesačná zostava z
    // Metricoolu je vykreslená do grafiky a tú vie prečítať len Jarvis.
    // Preto sa najprv skúsi text; Jarvis je až druhá voľba.
    const noveFaktury: Faktura[] = [];
    for (const f of pdfka) {
      let precitane = false;
      let dovod = "";
      let ukazka: string[] = [];
      try {
        const riadky = await pdfRiadky(await f.arrayBuffer());
        ukazka = riadky.slice(0, 6).map((r) => r.text);
        if (maTextovuVrstvu(riadky)) {
          const fa = parseFaktura(riadky);
          if (fa) { noveFaktury.push(fa); precitane = true; }
          else dovod = precoNieFaktura(riadky) || "";
        } else {
          dovod = precoNieFaktura(riadky) || "";
        }
      } catch (e) {
        dovod = `čítanie PDF spadlo (${e instanceof Error ? e.message : String(e)})`;
      }
      if (precitane) continue;
      // PDF BEZ textovej vrstvy nemôže byť faktúra, ktorú vieme rozpísať —
      // ale môže to byť čokoľvek, čo prečíta Jarvis: mesačná zostava z
      // Metricoolu (tá je celá vykreslená do grafiky), sken, fotka dokladu.
      // Odmietnuť ho hláškou „faktúru sa nepodarilo rozpísať" bola chyba:
      // Jerry nahral Metricool a appka mu odpovedala o faktúre, ktorú
      // nenahrával, a súbor zahodila. Ide Jarvisovi.
      if (!ukazka.length) { await citajPdf(f); continue; }
      // Doklad, ktorý VYZERÁ ako faktúra (text sa prečítal, len rozpis
      // nesedel), sa Jarvisovi neposiela — ten by ho čítal ako marketingovú
      // zostavu a odpovedal hláškou o CSV. Radšej sa povie, čo zlyhalo.
      if (dovod && !/nie je slovo/.test(dovod)) {
        setFakturaChyba((p) => [...p, { meno: f.name, dovod, ukazka }]);
        continue;
      }
      await citajPdf(f);
    }
    if (fotky.length) await posliFotkyJarvisovi(fotky);
    if (noveFaktury.length) setFaktury((p) => [...p, ...noveFaktury]);
    if (bankove.length) setBankovyText(bankove.join("\n"));
    if (files.length) {
      const res = await actions.ingest(files);
      setUploadResult(res);
      setTimeout(() => setUploadResult(null), 9000);
    }
    setBusy(false);
  };

  return (
    <Card>
      {/* Zóna na pretiahnutie je dôvod, prečo sa na túto obrazovku chodí —
          nesmie byť schovaná za rozbaľovaním. Zbalí sa až to, čo sa číta raz:
          návod a zoznam potrebných CSV. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ ...S.h3, marginBottom: 0 }}>Upload CSV</div>
        {missing.length > 0 && <span style={{ ...badge("orange"), fontSize: 10 }}>{missing.length} chýba</span>}
      </div>
      <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
        style={{ ...S.upload, borderColor: dragOver ? C.accent : `${mix(C.accent, 33)}`, background: dragOver ? C.accentBg : "transparent" }}
      >
        <div style={{ fontSize: 24, marginBottom: 6 }}>⬆</div>
        <div style={{ color: C.text }}>{busy ? "Spracúvam…" : "Pretiahni CSV alebo PDF súbory sem alebo klikni"}</div>
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
          PTminder aj bankový výpis z Fio. Typ rozpozná sám; duplicity preskočí, históriu zachová.
          Bankový výpis sa najprv ukáže na kontrolu.
        </div>
      </div>
      {pdfStav && (
        <div style={{ padding: "10px 13px", marginBottom: 10, borderRadius: 9, background: mix(C.accent, 8), border: `1px solid ${mix(C.accent, 28)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
          {pdfStav}
          <button onClick={() => setPdfStav("")} style={{ marginLeft: 8, background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zavrieť</button>
        </div>
      )}
      {neCsv.length > 0 && (
        <div style={{ padding: "10px 13px", marginBottom: 10, borderRadius: 9, background: mix(C.orange, 8), border: `1px solid ${mix(C.orange, 28)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
          <b>{neCsv.map((x) => x.meno).join(", ")}</b> — toto je {neCsv[0].pripona.toUpperCase()}, nie CSV. Appka číta tabuľky, nie hotové zostavy.
          {neCsv.some((x) => x.pripona === "pptx") && (
            <> PPTX appka nečíta. Z Metricoolu ber buď <b>Analytics → Export → CSV</b>, alebo mesačnú zostavu v <b>PDF</b> — tú prečíta Jarvis.</>
          )}
          {neCsv.some((x) => x.pripona === "zip") && (
            <> Search Console sťahuje ZIP — rozbaľ ho a nahraj súbory zvnútra (Graf, Dopyty, Stránky).</>
          )}
          <button onClick={() => setNeCsv([])} style={{ marginLeft: 8, background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>rozumiem</button>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".csv,.txt,.pdf,image/*" multiple style={{ display: "none" }} onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />
      {/* Bez podmienky na `bankovyText`: komponent sa musí objaviť aj vtedy,
          keď žiadny súbor práve nepribudol, ale v prehliadači zostalo
          rozrobené zaraďovanie. Ak nemá ani vstup ani rozrobené, nevykreslí
          sa sám od seba. */}
      <div style={{ marginTop: 12 }}>
        <BankovyImport vstup={bankovyText} onHotovo={() => { setBankovyText(""); void actions.refresh(); }} />
      </div>
      {fakturaChyba.length > 0 && (
        <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 9, background: mix(C.orange, 8), border: `1px solid ${mix(C.orange, 28)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
          {fakturaChyba.map((ch, i) => (
            <div key={i} style={{ marginBottom: i < fakturaChyba.length - 1 ? 8 : 0 }}>
              <b>{ch.meno}</b> — faktúru sa nepodarilo rozpísať: {ch.dovod}.
              {ch.ukazka.length > 0 && (
                <div style={{ marginTop: 5, fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: C.textDim, whiteSpace: "pre-wrap" }}>
                  {ch.ukazka.slice(0, 4).join("\n")}
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setFakturaChyba([])} style={{ marginTop: 6, background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zavrieť</button>
        </div>
      )}
      {faktury.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <FakturyNahlad
            faktury={faktury}
            onZmena={(i, f) => setFaktury((p) => p.map((x, j) => (j === i ? f : x)))}
            onHotovo={() => setFaktury([])}
          />
        </div>
      )}
      {uploadResult && (
        <div style={{ marginTop: 12 }}>
          {uploadResult.map((r, i) => (
            <div key={i} style={{ padding: 9, marginBottom: 4, fontSize: 12, borderRadius: 8, background: r.error ? C.redBg : C.greenBg, color: r.error ? C.red : C.green }}>
              {r.filename}: {r.error ? r.error : `${r.type} — pridané ${r.added}${r.skipped ? `, preskočené ${r.skipped} (duplicity)` : ""}`}
            </div>
          ))}
        </div>
      )}
      <NapojenieWebu />
      <NapojenieMeta />
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 14, fontSize: 12, color: C.textDim }}>
        <span>{open ? "▲ skryť" : "▼"} zoznam potrebných CSV a zapísané pohyby</span>
        <span style={{ marginLeft: "auto" }}>Nahrať sa dá aj pretiahnutím do Jarvisa (📎 vpravo dole).</span>
      </div>
      {open && (
      <div style={{ marginTop: 10, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8 }}>Potrebné CSV (kde ich nájdeš · aktuálnosť):</div>
        {REPORTS.map((r) => {
          const arr = (data[r.key] as { date?: string }[]) || [];
          const present = arr.length > 0;
          let info = "";
          if (r.key === "packages") {
            const up = data.uploadLog?.find((l) => l.type === "packages");
            info = up ? `nahrané ${fmtDMY(up.date)}` : "";
          } else if (present) {
            let mx = "";
            for (const x of arr) if (x.date && x.date > mx) mx = x.date;
            info = mx ? `dáta do ${fmtDMY(mx)}` : "";
          }
          return (
            <div key={r.label} style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: "flex", gap: 8 }}>
              <span style={{ color: present ? C.green : C.orange, flexShrink: 0 }}>{present ? "✓" : "✗"}</span>
              <span>
                <strong style={{ color: C.text }}>{r.label}</strong>
                {info && <span style={{ color: present ? C.accentLight : C.textDim, fontWeight: 500 }}> · {info}</span>}
                <br /><span style={{ color: C.textDim }}>{r.path}</span>
              </span>
            </div>
          );
        })}
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: "flex", gap: 8, marginTop: 2 }}>
          <span style={{ color: bankaNahrata ? C.green : C.orange, flexShrink: 0 }}>{bankaNahrata ? "✓" : "✗"}</span>
          <span>
            <strong style={{ color: C.text }}>{BANKA_ZDROJ.label}</strong>
            {bankaInfo && <span style={{ color: C.accentLight, fontWeight: 500 }}> · {bankaInfo}</span>}
            <br /><span style={{ color: C.textDim }}>{BANKA_ZDROJ.path}</span>
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: "flex", gap: 8, marginTop: 2 }}>
          <span style={{ color: zositNahraty ? C.green : C.orange, flexShrink: 0 }}>{zositNahraty ? "✓" : "✗"}</span>
          <span>
            <strong style={{ color: C.text }}>Zošit — hotovostné platby</strong>
            {zositStav?.posledny && <span style={{ color: C.accentLight, fontWeight: 500 }}> · {zositStav.pocet} riadkov, dáta do {fmtDMY(zositStav.posledny)}</span>}
            <br /><span style={{ color: C.textDim }}>Odfoť stranu zošita do karty „Zošit — hotovostné platby“ hore. Bez neho chýba hotovosť, a s ňou časť nákladov aj výplat — mesiac potom vyzerá ziskovejší, než bol.</span>
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: "flex", gap: 8, marginTop: 2 }}>
          <span style={{ color: fakturyNahrate ? C.green : C.textDim, flexShrink: 0 }}>{fakturyNahrate ? "✓" : "·"}</span>
          <span>
            <strong style={{ color: C.text }}>{FAKTURY_ZDROJ.label}</strong>
            {fakturyNahrate > 0 && <span style={{ color: C.accentLight, fontWeight: 500 }}> · {fakturyNahrate} položiek</span>}
            <br /><span style={{ color: C.textDim }}>{FAKTURY_ZDROJ.path}</span>
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, margin: "12px 0 8px" }}>Marketing a web:</div>
        {MARKETING_ZDROJE.map((m) => {
          const st = surove.find((x) => x.druh === m.druh);
          const je = (st?.pocet || 0) > 0;
          return (
            <div key={m.druh} style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: "flex", gap: 8 }}>
              <span style={{ color: je ? C.green : C.orange, flexShrink: 0 }}>{je ? "✓" : "✗"}</span>
              <span>
                <strong style={{ color: C.text }}>{m.label}</strong>
                {je && <span style={{ color: C.accentLight, fontWeight: 500 }}> · {st?.pocet} súborov, naposledy {fmtDMY(st?.posledny || "")}</span>}
                <br /><span style={{ color: C.textDim }}>{m.path}</span>
              </span>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, lineHeight: 1.5, padding: "8px 10px", borderRadius: 7, background: mix(C.orange, 8) }}>
          Nahratý mesiac prepíše čísla v obrazovke Marketing; mesiace, ktoré si nenahral, bežia ďalej na
          jednorazovom prepise. <strong style={{ color: C.text }}>V novembri dôjde naplánovaný obsah</strong> —
          to, čo sa natočilo a naplánovalo v decembri 2025, sa dovtedy minie. Nový content treba mať natočený,
          nastrihaný a naplánovaný skôr.
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
          Packages report dáva PTminder v štyroch pohľadoch (šablóny balíčkov, šablóny členstiev, balíčky klientov,
          členstvá klientov) — nahraj všetky, každý nesie niečo iné a ten posledný má aj platnosť členstva.
          Rovnaký súbor nič nezduplikuje.
        </div>
        {/* Aj zapísané pohyby patria sem dnu: prezerajú sa občas a pri oprave,
            nie pri každom nahrávaní. Na obrazovku sa chodí nahrávať. */}
        <div style={{ marginTop: 14 }}>
          <BankaUlozene />
        </div>
      </div>
      )}
      </div>
    </Card>
  );
}

function ResetButton({ onReset }: { onReset: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button onClick={() => setConfirm(true)} style={{ ...btn("outline"), color: C.red, borderColor: mix(C.red, 33) }}>
        Vymazať všetky dáta
      </button>
    );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.red }}>Naozaj vymazať všetky dáta?</span>
      <button onClick={() => { void onReset(); setConfirm(false); }} style={{ ...btn("danger"), fontSize: 12, padding: "6px 12px" }}>Áno</button>
      <button onClick={() => setConfirm(false)} style={{ ...btn("ghost"), fontSize: 12, padding: "6px 12px" }}>Zrušiť</button>
    </div>
  );
}

/**
 * Napojenie webového formulára na dopyty.
 *
 * Contact Form 7 na prosapiens.cz pošle e-mail a tým to preň končí — schránka
 * sa nedá spočítať a hlavne v nej nie je KAMPAŇ. Tento panel dá Jerrymu dve
 * veci, ktoré potrebuje skopírovať do WordPressu: adresu a zdieľané tajomstvo.
 *
 * Tajomstvo generuje prehliadač a appka ho ukladá; nikde inde sa neposiela
 * a v tomto rozhovore ani v kóde nikdy nefiguruje.
 */
function NapojenieWebu() {
  const [tajne, setTajne] = useState<string>("");
  const [stav, setStav] = useState<"load" | "ok">("load");
  const [ukaz, setUkaz] = useState(false);

  useEffect(() => {
    void fetchVzasSettings().then((s) => {
      setTajne(typeof s["web_lead_secret"] === "string" ? (s["web_lead_secret"] as string) : "");
      setStav("ok");
    });
  }, []);

  const vygeneruj = async () => {
    // Náhoda z prehliadača, nie z kódu — takto sa hodnota nikdy neobjaví
    // v repozitári ani v žiadnom rozhovore.
    const b = new Uint8Array(24);
    crypto.getRandomValues(b);
    const nove = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    await saveVzasSetting("web_lead_secret", nove);
    setTajne(nove);
    setUkaz(true);
  };

  const url = `${typeof location !== "undefined" ? location.origin : ""}/api/lead-web`;
  if (stav === "load") return null;

  return (
    <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
        <Info
          label="Dopyty z webového formulára"
          text="Contact Form 7 na webe pošle e-mail a nič neuloží. Tento panel ho napojí na appku: odoslaný formulár vytvorí dopyt v Klienti → Dopyty aj s kampaňou, z ktorej človek prišiel. Informácia o kampani žije len v adrese v momente kliknutia (utm_ parametre) — keď ju formulár nezachytí, je nenávratne preč a spojenie medzi výdavkom na reklamu a klientom sa už spätne nezostaví. Tajomstvo je náhodné heslo len pre túto jednu cestu; keby ho niekto poznal, vedel by appku zaplniť vymyslenými dopytmi. Vygeneruje ho tento prehliadač a nikde inde sa neposiela."
        />
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
        Adresa pre WordPress: <code style={{ background: mix(C.text, 8), padding: "2px 6px", borderRadius: 4 }}>{url}</code>
      </div>
      {!tajne ? (
        <button onClick={() => void vygeneruj()} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: "pointer" }}>
          Vygenerovať tajomstvo
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <code style={{ background: mix(C.text, 8), padding: "2px 6px", borderRadius: 4, fontSize: 11.5 }}>
            {ukaz ? tajne : `${tajne.slice(0, 6)}${"•".repeat(18)}`}
          </code>
          <button onClick={() => setUkaz((x) => !x)} style={{ fontSize: 11.5, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer" }}>
            {ukaz ? "skryť" : "ukázať"}
          </button>
          <button onClick={() => void navigator.clipboard?.writeText(tajne)} style={{ fontSize: 11.5, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer" }}>
            kopírovať
          </button>
          <button onClick={() => void vygeneruj()} style={{ fontSize: 11.5, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>
            vygenerovať nové
          </button>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
        Nové tajomstvo prestane platiť pre starý snippet na webe — po jeho vygenerovaní ho treba prepísať aj tam.
      </div>
    </div>
  );
}

/**
 * Napojenie na Meta Graph API — reklama a Instagram.
 *
 * Token sem Jerry vloží raz a odvtedy ho nikto nevidí: uloží sa na serveri
 * a späť do prehliadača sa neposiela ani skrátený. Preto je pole vždy prázdne
 * aj keď token existuje — vedľa je len informácia, či tam nejaký je.
 */
function NapojenieMeta() {
  const [stav, setStav] = useState<{ maToken: boolean; adAccount: string; igUser: string; kampani: number; igPrispevkov: number } | null>(null);
  const [token, setToken] = useState("");
  const [ucet, setUcet] = useState("");
  const [ig, setIg] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [robim, setRobim] = useState(false);

  const nacitaj = () => void fetch("/api/meta", { credentials: "same-origin" }).then((r) => r.json())
    .then((j) => { if (j.ok) { setStav(j); setUcet(j.adAccount || ""); setIg(j.igUser || ""); } });
  useEffect(nacitaj, []);

  const posli = async (telo: Record<string, unknown>, hotovo: string) => {
    setRobim(true); setHlaska("");
    const j = await fetch("/api/meta", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setRobim(false);
    setHlaska(j.ok ? hotovo : `Nepodarilo sa: ${j.error || "neznáma chyba"}`);
    nacitaj();
    return j;
  };

  const skuska = async () => {
    const j = await posli({ akcia: "test" }, "");
    if (!j.ok) return;
    const ucty = j.reklamneUcty?.data?.data || [];
    const strany = j.instagram?.data?.data || [];
    const igUcty = strany.filter((s: Record<string, unknown>) => s.instagram_business_account);
    setHlaska(
      `Token vidí ${ucty.length} reklamných účtov` +
      (ucty.length ? ` (${ucty.map((u: Record<string, string>) => `${u.name} · ${u.id}`).join(", ")})` : "") +
      ` a ${igUcty.length} instagramových účtov` +
      (igUcty.length ? ` (${igUcty.map((s: Record<string, Record<string, string>>) => `@${s.instagram_business_account.username} · ${s.instagram_business_account.id}`).join(", ")})` : "") +
      (j.reklamneUcty?.chyba ? ` · reklama: ${j.reklamneUcty.chyba}` : "") +
      (j.instagram?.chyba ? ` · instagram: ${j.instagram.chyba}` : ""),
    );
  };

  if (!stav) return null;
  const btn = { fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: robim ? "default" : "pointer", opacity: robim ? 0.5 : 1 } as const;

  return (
    <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
        <Info
          label="Meta — reklama a Instagram"
          text="Ťahá výdavok a výsledky kampaní z Meta Marketing API a metriky príspevkov z Instagram Graph API. Zmysel: Ads Manager vie cenu za preklik, ale nikdy nepovie cenu za klienta, ktorý zostal pol roka — nevie, kto sa ním stal. Kokpit má oba konce. Token sa uloží na serveri a späť do prehliadača sa už nikdy neposiela, preto je pole aj po uložení prázdne. Instagramové čísla sa ukladajú zvlášť od metricoolových: merajú sa mierne inak a keby sa miešali, nedalo by sa povedať, ktorému zdroju veriť."
        />
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
        Token: <b style={{ color: stav.maToken ? C.green : C.orange }}>{stav.maToken ? "uložený" : "chýba"}</b>
        {" · "}kampaní v appke: <b style={{ color: C.text }}>{stav.kampani}</b>
        {" · "}IG príspevkov: <b style={{ color: C.text }}>{stav.igPrispevkov}</b>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <input
          type="password" value={token} onChange={(e) => setToken(e.target.value)}
          placeholder={stav.maToken ? "vložiť nový token…" : "vlož token z Meta for Developers"}
          style={{ ...S.input, width: 280, marginBottom: 0 }} />
        <button disabled={robim || token.trim().length < 20} style={btn}
          onClick={() => void posli({ akcia: "uloz-token", token: token.trim() }, "Token uložený.").then(() => setToken(""))}>
          Uložiť token
        </button>
        <button disabled={robim || !stav.maToken} style={btn} onClick={() => void skuska()}>Skúška spojenia</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <input value={ucet} onChange={(e) => setUcet(e.target.value)} placeholder="reklamný účet (act_…)"
          style={{ ...S.input, width: 190, marginBottom: 0 }} />
        <input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="instagram id"
          style={{ ...S.input, width: 170, marginBottom: 0 }} />
        <button disabled={robim} style={btn}
          onClick={() => void posli({ akcia: "uloz-ucty", adAccount: ucet, igUser: ig }, "Účty uložené.")}>
          Uložiť účty
        </button>
        <button disabled={robim || !stav.maToken || !ucet} style={btn}
          onClick={() => void posli({ akcia: "kampane", od: "2025-01-01" }, "Kampane stiahnuté.")}>
          Stiahnuť kampane od 2025
        </button>
        <button disabled={robim || !stav.maToken || !ig} style={btn}
          onClick={() => void posli({ akcia: "instagram" }, "Instagramové príspevky stiahnuté.")}>
          Stiahnuť Instagram
        </button>
      </div>

      {hlaska && <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, marginTop: 4 }}>{hlaska}</div>}
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
        Token nikam neposielaj mailom ani v chate — vkladá sa priamo sem.
      </div>
    </div>
  );
}
