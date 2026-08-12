-- Kampane a ich výsledky z Meta Marketing API.
--
-- Ads Manager vie povedať cenu za preklik a za odoslaný formulár. NIKDY nepovie
-- cenu za klienta, ktorý zostal pol roka — nevie, kto sa ním stal. Kokpit má
-- oba konce, takže tu sa tie dve polovice stretnú: výdavok z Mety a klient
-- z PTmindera.
--
-- Ukladá sa po mesiacoch, nie po dňoch: rozpočet sa rozhoduje mesačne
-- a denné čísla by boli šum, v ktorom sa nedá nič prečítať.
CREATE TABLE IF NOT EXISTS mkt_kampane (
  id          TEXT NOT NULL,          -- id kampane z Mety
  mesiac      TEXT NOT NULL,          -- YYYY-MM
  nazov       TEXT NOT NULL DEFAULT '',
  stav        TEXT NOT NULL DEFAULT '',
  spend       REAL NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  -- Konverzie tak, ako ich počíta Meta. Kokpitové číslo býva nižšie a je to
  -- v poriadku: Meta si pripíše aj toho, kto by prišiel aj bez reklamy.
  vysledky    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (id, mesiac)
);

-- Instagramové príspevky z Graph API. Merajú sa mierne inak než v Metricoole
-- (iné okno, iné zaokrúhlenie) — preto zvlášť, nie do mkt_prispevky: keby sa
-- to miešalo, nedalo by sa povedať, ktorý zdroj ktoré číslo dal.
CREATE TABLE IF NOT EXISTS ig_prispevky (
  id         TEXT PRIMARY KEY,
  datum      TEXT NOT NULL,
  mesiac     TEXT NOT NULL,
  typ        TEXT NOT NULL DEFAULT '',
  permalink  TEXT NOT NULL DEFAULT '',
  hook       TEXT NOT NULL DEFAULT '',
  dosah      INTEGER NOT NULL DEFAULT 0,
  ulozenia   INTEGER NOT NULL DEFAULT 0,
  zdielania  INTEGER NOT NULL DEFAULT 0,
  komentare  INTEGER NOT NULL DEFAULT 0,
  lajky      INTEGER NOT NULL DEFAULT 0,
  videnia    INTEGER NOT NULL DEFAULT 0,
  watch_time INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
