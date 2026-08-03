import { useEffect, useRef, useState } from "react";

import { fmtDMY } from "../../lib/psb/format";
import { jeBankovyVypis } from "../../lib/psb/fio";
import { C, mix, S, badge, btn } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { IngestResult } from "../../lib/psb/db.server";
import type { Actions } from "./App";
import { BankovyImport } from "./Banka";
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
  path: "Fio → Výpisy a reporty › Pohyby na všech účtech (CSV), alebo text z internetbankingu",
};

// Marketingové zdroje. Zatiaľ sa len ukladajú — obrazovka Marketing beží na
// jednorazovom exporte spracovanom ručne. V zozname sú napriek tomu, lebo
// hrozba nie je zobrazenie, ale strata: Metricoolu v novembri prepadnú staršie
// príspevky a čo sa nestiahne dovtedy, už nezískame.
const MARKETING_ZDROJE: { druh: string; label: string; path: string }[] = [
  { druh: "metricool", label: "Metricool — príspevky, reels, stories", path: "Metricool → Analytics › Export › CSV. Tri samostatné súbory: instagram-posts, instagram-reels, instagram-stories. PDF ani PPTX sa načítať nedajú — sú to hotové zostavy, nie tabuľky." },
  { druh: "ga4", label: "Google Analytics 4", path: "GA4 → Prehľady › Prehľad stavu prehľadov › Stiahnuť CSV (jeden súbor za mesiac)" },
  { druh: "gsc", label: "Google Search Console", path: "Search Console → Výsledky vyhľadávania › Exportovať › CSV. Stiahne sa ZIP — rozbaľ ho a nahraj tri súbory: Graf.csv (kliky po dňoch), Dopyty.csv (na čo ťa ľudia našli), Strany.csv (ktorý článok ťahá). Krajiny, Zariadenia a Filtre appka zatiaľ nepoužíva." },
];

export function Udaje({ data, actions }: { data: PSBData; actions: Actions }) {
  const missing = REPORTS.filter((r) => (data[r.key] as unknown[]).length === 0);
  return (
    <>
      <UploadCard data={data} missing={missing} actions={actions} />

      <Uzavierky />

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

function UploadCard({ data, missing, actions }: { data: PSBData; missing: typeof REPORTS; actions: Actions }) {
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
  useEffect(() => {
    void fetch("/api/fio", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        const p = (j.pohyby || []) as { datum: string }[];
        setBankaStav({ pocet: p.length, posledny: p.reduce((m, x) => (x.datum > m ? x.datum : m), "") });
      })
      .catch(() => setBankaStav({ pocet: 0, posledny: "" }));
  }, [bankovyText]);
  const bankaNahrata = (bankaStav?.pocet || 0) > 0;
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

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    const files: { filename: string; text: string }[] = [];
    const bankove: string[] = [];
    const neCsv: { meno: string; pripona: string }[] = [];
    const pdfka: File[] = [];
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
      if (["xlsx", "xls", "zip", "pptx", "docx"].includes(pripona)) {
        neCsv.push({ meno: f.name, pripona });
        continue;
      }
      const text = await f.text();
      if (jeBankovyVypis(text)) bankove.push(text);
      else files.push({ filename: f.name, text });
    }
    setNeCsv(neCsv);
    for (const f of pdfka) await citajPdf(f);
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
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <div style={{ ...S.h3, marginBottom: 0 }}>Upload CSV</div>
        {missing.length > 0 && <span style={{ ...badge("orange"), fontSize: 10 }}>{missing.length} chýba</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.textDim }}>{open ? "▲" : "▼ rozbaliť"}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 4 }}>Nahrať sa dá aj pretiahnutím do Jarvisa (📎 vpravo dole).</div>
      {open && (
      <div style={{ marginTop: 12 }}>
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
        <div style={{ color: C.text }}>{busy ? "Spracúvam…" : "Pretiahni CSV súbory sem alebo klikni"}</div>
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
          {neCsv.some((x) => x.pripona === "pdf" || x.pripona === "pptx") && (
            <> V Metricoole je PDF ponúknuté ako prvé, ale potrebné je <b>Analytics → Export → CSV</b>, zvlášť pre posty, reels a stories.</>
          )}
          {neCsv.some((x) => x.pripona === "zip") && (
            <> Search Console sťahuje ZIP — rozbaľ ho a nahraj súbory zvnútra (Graf, Dopyty, Stránky).</>
          )}
          <button onClick={() => setNeCsv([])} style={{ marginLeft: 8, background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>rozumiem</button>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".csv,.txt,.pdf" multiple style={{ display: "none" }} onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />
      {bankovyText && (
        <div style={{ marginTop: 12 }}>
          <BankovyImport vstup={bankovyText} onHotovo={() => { setBankovyText(""); void actions.refresh(); }} />
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
      <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
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
          jednorazovom prepise. <strong style={{ color: C.text }}>V novembri Metricoolu prepadnú staršie príspevky</strong> —
          čo sa nestiahne dovtedy, už nebude odkiaľ vziať.
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
          Packages report dáva PTminder v štyroch pohľadoch (šablóny balíčkov, šablóny členstiev, balíčky klientov,
          členstvá klientov) — nahraj všetky, každý nesie niečo iné a ten posledný má aj platnosť členstva.
          Rovnaký súbor nič nezduplikuje.
        </div>
      </div>
      </div>
      )}
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
