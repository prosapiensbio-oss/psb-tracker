-- ZMLUVY 6M V KOKPITE (Jerry, 10. 11. 2026)
--
-- Doteraz DocuSeal: Jerry podpíše, klient dostane mail, odklikne šesť pravidiel,
-- dá dátum a podpis. Teraz to isté v Kokpite, aby sa podpísaná zmluva sama
-- priradila k profilu a zhasla pripomienka „nemá podpísanú zmluvu".
--
-- Text zmluvy NIE JE v tabuľke — je v kóde (`zmluva6m.ts`) pod verziou, ktorá
-- sa nikdy neprepisuje (nová = nová verzia). Riadok drží verziu a odtlačok
-- (SHA-256) presného textu, ktorý klient videl, a pri pravidlách aj ich znenie.
--
-- Podpisy sú PNG ako data URL (~10–60 kB), D1 strop 1 MB na hodnotu stačí.
-- IP a prehliadač sú dôkaz podpisu, nie údaj na zobrazovanie.
CREATE TABLE IF NOT EXISTS zmluvy (
  id TEXT PRIMARY KEY,
  klient TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  -- caka | podpisana | zrusena
  stav TEXT NOT NULL DEFAULT 'caka',
  -- kokpit = podpísaná na /z/ | docuseal = staršia, prevzatá ako PDF
  zdroj TEXT NOT NULL DEFAULT 'kokpit',
  verzia TEXT NOT NULL,
  poskytovatel_podpis TEXT NOT NULL DEFAULT '',
  poskytovatel_at TEXT NOT NULL,
  autor TEXT,
  klient_meno TEXT,
  klient_podpis TEXT,
  klient_suhlasy_json TEXT,
  klient_at TEXT,
  klient_ip TEXT,
  klient_ua TEXT,
  odtlacok TEXT,
  otvorene_at TEXT,
  zrusene_at TEXT,
  vytvorene_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS zmluvy_klient ON zmluvy (klient);
CREATE INDEX IF NOT EXISTS zmluvy_stav ON zmluvy (stav);

-- Zmluvy podpísané v DocuSeal pred Kokpitom (Jerry poslal 6 PDF 10. 11. 2026).
-- PDF má ~160 kB, base64 ~220 kB; D1 berie najviac 100 kB na jeden príkaz,
-- preto po kúskoch ako `jarvis_dokument_casti`.
CREATE TABLE IF NOT EXISTS zmluvy_pdf (
  zmluva_id TEXT NOT NULL,
  poradie INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (zmluva_id, poradie)
);
