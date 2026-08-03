-- Web: GA4 a Search Console.
--
-- Rovnaký dôvod ako pri Metricoole — obrazovka Marketing bežala na číslach raz
-- prepísaných do kódu. Rozdiel je, že tieto dva exporty nemajú tvar tabuľky:
-- GA4 posiela jeden súbor rozdelený na pätnásť blokov oddelených prázdnym
-- riadkom, Search Console posiela priečinok so štyrmi súbormi. Preto sa
-- neukladá „súbor", ale to, čo z neho vieme prečítať.
--
-- Mesiac je kľúč: obidva exporty sa sťahujú za mesiac a nový sťah toho istého
-- mesiaca má prepísať starý, nie sa k nemu pripočítať.
CREATE TABLE IF NOT EXISTS ga4_mesiace (
  mesiac         TEXT PRIMARY KEY,   -- "YYYY-MM"
  novi           INTEGER NOT NULL DEFAULT 0,
  organic_search INTEGER NOT NULL DEFAULT 0,
  paid_social    INTEGER NOT NULL DEFAULT 0,
  organic_social INTEGER NOT NULL DEFAULT 0,
  direct         INTEGER NOT NULL DEFAULT 0,
  referral       INTEGER NOT NULL DEFAULT 0,
  udalosti       INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gsc_mesiace (
  mesiac     TEXT PRIMARY KEY,
  kliky      INTEGER NOT NULL DEFAULT 0,
  zobrazenia INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Dopyty a stránky sú rebríček za obdobie, nie časový rad. Ukladá sa posledný
-- sťah — dva rebríčky za rôzne obdobia sa nedajú zlúčiť tak, aby to niečo
-- znamenalo (pozícia je priemer, nie súčet).
CREATE TABLE IF NOT EXISTS gsc_dopyty (
  dopyt      TEXT PRIMARY KEY,
  kliky      INTEGER NOT NULL DEFAULT 0,
  zobrazenia INTEGER NOT NULL DEFAULT 0,
  ctr        REAL    NOT NULL DEFAULT 0,
  pozicia    REAL    NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gsc_strany (
  url        TEXT PRIMARY KEY,
  kliky      INTEGER NOT NULL DEFAULT 0,
  zobrazenia INTEGER NOT NULL DEFAULT 0,
  ctr        REAL    NOT NULL DEFAULT 0,
  pozicia    REAL    NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
