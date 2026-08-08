-- Google Calendar — priebežný obraz týždňa medzi dvoma exportmi z PTmindera.
--
-- PTminder zostáva zdrojom pravdy. Kalendár je predbežná vrstva: hovorí, čo sa
-- CHYSTÁ a čo sa PRÁVE ZMENILO, a v nedeľu ho export prepíše skutočnosťou.
-- Preto sú tieto tabuľky zámerne oddelené od sessions/payments — nič odtiaľto
-- nesmie tiecť do P&L.

-- Odkiaľ sa číta. Tajná iCal adresa je heslo v podobe odkazu, takže sem ju
-- vkladá Jerry priamo v appke — nikdy nemá prejsť cez chat ani cez kód.
CREATE TABLE IF NOT EXISTS kal_zdroje (
  id          TEXT PRIMARY KEY,
  trener      TEXT NOT NULL,           -- "Jerry" | "Terezka"
  url         TEXT NOT NULL,
  aktivny     INTEGER NOT NULL DEFAULT 1,
  posledne_ok TEXT,                    -- kedy sa naposledy podarilo stiahnuť
  posledna_chyba TEXT,
  created_at  TEXT NOT NULL
);

-- Posledný známy stav udalosti. Jeden riadok na udalosť, prepisuje sa —
-- história zmien žije v kal_zmeny, nie tu.
CREATE TABLE IF NOT EXISTS kal_udalosti (
  uid         TEXT NOT NULL,           -- iCal UID, stabilné naprieč posunmi
  trener      TEXT NOT NULL,
  zaciatok    TEXT NOT NULL,           -- ISO
  koniec      TEXT NOT NULL,
  nazov       TEXT NOT NULL,
  klient      TEXT,                    -- doplní mapovanie; NULL = ešte nevieme
  typ         TEXT,                    -- trening | uvodny | guillermo | sukromne | netrening
  prvy_raz    TEXT NOT NULL,           -- kedy sme ju prvýkrát videli
  naposledy   TEXT NOT NULL,           -- kedy naposledy potvrdená v snímke
  zmizla_at   TEXT,                    -- vyplnené, keď prestala existovať
  PRIMARY KEY (uid, trener)
);
CREATE INDEX IF NOT EXISTS kal_udalosti_zaciatok ON kal_udalosti(zaciatok);

-- Snímka = jedno stiahnutie kalendára. Slúži na to, aby sa dalo povedať
-- „medzi ránom a večerom zmizla hodina", a aby bolo vidieť výpadky sťahovania.
CREATE TABLE IF NOT EXISTS kal_snimky (
  id          TEXT PRIMARY KEY,
  kedy        TEXT NOT NULL,
  trener      TEXT NOT NULL,
  udalosti    INTEGER NOT NULL,
  zmien       INTEGER NOT NULL DEFAULT 0,
  ok          INTEGER NOT NULL DEFAULT 1,
  chyba       TEXT
);

-- Čo sa medzi dvoma snímkami stalo. Toto je materiál na otázky typu
-- „zmizla ti hodina spred dvoch dní — prečo?"
CREATE TABLE IF NOT EXISTS kal_zmeny (
  id          TEXT PRIMARY KEY,
  kedy        TEXT NOT NULL,           -- kedy sme zmenu zbadali
  trener      TEXT NOT NULL,
  uid         TEXT NOT NULL,
  druh        TEXT NOT NULL,           -- pridane | zrusene | posunute | premenovane
  nazov       TEXT,
  klient      TEXT,
  pred        TEXT,                    -- pôvodný čas (posun/zrušenie)
  po          TEXT,                    -- nový čas (posun/pridanie)
  vysvetlene  INTEGER NOT NULL DEFAULT 0,
  poznamka    TEXT,
  odpovedane_at TEXT
);
CREATE INDEX IF NOT EXISTS kal_zmeny_otvorene ON kal_zmeny(vysvetlene, kedy);

-- Naučené mapovanie názvu udalosti na klienta. Kľúč je (názov, tréner) —
-- v Jerryho kalendári „Natalia" a v Terezkinom „Natalia" môžu byť dvaja rôzni
-- ľudia a jedno spoločné pravidlo by ich ticho zlialo do jedného.
CREATE TABLE IF NOT EXISTS kal_mapovanie (
  nazov       TEXT NOT NULL,           -- presne tak, ako stojí v kalendári
  trener      TEXT NOT NULL,
  klient      TEXT,                    -- meno v Trackeri; NULL pri netréningoch
  typ         TEXT NOT NULL,           -- trening | uvodny | guillermo | sukromne | netrening
  potvrdene_at TEXT NOT NULL,
  PRIMARY KEY (nazov, trener)
);

-- Predplatené hodiny u Guillerma. Tréningy, ktoré Jerry a Terezka DOSTÁVAJÚ —
-- nie sú to klientske hodiny ani súkromie, ale vzdelávanie, ktoré sa platí
-- dopredu (v BTC ako „FP spain"). Kalendár ich čerpá, platby ich dopĺňajú.
CREATE TABLE IF NOT EXISTS guillermo_hodiny (
  id          TEXT PRIMARY KEY,
  datum       TEXT NOT NULL,
  druh        TEXT NOT NULL,           -- nakup | cerpanie
  hodiny      REAL NOT NULL,
  ucastnik    TEXT,                    -- Jerry | Terezka | obaja
  suma_czk    REAL,                    -- len pri nákupe
  zdroj       TEXT,                    -- kalendar | rucne | btc
  poznamka    TEXT,
  created_at  TEXT NOT NULL
);
