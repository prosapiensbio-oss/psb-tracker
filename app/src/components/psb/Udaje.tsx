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
import type { PohybSplits, SplitCiast } from "../../lib/psb/pohybSplit";
import { BtcParovanie } from "./BtcParovanie";
import { PushOdber } from "./PushOdber";
import { CAS_BUILDU, kontrolnySubor, verziaServera } from "../../lib/psb/verzia";
import { BankovyImport } from "./Banka";
import { BankaUlozene } from "./BankaUlozene";
import { FakturyNahlad } from "./Faktury";
import { parseFaktura, precoNieFaktura, type Faktura } from "../../lib/psb/faktura";
import { maTextovuVrstvu, pdfRiadky } from "../../lib/psb/pdftext";
import { ThemeSwitch } from "./ThemeSwitch";
import { Uzavierky } from "./Uzavierky";
import { Card, H3, Info } from "./ui";
import { Konta, KontaNadpis } from "./Konta";

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
  { key: "poplatky", label: "Transactions", path: "PTminder → Finances › Transactions (Export). Nezaplatené poplatky — po zaplatení sa v PTminderi mažú, takže export je vždy úplný zoznam otvorených." },
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
  // GA4 a Search Console tu ZÁMERNE nie sú (Jerry, 14. 8.): od 13. 8. chodia
  // cez API a nepovinná vec v zozname povinných je len šum. Ručná cesta cez CSV
  // funguje ďalej — import ju stále pozná — a je popísaná v karte Napojenia,
  // teda tam, kde ju bude niekto hľadať, keď kľúč vyprší.
  // Anamnéza je tu NEPOVINNE a zámerne posledná. Zdroj klienta sa dnes plní sám
  // z dopytov (za apríl–júl 2026 na sto percent), takže mesačne ju netreba —
  // tlačidlo je tu na dobehnutie histórie, keby sa niekedy nazbierali ľudia bez
  // zapísaného dopytu. Pri prestavbe obrazovky vypadlo, hoci parser aj serverová
  // časť celý čas fungovali.
  { druh: "anamneza", label: "Anamnéza — zdroj klienta a dátum narodenia (nepovinné)", path: "Google Forms → Odpovede › Exportovať do Sheets › Súbor › Stiahnuť › CSV. Appka z celého formulára berie DVE polia: „Jak jste se o nás dozvěděli?“ (plus meno odporúčateľa) a dátum narodenia — ten PTminder neexportuje vôbec, takže formulár je jediný zdroj. Zdravotná časť sa neukladá vôbec: nie je na ňu v appke dôvod a bola by to najcitlivejšia vec v databáze. Mesačne to netreba." },
];

export function Udaje({ data, actions, chat, prekazky, kroky, podklady, onNavigate, btc, pohybSplits, nastavPohybSplit }: { data: PSBData; actions: Actions; chat?: AssistantChat; prekazky?: (mesiac: string) => string[]; kroky?: (mesiac: string) => KrokUzavierky[]; podklady?: (mesiac: string) => string; onNavigate?: (tab: string, sub?: string, focus?: NavFocus) => void; btc?: { platby: BtcNakup[]; faktury: { cislo: string; datum: string; celkom: number; dodavatel: string }[]; parovanie: Record<string, string[]>; onSparuj: (id: number, f: string[]) => void }; pohybSplits?: PohybSplits; nastavPohybSplit?: (kluc: string, casti: SplitCiast[]) => void }) {
  const missing = REPORTS.filter((r) => (data[r.key] as unknown[]).length === 0);
  return (
    <>
      <UploadCard data={data} missing={missing} actions={actions} chat={chat} />

      {/* Zapísané pohyby majú vlastnú kartu hneď pod nahrávaním — tu sa rozdeľujú
          pohyby (telefón, príjem, vrátenie), a to sa robí pri uzávierke, nie raz
          za rok. Predtým boli zahrabané dva rozkliky hlboko (Jerry, 5. 9. 2026). */}
      <BankaUlozene pohybSplits={pohybSplits} onSplit={nastavPohybSplit} />

      {/* Zošit je zdroj dát ako každý iný — patrí sem, medzi nahrávanie. */}
      <Zosit onZapisane={() => void actions.refresh()} />

      {btc && <BtcParovanie platby={btc.platby} faktury={btc.faktury} parovanie={btc.parovanie} onSparuj={btc.onSparuj} />}
      <Uzavierky prekazky={prekazky} kroky={kroky} podklady={podklady} onNavigate={onNavigate} chat={chat} />

      {/* Napojenia až za uzávierkou (Jerry, 14. 8.): „upload CSV nech je iba
          o CSV." Kľúč sa vkladá raz za rok, CSV sa nahráva každý týždeň —
          a to, čo sa robí často, patrí vyššie. */}
      <Card>
        <H3>
          <Info
            label="Napojenia — kľúče a tokeny"
            text="Nastavuje sa raz a potom už len keď niečo prestane chodiť. Každý kľúč leží na serveri a späť do prehliadača sa nevracia ani skrátený; v odpovedi je len to, či tam je, a e-mail servisného účtu, ktorý treba vložiť do Google."
          />
        </H3>
        <NapojenieWebu />
        <NapojenieMeta />
        <NapojenieMailer />
        <CoJarvisVieZvonku data={data} />
        <NapojenieGoogle />
        <NapojenieGoogleAds />
        <NapojenieTextWebu />
        <NapojenieRychlost />
      </Card>

      {/* Notifikácie na telefón sú tu, a nie v hlavičke, kde stáli prvý deň.
          Jerry, 31. 8. 2026: „neviem, prečo by malo byť zapnúť notifikácie na
          hlavnej obrazovke, kľudne to daj niekde do upload." Mal pravdu
          dvakrát: je to nastavenie, ktoré sa spraví raz za zariadenie — a na
          iPhone sa z toho v Safari stal trojriadkový návod, ktorý rozhádzal
          celú hlavičku. */}
      <Card>
        <H3>
          <Info
            label="Notifikácie na telefón"
            text="Kokpit sa dá pridať na plochu iPhonu ako appka a posielať upozornenia z registra. Chodia len tie, ktoré si pýtajú akciu, a len tomu trénerovi, ktorého sa týkajú. Rovnaká vec príde raz, nie pri každom behu plánovača."
          />
        </H3>
        <PushOdber />
      </Card>

      {/* Kontá pred vzhľadom: kto sa prihlasuje, je prevádzková vec, farebná
          schéma je vkus. */}
      <Card>
        <H3><KontaNadpis /></H3>
        <Konta />
      </Card>

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

      {/* Verzia úplne dole a nenápadne. Nie je to nastavenie, je to odpoveď na
          jedinú otázku: „mám tú najnovšiu?" — a tá sa pýta len vtedy, keď
          niečo nesedí. Na iPhone má zmysel obzvlášť: appka beží zo Safari
          a po návrate z pozadia môže pokračovať starý kód v pamäti. */}
      <Verzia />
    </>
  );
}

function Verzia() {
  const subor = kontrolnySubor();
  const cas = CAS_BUILDU ? new Date(CAS_BUILDU) : null;
  const [naServeri, setNaServeri] = useState<string | null>(null);
  useEffect(() => { void verziaServera().then(setNaServeri); }, []);
  // Reťazce sa porovnávajú do znaku — nasadzovací skript ich vyberá priamo
  // z postaveného balíka, takže zhoda znamená naozaj tú istú verziu.
  const zastarana = !!naServeri && !!CAS_BUILDU && naServeri !== CAS_BUILDU;
  const cs = (d: Date) => `${fmtDMY(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return (
    <div style={{ marginTop: 18, paddingTop: 10, borderTop: `1px solid ${mix(C.border, 50)}`, fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
      <Info
        text={`Čas zostavenia verzie, ktorú máš PRÁVE OTVORENÚ. Appka sa zároveň pýta servera, čo je nasadené — keď sa to líši, beží ti staršia verzia z pamäte a napíše to sem. Na iPhone ju vtedy odpáľ z prepínača aplikácií a otvor znova, na počítači daj cmd+shift+R.${subor ? ` Bežiaci balík: ${subor}. Meno sa NEMUSÍ zhodovať s tým, čo vypíše nasadzovací skript — balík má viac kusov a každý má vlastný odtlačok; rozhoduje čas.` : ""}`}
        label={<span style={{ color: zastarana ? C.orange : C.textDim }}>
          Verzia: {cas ? cs(cas) : "vývojová"}
        </span>}
      />
      {zastarana && (
        <div style={{ color: C.orange, marginTop: 3 }}>
          Na serveri je novšia ({cs(new Date(naServeri))}) — odpáľ appku z prepínača aplikácií a otvor ju znova.
        </div>
      )}
    </div>
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
      // Zámerne BEZ časovača. Predtým sa výsledok po 9 s sám skryl — a s ním aj
      // varovanie „N klientov má živý balíček, ale v súbore nie je". Jerry ho
      // pri jednom reporte nestihol prečítať (5. 9. 2026). Anomália pri importe
      // je presne to, čo sa nesmie stratiť skôr, než ju človek vidí; zavrie sa
      // krížikom nižšie.
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Výsledok nahrania</span>
            <button
              onClick={() => setUploadResult(null)}
              style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12 }}
            >
              ✕ zavrieť
            </button>
          </div>
          {uploadResult.map((r, i) => (
            <div key={i}>
              <div style={{ padding: 9, marginBottom: 4, fontSize: 12, borderRadius: 8, background: r.error ? C.redBg : C.greenBg, color: r.error ? C.red : C.green }}>
                {r.filename}: {r.error ? r.error : `${r.type} — pridané ${r.added}${r.skipped ? `, preskočené ${r.skipped} (duplicity)` : ""}${r.zamknute ? `, ${r.zamknute} odmietnutých (uzavretý mesiac)` : ""}`}
              </div>
              {/*
                Čiastočný export vyzerá presne ako úplný — obe hlásia „hotovo".
                Rozdiel je len v tom, koho v súbore NIE JE, a to sa bez tohto
                riadku nedozvie nikto. Preto je to varovanie, nie chyba: import
                prebehol správne, len možno nad menším výsekom, než si myslíš.
              */}
              {r.chybaju && r.chybaju.length > 0 && (
                <div style={{ padding: 9, marginBottom: 8, fontSize: 12, borderRadius: 8, background: C.orangeBg, color: C.orange }}>
                  Pozor: {r.chybaju.length}{" "}
                  {r.chybaju.length === 1 ? "klient má" : r.chybaju.length < 5 ? "klienti majú" : "klientov má"}{" "}
                  v appke živý balíček, ale v tomto súbore {r.chybaju.length === 1 ? "nie je" : "nie sú"} —
                  ich zostatky ostali nezmenené. Ak to nemá byť tak, exportuj z PTminderu širší rozsah.
                  {/* Pri úplne čiastkovom súbore ich môže byť aj štyridsať —
                      stena mien nikoho neinformuje, prvá desiatka stačí na to,
                      aby bolo vidno, o aký druh ľudí ide. */}
                  <div style={{ marginTop: 4, opacity: 0.85 }}>
                    {r.chybaju.slice(0, 10).join(" · ")}
                    {r.chybaju.length > 10 ? ` … a ďalších ${r.chybaju.length - 10}` : ""}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
          const znak = je ? "✓" : "✗";
          const farba = je ? C.green : C.orange;
          return (
            <div key={m.druh} style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: "flex", gap: 8 }}>
              <span style={{ color: farba, flexShrink: 0 }}>{znak}</span>
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
/**
 * Kód pre web. Jedno miesto, kde je napísaný — kto ho zmení, zmení ho tu.
 *
 * `wpcf7mailsent` je jediná udalosť Contact Form 7, ktorá znamená ODOSLANÉ.
 * `wpcf7submit` sa spustí aj pri chybe validácie a klik na tlačidlo nehovorí
 * o ničom. Na tomto rozdiele stojí, či „konverzia" v Mete znamená dopyt.
 */
function snippetWeb(url: string, tajne: string): string {
  return [
    "<script>",
    "// PSB — dopyt z formulára do Kokpitu aj do Mety. Vlož do päty webu.",
    "(function(){",
    "  // UTM sa ukladá hneď pri príchode. Kto medzitým klikne inam, o kampaň už neprišiel.",
    "  try{var q=new URLSearchParams(location.search);var u={};['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){if(q.get(k))u[k]=q.get(k);});",
    "  if(Object.keys(u).length)localStorage.setItem('psb_utm',JSON.stringify(u));}catch(e){}",
    "  document.addEventListener('wpcf7mailsent',function(e){",
    "    try{",
    "      var f=(e.detail&&e.detail.inputs)||[];var v=function(n){for(var i=0;i<f.length;i++)if(f[i].name===n)return String(f[i].value||'');return '';};",
    "      var email=(v('your-email')||v('email')).trim().toLowerCase();var tel=v('your-tel')||v('tel')||v('telefon');var meno=v('your-name')||v('meno');",
    "      var den=new Date().toISOString().slice(0,10);",
    "      var id=('web-'+den+'-'+(email||tel||meno).toLowerCase()).slice(0,64);",
    "      var u={};try{u=JSON.parse(localStorage.getItem('psb_utm')||'{}');}catch(x){}",
    "      var ck=function(n){var m=document.cookie.match('(^|;)\\s*'+n+'\\s*=\\s*([^;]+)');return m?m.pop():'';};",
    "      if(window.fbq)fbq('track','Lead',{},{eventID:id});",
    "      fetch('" + url + "',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({",
    "        secret:'" + tajne + "',id:id,name:meno,email:email,telefon:tel,message:v('your-message')||v('sprava'),",
    "        utm_source:u.utm_source||'',utm_medium:u.utm_medium||'',utm_campaign:u.utm_campaign||'',",
    "        utm_content:u.utm_content||'',utm_term:u.utm_term||'',page:location.href,fbc:ck('_fbc'),fbp:ck('_fbp')",
    "      })});",
    "    }catch(err){}",
    "  });",
    "})();",
    "<\/script>",
  ].join("\n");
}

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

      {/* ── Hotový snippet ────────────────────────────────────────────────
          Dovtedy dávala appka adresu a tajomstvo a kód si musel Jerry napísať
          sám. Tri veci sa pritom dajú spraviť nenápadne zle a každá zabije
          meranie:

          1. Udalosť `Lead` sa pošle pri NAČÍTANÍ stránky alebo pri KLIKNUTÍ
             na tlačidlo. Potom Meta hlási konverzie, ktoré nie sú dopyty —
             presne ako Google Ads s 299 konverziami na 13 klientov.
             `wpcf7mailsent` sa spustí až keď mail naozaj odišiel.
          2. `event_id` v prehliadači a na serveri sa líšia, takže Meta
             započíta jeden dopyt dvakrát.
          3. UTM parametre sa čítajú z adresy AŽ pri odoslaní. Kto medzitým
             klikol na inú stránku, prišiel o kampaň — preto sa ukladajú
             hneď pri príchode. */}
      {tajne && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 4 }}>
            Hotový kód do päty webu (WordPress → Vzhľad → Editor / plugin na skripty):
          </div>
          <textarea
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            value={snippetWeb(url, ukaz ? tajne : "TAJOMSTVO-ZOBRAZ-VYSSIE")}
            style={{ width: "100%", height: 150, background: C.bg, color: C.textMuted, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: 8, fontSize: 10.5, fontFamily: "monospace", lineHeight: 1.45 }}
          />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.55 }}>
            Posiela sa až po ÚSPEŠNOM odoslaní formulára, nie pri kliknutí a nie pri načítaní stránky —
            to je rozdiel medzi konverziou a tým, že sa niekto pozrel na stránku. Pixel aj server použijú
            rovnaké <code>event_id</code>, takže Meta započíta dopyt raz.
            {!ukaz && " Klikni na tlačidlo ukázať vyššie, nech je v kóde aj tajomstvo."}
          </div>
        </div>
      )}
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
/**
 * MailerLite.
 *
 * Prečo to má vlastný panel a nie riadok pri Mete: je to iný kanál a iná
 * otázka. Meta hovorí, koľko stál dosah; toto hovorí, či formulár na
 * /dychani vôbec zbiera maily — a to sa od júla nevie.
 */
/**
 * Čo Jarvis vie zvonku — rešerše a príručky uložené natrvalo.
 *
 * PREČO TO NIE SÚ „dokumenty v Jarvisovi"
 *
 * Tie sú prílohy k JEDNEJ debate a ich obsah sa po 30 dňoch maže, aby sa 5 MB
 * PDF neprepisovalo do histórie pri každej správe. Vedomosť má platiť dlhšie
 * než mesiac, tak žije inde — a preto je aj tu, nie v okne rozhovoru.
 *
 * Text sa načítava až na klik. V zozname stačí vedieť, ČO Jarvis pozná a AKO
 * je to staré; osemtisíc znakov rešerše by tu inak ležalo pri každom otvorení
 * obrazovky.
 */
function CoJarvisVieZvonku({ data }: { data: PSBData }) {
  const [otvorene, setOtvorene] = useState<string>("");
  const [text, setText] = useState<Record<string, string>>({});
  const zoznam = data.vedomosti || [];
  if (!zoznam.length) return null;

  const otvor = (id: string) => {
    if (otvorene === id) { setOtvorene(""); return; }
    setOtvorene(id);
    if (text[id]) return;
    void fetch(`/api/vedomost?id=${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { vedomost?: { text?: string } }) => setText((p) => ({ ...p, [id]: j.vedomost?.text || "(text sa nenačítal)" })))
      .catch(() => setText((p) => ({ ...p, [id]: "(text sa nenačítal)" })));
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.textDim, margin: "2px 0 6px" }}>
        <Info
          label={`Čo Jarvis vie zvonku (${zoznam.length})`}
          text="Rešerše a príručky uložené NATRVALO — na rozdiel od dokumentov priložených k rozhovoru, ktorých obsah sa po 30 dňoch maže. Jarvis má v kontexte prehľad a text si vytiahne, keď ho potrebuje. Každá vedomosť má lehotu: keď ju prekročí, ozve sa upozornenie, že ju treba obnoviť — benchmarky a odporúčania sa menia a stará rešerš vyzerá presvedčivo aj vtedy, keď už neplatí."
        />
      </div>
      {zoznam.map((v) => {
        const dni = Math.floor((Date.now() - Date.parse(v.overeneAt || "")) / 86400000);
        const stare = !!v.obnovovatPoDnoch && Number.isFinite(dni) && dni > v.obnovovatPoDnoch;
        const zostava = v.obnovovatPoDnoch && Number.isFinite(dni) ? v.obnovovatPoDnoch - dni : null;
        return (
          <div key={v.id} style={{ padding: "8px 10px", marginBottom: 6, background: mix(C.text, 4), border: `1px solid ${stare ? C.orange : C.border}`, borderRadius: 9 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <button onClick={() => otvor(v.id)}
                style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, fontWeight: 600, color: C.text, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                {otvorene === v.id ? "▾" : "▸"} {v.nazov}
              </button>
              <span style={{ fontSize: 11, color: stare ? C.orange : C.textDim, marginLeft: "auto" }}>
                {stare
                  ? `treba obnoviť — ${dni} dní, lehota bola ${v.obnovovatPoDnoch}`
                  : zostava !== null ? `overené ${fmtDMY((v.overeneAt || "").slice(0, 10))} · obnoviť o ${zostava} dní` : `overené ${fmtDMY((v.overeneAt || "").slice(0, 10))}`}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>{v.oCom}</div>
            {otvorene === v.id && (
              <>
                {v.zdroj && <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>Zdroj: {v.zdroj}</div>}
                <pre style={{ marginTop: 8, padding: 10, background: mix(C.text, 3), borderRadius: 8, fontSize: 11.5, lineHeight: 1.6, color: C.textMuted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 420, overflowY: "auto", fontFamily: "inherit" }}>
                  {text[v.id] || "načítavam…"}
                </pre>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NapojenieMailer() {
  const [stav, setStav] = useState<{ maToken: boolean; odberatelia: unknown[]; kampane: unknown[] } | null>(null);
  const [token, setToken] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [robim, setRobim] = useState(false);

  const nacitaj = () => void fetch("/api/mailer", { credentials: "same-origin" })
    .then((r) => r.json()).then((j) => { if (j.ok) setStav(j); }).catch(() => {});
  useEffect(nacitaj, []);

  const posli = async (telo: Record<string, unknown>, hotovo: string) => {
    setRobim(true); setHlaska("");
    const j = await fetch("/api/mailer", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setRobim(false);
    setHlaska(j.ok ? (j.sprava || hotovo) : `Nepodarilo sa: ${j.error || "neznáma chyba"}`);
    nacitaj();
    return j;
  };

  if (!stav) return null;
  const btn = { fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: robim ? "default" : "pointer", opacity: robim ? 0.5 : 1 } as const;

  return (
    <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
        <Info
          label="MailerLite — odberatelia a kampane"
          text="Ťahá odberateľov aj s dátumom prihlásenia a odoslané kampane s otvorenosťou. Zmysel: formulár na /dychani zbiera MAILY, nie dopyty — takže otázka „funguje?“ znie „pribúdajú odberatelia?“, a odpoveď nie je nikde inde. Otvorenia a prekliky sa berú ako UNIKÁTNE počty; celkové by pri jednom človeku, čo si mail otvoril päťkrát, tvrdili, že záujem je päťnásobný. Token sa uloží na serveri a späť do prehliadača sa už neposiela."
        />
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
        Token: <b style={{ color: stav.maToken ? C.green : C.orange }}>{stav.maToken ? "uložený" : "chýba"}</b>
        {" · "}odberateľov: <b style={{ color: C.text }}>{stav.odberatelia?.length ?? 0}</b>
        {" · "}kampaní: <b style={{ color: C.text }}>{stav.kampane?.length ?? 0}</b>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
          placeholder={stav.maToken ? "vložiť nový token…" : "token z MailerLite → Integrations → API"}
          style={{ ...S.input, width: 280, marginBottom: 0 }} />
        <button disabled={robim || token.trim().length < 20} style={btn}
          onClick={() => void posli({ akcia: "uloz-token", token: token.trim() }, "Token uložený.").then(() => setToken(""))}>
          Uložiť token
        </button>
        <button disabled={robim || !stav.maToken} style={btn}
          onClick={() => void posli({ akcia: "test" }, "")}>Skúška spojenia</button>
        <button disabled={robim || !stav.maToken} style={btn}
          onClick={() => void posli({ akcia: "stiahni" }, "Stiahnuté.")}>Stiahnuť odberateľov a kampane</button>
      </div>
      {hlaska && <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, marginTop: 6 }}>{hlaska}</div>}
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
        Token nájdeš v MailerLite → <b style={{ color: C.textMuted }}>Integrations → API → Create new API token</b>.
        Nechaj „All IPs allowed“ — Kokpit beží na Cloudflare a nemá pevnú IP adresu.
      </div>
    </div>
  );
}

/**
 * GA4 a Search Console cez jeden servisný účet.
 *
 * PREČO JE TO JEDEN PANEL A NIE DVA
 *
 * Je to jeden kľúč z jedného Google Cloud projektu. Dva panely by tvrdili, že
 * sú to dve napojenia, a Jerry by hľadal dva kľúče.
 *
 * PREČO SÚ TU DVE POLÍČKA NAVYŠE
 *
 * Kľúč sám o sebe nevie, ktorý web má čítať — property ID a adresu webu treba
 * povedať zvlášť. A prístup sa udeľuje ešte na dvoch ďalších miestach: v GA4
 * a v Search Console. Preto je pod tlačidlami napísaný celý postup vrátane
 * e-mailu servisného účtu, ktorý sa tam vkladá.
 */
function NapojenieGoogle() {
  const [stav, setStav] = useState<{ maKluc: boolean; email: string; property: string; site: string; ga4Mesiacov: number; gscMesiacov: number } | null>(null);
  const [kluc, setKluc] = useState("");
  const [property, setProperty] = useState("");
  const [site, setSite] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [robim, setRobim] = useState(false);

  const nacitaj = () => void fetch("/api/google", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j) => { if (j.ok) { setStav(j); setProperty(j.property || ""); setSite(j.site || ""); } })
    .catch(() => {});
  useEffect(nacitaj, []);

  const posli = async (telo: Record<string, unknown>, hotovo: string) => {
    setRobim(true); setHlaska("");
    const j = await fetch("/api/google", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setRobim(false);
    setHlaska(j.ok ? (j.sprava || hotovo) : `Nepodarilo sa: ${j.error || "neznáma chyba"}`);
    nacitaj();
    return j;
  };

  if (!stav) return null;
  const btn = { fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: robim ? "default" : "pointer", opacity: robim ? 0.5 : 1 } as const;

  return (
    <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
        <Info
          label="Google — GA4 a Search Console"
          text="Dve polovice tej istej otázky: Search Console hovorí, na čo sa ľudia pýtajú SKÔR, než prídu na web, GA4 hovorí, čo urobili potom. Obidve idú cez jeden servisný účet, takže napojenie je jedno. Píše do tých istých tabuliek ako doterajší ručný import CSV — kľúčom je mesiac, takže nový sťah ten istý mesiac prepíše, nepripočíta. Kľúč sa uloží na serveri a späť do prehliadača sa už neposiela."
        />
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
        Kľúč: <b style={{ color: stav.maKluc ? C.green : C.orange }}>{stav.maKluc ? "uložený" : "chýba"}</b>
        {" · "}GA4: <b style={{ color: C.text }}>{stav.ga4Mesiacov}</b> mes.
        {" · "}Search Console: <b style={{ color: C.text }}>{stav.gscMesiacov}</b> mes.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
        <textarea value={kluc} onChange={(e) => setKluc(e.target.value)}
          placeholder={stav.maKluc ? "vložiť nový kľúč (celý JSON)…" : "sem vlož celý obsah JSON súboru zo servisného účtu"}
          style={{ ...S.input, width: 360, height: 58, marginBottom: 0, fontFamily: "ui-monospace, monospace", fontSize: 11 }} />
        <button disabled={robim || kluc.trim().length < 50} style={btn}
          onClick={() => void posli({ akcia: "uloz-kluc", kluc: kluc.trim() }, "Kľúč uložený.").then(() => setKluc(""))}>
          Uložiť kľúč
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <input value={property} onChange={(e) => setProperty(e.target.value)}
          placeholder="GA4 property ID (číslo)" style={{ ...S.input, width: 190, marginBottom: 0 }} />
        <input value={site} onChange={(e) => setSite(e.target.value)}
          placeholder="adresa webu, napr. prosapiens.cz" style={{ ...S.input, width: 230, marginBottom: 0 }} />
        <button disabled={robim} style={btn}
          onClick={() => void posli({ akcia: "uloz-ciele", property, site }, "Uložené.")}>Uložiť</button>
        <button disabled={robim || !stav.maKluc} style={btn}
          onClick={() => void posli({ akcia: "test" }, "")}>Skúška spojenia</button>
        <button disabled={robim || !stav.maKluc} style={btn}
          onClick={() => void posli({ akcia: "stiahni", mesiacov: 18 }, "Stiahnuté.")}>Stiahnuť 18 mesiacov</button>
      </div>

      {hlaska && <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, marginTop: 6 }}>{hlaska}</div>}

      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.6 }}>
        <b style={{ color: C.textMuted }}>Keby API prestalo chodiť:</b> dáta sa dajú nahrať aj ručne ako CSV —
        GA4 → Prehľady › Prehľad stavu prehľadov › Stiahnuť CSV, a Search Console → Výsledky vyhľadávania ›
        Exportovať › CSV (zo ZIPu treba Graf, Dopyty a Strany). Import ich stále pozná; píšu do tých istých tabuliek.
      </div>
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.6 }}>
        <b style={{ color: C.textMuted }}>Postup:</b> v Google Cloud zapni <b style={{ color: C.textMuted }}>Google Analytics Data API</b> (nie
        „Google Analytics API“ — tá je stará a GA4 dáta neposiela) a <b style={{ color: C.textMuted }}>Google Search Console API</b>.
        Potom IAM → Service Accounts → vytvor účet → Keys → Add key → JSON, a ten súbor vlož sem.
        {stav.email && (
          <>
            {" "}Nakoniec ten istý e-mail — <b style={{ color: C.textMuted, userSelect: "all" }}>{stav.email}</b> — pridaj ako
            čitateľa v GA4 (Admin → Property access management) aj v Search Console (Nastavenia → Používatelia a povolenia).
            Bez toho vráti Google 403 aj s platným kľúčom.
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Google Ads — token vývojára a manažérsky účet.
 *
 * PREČO JE TO ODDELENÉ OD GA4
 *
 * Prihlásenie je to isté (ten istý servisný účet), ale prístup sa udeľuje na
 * inom mieste a token vývojára je vec, ktorú GA4 nepozná. Jedna spoločná karta
 * by na chybu v jednom hlásila „Google nefunguje" a poslala hľadať na
 * nesprávnu stranu.
 *
 * ČO TU ZATIAĽ NIE JE
 *
 * Objem hľadania z plánovača kľúčových slov. Token na úrovni „prieskumník" ho
 * blokuje; žiadosť o Basic je podaná 14. 8. 2026. Keď príde, pribudne dopyt —
 * nie nová karta.
 */
/**
 * Prečítanie textu vlastného webu.
 *
 * PREČO TO NIE JE JEDEN KLIK A HOTOVO
 *
 * Web má 79 stránok a Worker má strop podžiadostí na jedno volanie. Osemdesiat
 * fetchov ho prerazí — a zlyhalo by to v polovici, takže by v tabuľke zostala
 * náhodná polovica webu bez toho, aby to niekto poznal. Preto sa čítanie robí
 * po dávkach a tlačidlo hlási, koľko ešte zostáva.
 */
function NapojenieTextWebu() {
  const [stav, setStav] = useState<{ vsetky: number; sText: number; naposledy: string | null } | null>(null);
  const [hlaska, setHlaska] = useState("");
  const [robim, setRobim] = useState(false);

  const nacitaj = () => void fetch("/api/web-obsah", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j) => { if (j.ok) setStav(j); })
    .catch(() => {});
  useEffect(nacitaj, []);

  /**
   * Číta dávku za dávkou, kým nie je hotovo — klikáš raz.
   *
   * Dávka je 40 stránok, lebo dlhší request na Cloudflare vyprší. Kým sa
   * pokračovanie nechávalo na človeka, appka stála na 38 zo 79 stránok
   * a Jarvis na otázku o obsahu stránky odpovedal, že text nemá. Text webu
   * je jeho jediný zdroj o tom, čo na stránkach STOJÍ — nechať ho
   * natiahnutý na polovicu znamená nechať polovicu odpovedí nepravdivých.
   *
   * Poistka proti nekonečnu: keď kolo neprečíta ani jednu stránku, končí sa.
   */
  const posli = async (telo: Record<string, unknown>) => {
    setRobim(true); setHlaska("");
    let spolu = 0;
    const chybySpolu: string[] = [];
    let j: { ok?: boolean; sprava?: string; error?: string; chyby?: string[]; nacitane?: number; zostava?: number } = {};
    for (let kolo = 0; kolo < 12; kolo++) {
      j = await fetch("/api/web-obsah", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        // „obnov" patrí len do prvého kola; v ďalších by mazalo, čo práve prišlo.
        body: JSON.stringify(kolo === 0 ? telo : {}),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
      if (j.error) break;
      spolu += j.nacitane ?? 0;
      for (const c of j.chyby || []) if (!chybySpolu.includes(c)) chybySpolu.push(c);
      const zostava = j.zostava ?? 0;
      if (!zostava) break;
      if (!(j.nacitane ?? 0)) break;
      setHlaska(`Čítam… ${spolu} hotových, zostáva ${zostava}.`);
      nacitaj();
    }
    setRobim(false);
    // Aj keď časť stránok zlyhá, zvyšok je uložený — preto sa hlási oboje.
    setHlaska(
      j.error
        ? j.error
        : `Prečítané: ${spolu} stránok.${(j.zostava ?? 0) > 0 ? ` Zostáva ${j.zostava} — klikni znova.` : " Web je celý vnútri."}`
          + (chybySpolu.length ? ` Nepodarilo sa: ${chybySpolu.join("; ")}` : ""),
    );
    nacitaj();
  };

  const chyba = (stav?.vsetky ?? 0) - (stav?.sText ?? 0);
  const btn = { fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: robim ? "default" : "pointer", opacity: robim ? 0.5 : 1 } as const;
  return (
    <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
        <Info
          label="Text webu — titulky, popisy a obsah stránok"
          text="Číta text vlastného webu zo sitemapy WordPressu. Kokpit o webe dovtedy vedel len čísla — kto prišiel a na čo hľadal — nie čo na stránkach STOJÍ, takže sa dalo povedať „15 777 zobrazení, 97 klikov“ a nedalo sa povedať, čo s tým. Po prečítaní je v Marketingu → Web karta „Titulky na prepis“ a Jarvis dostane SQL prístup k celému textu, takže sa dá spýtať na hocijakú stránku. Nepotrebuje kľúč ani token: web je verejný."
        />
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.6 }}>
        Stránok s textom: <b style={{ color: (stav?.sText ?? 0) > 0 ? C.green : C.orange }}>{stav?.sText ?? 0}</b>
        {" z "}<b style={{ color: C.text }}>{stav?.vsetky ?? 0}</b>
        {chyba > 0 && <> · chýba <b style={{ color: C.orange }}>{chyba}</b></>}
        {stav?.naposledy && <> · naposledy {fmtDMY(stav.naposledy)}</>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn} disabled={robim} onClick={() => void posli({})}>
          {chyba > 0 || !stav?.sText ? "Prečítať web" : "Skontrolovať nové stránky"}
        </button>
        <button style={{ ...btn, borderColor: C.textMuted, color: C.textMuted }} disabled={robim} onClick={() => void posli({ akcia: "obnov" })}>
          Prečítať odznova (zvyčajne netreba)
        </button>
      </div>
      {hlaska && <div style={{ fontSize: 12, color: C.text, marginTop: 8 }}>{hlaska}</div>}
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
        Keď stránku upravíš vo WordPresse, appka to pozná z dátumu v sitemape a text
        si natiahne sama pri najbližšej kontrole — nemusíš si to pamätať. „Odznova“ je
        len na prípad, že by sa text zmenil bez toho dátumu (napríklad po zmene šablóny).
      </div>
    </div>
  );
}

/**
 * Meranie rýchlosti stránok cez PageSpeed Insights.
 *
 * PREČO SA KĽÚČ PÝTA, HOCI TO IDE AJ BEZ NEHO
 *
 * Bez kľúča Google pustí zopár meraní z jednej adresy za hodinu a potom vráti
 * 429. Pri dvadsiatich stránkach krát dve zariadenia sa na to narazí hneď —
 * a hláška „HTTP 429" vyzerá ako chyba appky, nie ako obmedzenie zadarmo.
 * Preto sa to pýta a preto to karta hovorí rovno.
 */
function NapojenieRychlost() {
  const [stav, setStav] = useState<{ maKluc: boolean; stranok: number; merani: number; naposledy: string | null; ciel: number } | null>(null);
  const [kluc, setKluc] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [robim, setRobim] = useState(false);

  const nacitaj = () => void fetch("/api/pagespeed", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j) => { if (j.ok) setStav(j); })
    .catch(() => {});
  useEffect(nacitaj, []);

  const jedna = async (telo: Record<string, unknown>) =>
    await fetch("/api/pagespeed", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));

  const posli = async (telo: Record<string, unknown>) => {
    setRobim(true); setHlaska("");
    const j = await jedna(telo);
    setRobim(false);
    setHlaska(j.sprava ? j.sprava + (j.chyby?.length ? ` Nepodarilo sa: ${j.chyby.join("; ")}` : "") : (j.error || "Nepodarilo sa."));
    setKluc("");
    nacitaj();
  };

  /**
   * Zmerať všetko — dávka po dávke, kým nie je hotovo.
   *
   * PREČO TO ROBÍ PREHLIADAČ A NIE SERVER
   *
   * Dávka po troch je daná Workerom: dvadsať stránok krát dve zariadenia
   * je pol hodiny a request by vypršal. Ale to je dôvod, prečo je po troch
   * jedno VOLANIE — nie dôvod, prečo má trinásťkrát klikať človek. Čakanie
   * medzi dávkami je práca pre stroj.
   *
   * POISTKY
   *
   * Cyklus sa zastaví, keď zvyšok klesne na nulu, keď volanie vráti chybu,
   * alebo keď sa zvyšok dvakrát za sebou nezmenší — bez tej poslednej by
   * zaseknuté meranie krútilo dokola donekonečna.
   */
  const zmerajVsetko = async () => {
    setRobim(true); setHlaska("Meriam… jedno meranie trvá 10–30 s.");
    let hotovych = 0, chybnych = 0, stoji = 0, predtym = -1;
    for (let kolo = 0; kolo < 40; kolo++) {
      const j = await jedna({});
      if (!j.sprava && j.error) { setHlaska(`Zastavené: ${j.error}`); break; }
      hotovych += Number(j.ulozene) || 0;
      chybnych += (j.chyby?.length as number) || 0;
      const zostava = Number(j.zostava) || 0;
      setHlaska(`Zmerané ${hotovych}, zostáva ${zostava}…` + (chybnych ? ` (${chybnych} neprešlo)` : ""));
      nacitaj();
      if (zostava === 0) { setHlaska(`Hotovo — zmerané ${hotovych}.` + (chybnych ? ` ${chybnych} meraní neprešlo; nezmerané a pomalé nie je to isté, v tabuľke nie sú ako nuly.` : "")); break; }
      stoji = zostava === predtym ? stoji + 1 : 0;
      predtym = zostava;
      if (stoji >= 2) { setHlaska(`Zastavené: zvyšok ${zostava} sa prestal zmenšovať. Skús to znova neskôr — Google mohol začať odmietať merania.`); break; }
    }
    setRobim(false);
    nacitaj();
  };

  const btn = { fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: robim ? "default" : "pointer", opacity: robim ? 0.5 : 1 } as const;
  return (
    <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
        <Info
          label="Rýchlosť stránok — PageSpeed Insights"
          text="Jediná vec z technického SEO, ktorá sa nedá spočítať z textu: či človek po kliknutí niečo uvidí skôr, než mu dôjde trpezlivosť. Google si stránku naozaj otvorí v prehliadači a odsimuluje pomalé mobilné pripojenie, preto jedno meranie trvá 10–30 s a meria sa po troch. Merajú sa stránky, ktoré Google ľuďom najviac ukazuje — pri stránke s nula zobrazeniami je jej rýchlosť údaj bez akcie. Mobil aj počítač zvlášť; rozhoduje mobil."
        />
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.6 }}>
        Kľúč: <b style={{ color: stav?.maKluc ? C.green : C.orange }}>{stav?.maKluc ? "uložený" : "chýba"}</b>
        {" · "}zmeraných stránok: <b style={{ color: C.text }}>{stav?.stranok ?? 0}</b> z {stav?.ciel ?? 20}
        {stav?.naposledy && <> · naposledy {fmtDMY(stav.naposledy)}</>}
        {!stav?.maKluc && (
          <>
            <br />
            Bez kľúča to beží tiež, ale Google po pár meraniach vráti 429. Kľúč je zadarmo:
            Google Cloud Console → APIs &amp; Services → Credentials → Create credentials → API key,
            a v Library zapnúť „PageSpeed Insights API". Je to ten istý projekt ako GA4.
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="password" value={kluc} onChange={(e) => setKluc(e.target.value)}
          placeholder="API kľúč (vložením sa uloží na server)"
          style={{ flex: "1 1 260px", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: `1px solid ${mix(C.text, 20)}`, background: "transparent", color: C.text }}
        />
        <button style={btn} disabled={robim || !kluc.trim()} onClick={() => void posli({ akcia: "kluc", kluc })}>
          Uložiť kľúč
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button style={btn} disabled={robim} onClick={() => void zmerajVsetko()}>
          {robim ? "Meriam…" : "Zmerať, čo chýba"}
        </button>
        <button style={{ ...btn, borderColor: C.textMuted, color: C.textMuted }} disabled={robim}
          onClick={() => void posli({ akcia: "obnov" }).then(() => zmerajVsetko())}>
          Premerať odznova
        </button>
      </div>
      {hlaska && <div style={{ fontSize: 12, color: C.text, marginTop: 8 }}>{hlaska}</div>}
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
        Meranie beží dávkami po troch — to je strop jedného volania, nie práca pre teba:
        tlačidlo dobehne až do konca samo, len nechaj okno otvorené. Trvá to zhruba
        minútu na tri stránky. „Premerať odznova“ má zmysel po zásahu do webu — história
        sa nemaže, takže sa dá porovnať stav pred a po. To je jediné, čo pri rýchlosti
        naozaj zaujíma.
      </div>
    </div>
  );
}

function NapojenieGoogleAds() {
  const [stav, setStav] = useState<{
    maToken: boolean; manager: string; email: string;
    kampani: number; dopytov: number;
    ucty: { id: string; nazov: string; valuta: string; je_manager: number }[];
  } | null>(null);
  const [token, setToken] = useState("");
  const [manager, setManager] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [robim, setRobim] = useState(false);

  const nacitaj = () => void fetch("/api/google-ads", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j) => { if (j.ok) { setStav(j); setManager(j.manager || ""); } })
    .catch(() => {});
  useEffect(nacitaj, []);

  const posli = async (telo: Record<string, unknown>, hotovo: string) => {
    setRobim(true); setHlaska("");
    const j = await fetch("/api/google-ads", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setRobim(false);
    // Čiastočný úspech sa hlási ako čiastočný — „stiahnuté" nad polovicou dát
    // je horšie než chyba, lebo sa k tomu nikto nevráti.
    const chyby = Array.isArray(j.chyby) && j.chyby.length ? ` Nepodarilo sa: ${j.chyby.join("; ")}` : "";
    setHlaska(j.ok || j.sprava ? `${j.sprava || hotovo}${chyby}` : `Nepodarilo sa: ${j.error || "neznáma chyba"}`);
    nacitaj();
    return j;
  };

  if (!stav) return null;
  const btn = { fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: robim ? "default" : "pointer", opacity: robim ? 0.5 : 1 } as const;

  return (
    <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
        <Info
          label="Google Ads — výkon a hľadané výrazy"
          text="Ťahá, čo naozaj stála reklama na Googli, a hlavne SKUTOČNÉ vety, ktoré ľudia napísali do vyhľadávania predtým, než klikli. To je cennejšie než akýkoľvek odhad objemu hľadania — sú to dáta kúpené vlastnými peniazmi. Prihlasuje sa tým istým servisným účtom ako GA4, ale prístup sa udeľuje inde: v Google Ads pod Správca → Prístup a zabezpečenie. Token vývojára sa uloží na serveri a späť do prehliadača sa neposiela. Objem hľadania z plánovača kľúčových slov zatiaľ nejde — token na úrovni „prieskumník“ ho blokuje a žiadosť o Basic je podaná."
        />
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.6 }}>
        Token: <b style={{ color: stav.maToken ? C.green : C.orange }}>{stav.maToken ? "uložený" : "chýba"}</b>
        {" · "}kampane: <b style={{ color: C.text }}>{stav.kampani}</b> riadkov
        {" · "}hľadané výrazy: <b style={{ color: C.text }}>{stav.dopytov}</b>
        {stav.email && (
          <>
            <br />
            <span>Servisný účet, ktorý treba pridať v Google Ads: </span>
            <b style={{ color: C.text, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{stav.email}</b>
          </>
        )}
        {stav.ucty.length > 0 && (
          <>
            <br />
            Účty: {stav.ucty.map((u) => `${u.nazov || u.id}${u.je_manager ? " (manažér)" : ""}`).join(", ")}
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input value={token} onChange={(e) => setToken(e.target.value)} type="password"
          placeholder={stav.maToken ? "vložiť nový token vývojára…" : "token vývojára (22 znakov)"}
          style={{ ...S.input, width: 230, marginBottom: 0, fontFamily: "ui-monospace, monospace", fontSize: 11 }} />
        <input value={manager} onChange={(e) => setManager(e.target.value)}
          placeholder="manažérsky účet, napr. 410-571-5629" style={{ ...S.input, width: 230, marginBottom: 0 }} />
        <button disabled={robim || (!token.trim() && !manager.trim())} style={btn}
          onClick={() => void posli({ akcia: "uloz-token", token: token.trim(), manager: manager.trim() }, "Uložené.").then(() => setToken(""))}>
          Uložiť
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <button disabled={robim || !stav.maToken} style={btn}
          onClick={() => void posli({ akcia: "test" }, "Spojenie funguje.")}>
          Skúsiť spojenie
        </button>
        <button disabled={robim || !stav.maToken} style={btn}
          onClick={() => void posli({ akcia: "stiahni" }, "Stiahnuté.")}>
          Stiahnuť
        </button>
      </div>

      {hlaska && (
        <div style={{ fontSize: 11.5, color: hlaska.startsWith("Nepodarilo") ? C.orange : C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          {hlaska}
        </div>
      )}
    </div>
  );
}


function NapojenieMeta() {
  const [stav, setStav] = useState<{ maToken: boolean; tokenPlatiDo?: string; pristup?: { volani: number; chybovost: number; splna: boolean; chyba: string }; maCapi: boolean; pixelId: string; adAccount: string; igUser: string; kampani: number; igPrispevkov: number } | null>(null);
  const [token, setToken] = useState("");
  const [ucet, setUcet] = useState("");
  const [ig, setIg] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [robim, setRobim] = useState(false);

  const nacitaj = () => void fetch("/api/meta", { credentials: "same-origin" }).then((r) => r.json())
    .then((j) => { if (j.ok) { setStav(j); setUcet(j.adAccount || ""); setIg(j.igUser || ""); setPixelId(j.pixelId || ""); } });
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
        {/* Krátky token z Graph Exploreru vyprší do hodiny a sťahovanie
            prestane fungovať uprostred mesiaca — bez tohto riadku to nikto
            nevidí, kým sa niečo nepokazí (19. 8. 2026). */}
        {stav.tokenPlatiDo && (() => {
          const bezKonca = stav.tokenPlatiDo === "bez expirácie";
          const doKedy = bezKonca ? null : new Date(stav.tokenPlatiDo);
          const dni = doKedy ? Math.round((doKedy.getTime() - Date.now()) / 86400000) : null;
          const zle = dni !== null && dni < 7;
          return (
            <span style={{ color: bezKonca ? C.green : zle ? C.orange : C.textMuted }}>
              {" · "}platí {bezKonca ? "bez obmedzenia" : `do ${doKedy!.toLocaleString("sk-SK", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              {zle && (dni! <= 0 ? " — vyprší dnes, predĺž ho" : ` — ostáva ${dni} dní`)}
            </span>
          );
        })()}
        {" · "}kampaní v appke: <b style={{ color: C.text }}>{stav.kampani}</b>
        {/* Cesta k Full Access. Od 19. 8. je potrebný UŽ LEN na pravý boost
            (reklama = ten istý príspevok aj s lajkami) — všetko ostatné appka
            robí aj bez neho, takže
            sa nedá propagovať príspevok — a bez počítadla by sa o prístup
            dalo požiadať len odhadom (19. 8. 2026). */}
        {stav.pristup && (
          <div style={{ marginTop: 4, fontSize: 11.5, color: stav.pristup.splna ? C.green : C.textMuted }}>
            Prístup k API: <b style={{ color: stav.pristup.splna ? C.green : C.text }}>{stav.pristup.volani} volaní</b> za 15 dní
            {stav.pristup.volani > 0 && `, chybovosť ${String(stav.pristup.chybovost).replace(".", ",")} %`}
            {stav.pristup.splna
              ? " — podmienky na Full Access splnené, dá sa oň požiadať."
              : ` — ${stav.pristup.chyba} Full Access treba už len na pravý boost (reklama zdedí lajky príspevku); propagácia zatiaľ beží kópiou obsahu.`}
          </div>
        )}
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

      {/* ── Conversions API ────────────────────────────────────────────────
          Iná vec než token vyššie a iný token. Ten hore ČÍTA kampane; tento
          PÍŠE konverzie. K 13. 8. 2026 nemal pixel ani jednu funkčnú
          konverziu — sedem vlastných visí na mŕtvom pixeli a tá jediná na
          živom nedostala nikdy žiadnu udalosť. */}
      <div style={{ borderTop: `1px solid ${mix(C.border, 60)}`, marginTop: 12, paddingTop: 12 }}>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
          <Info
            label="Ohlásiť dopyt Mete (Conversions API)"
            text="Keď na webe niekto odošle formulár, Kokpit to rovno ohlási Mete ako udalosť Lead — zo servera, takže to funguje aj vtedy, keď človek odmietne cookies a pixel sa vôbec nenačíta. Posiela sa ODTLAČOK e-mailu a telefónu (SHA-256), nie samotné údaje; meno sa neposiela vôbec. E-mail je najsilnejší identifikátor, aký existuje — kvalita spárovania pixela bola 5,1/10 práve preto, že s návštevami nechodil žiadny."
          />
          {" · "}stav: <b style={{ color: stav.maCapi ? C.green : C.orange }}>{stav.maCapi ? "zapnuté" : "vypnuté"}</b>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="ID pixela (Dataset ID)"
            style={{ ...S.input, width: 200, marginBottom: 0 }} />
          <input type="password" value={capiToken} onChange={(e) => setCapiToken(e.target.value)}
            placeholder={stav.maCapi ? "vložiť nový token…" : "token pre Conversions API"}
            style={{ ...S.input, width: 250, marginBottom: 0 }} />
          <button disabled={robim || !pixelId.trim()} style={btn}
            onClick={() => void posli({ akcia: "uloz-capi", capiToken: capiToken.trim(), pixelId: pixelId.trim() }, "Uložené.").then(() => setCapiToken(""))}>
            Uložiť
          </button>
          <button disabled={robim || !stav.maCapi} style={btn}
            onClick={() => void posli({ akcia: "skuska-capi" }, "Skúšobný Lead odoslaný — pozri v Events Manager → Test events.")}>
            Poslať skúšobný Lead
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Token nájdeš v Events Manager → tvoj pixel → Nastavenia → Conversions API → <b style={{ color: C.textMuted }}>Generate access token</b>.
          ID pixela je tam hore ako Dataset ID.
        </div>
      </div>

      {hlaska && <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, marginTop: 4 }}>{hlaska}</div>}
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
        Token nikam neposielaj mailom ani v chate — vkladá sa priamo sem.
      </div>
    </div>
  );
}
