-- MAILER V KOKPITE (Jerry, 4. 11. 2026: štyri kroky, vzhľad A, 1 mail mesačne,
-- odoslanie len po kliknutí, adresa news.prosapiens.cz, odpovede mimo dopytov).
--
-- Odberatelia ostávajú v `mail_odberatelia`: je to zároveň zoznam, komu sa
-- písať NESMIE. Dopĺňa sa doklad o súhlase. Stav 'caka_potvrdenie' = zaškrtol
-- políčko na webe a ešte neklikol v potvrdzovacom maili; taký sa nikam nepíše.
ALTER TABLE mail_odberatelia ADD COLUMN suhlas_at TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN suhlas_zdroj TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN suhlas_znenie TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN potvrdenie_token TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN potvrdene_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS mail_odberatelia_email ON mail_odberatelia (email);
CREATE INDEX IF NOT EXISTS mail_odberatelia_potvrdenie ON mail_odberatelia (potvrdenie_token);

-- Jeden mail od nápadu po výsledok. `preco` je povinná odpoveď na otázku, prečo
-- to ten človek chce dostať. `skuska_at` sa pri úprave textu maže: odoslať sa
-- dá len to znenie, ktoré Jerry videl vo svojej schránke.
CREATE TABLE IF NOT EXISTS mail_vydania (
  id           TEXT PRIMARY KEY,
  druh         TEXT NOT NULL DEFAULT 'bolest',
  tema         TEXT NOT NULL DEFAULT '',
  preco        TEXT NOT NULL DEFAULT '',
  predmet      TEXT NOT NULL DEFAULT '',
  nadpis       TEXT NOT NULL DEFAULT '',
  predhlavicka TEXT NOT NULL DEFAULT '',
  telo         TEXT NOT NULL DEFAULT '',
  skupiny      TEXT NOT NULL DEFAULT '[]',
  stav         TEXT NOT NULL DEFAULT 'rozpisane',  -- rozpisane | odosiela | odoslane
  vytvorene_at TEXT NOT NULL,
  upravene_at  TEXT NOT NULL,
  skuska_at    TEXT NOT NULL DEFAULT '',
  odoslane_at  TEXT NOT NULL DEFAULT '',
  autor        TEXT NOT NULL DEFAULT ''
);

-- Komu presne mail išiel. `token` je odkaz na odhlásenie: bez adresy v URL.
-- Skúšobné riadky (skuska = 1) sa nerátajú do brzdy, štatistiky ani odhlásení.
CREATE TABLE IF NOT EXISTS mail_prijemcovia (
  token        TEXT PRIMARY KEY,
  vydanie      TEXT NOT NULL,
  email        TEXT NOT NULL,
  meno         TEXT NOT NULL DEFAULT '',
  klient       TEXT,
  skupina      TEXT NOT NULL DEFAULT '',
  skuska       INTEGER NOT NULL DEFAULT 0,
  stav         TEXT NOT NULL DEFAULT 'caka',  -- caka | odoslany | zlyhal | vynechany
  resend_id    TEXT NOT NULL DEFAULT '',
  chyba        TEXT NOT NULL DEFAULT '',
  odoslane_at  TEXT NOT NULL DEFAULT '',
  dorucene_at  TEXT NOT NULL DEFAULT '',
  otvorene_at  TEXT NOT NULL DEFAULT '',
  kliknute_at  TEXT NOT NULL DEFAULT '',
  odrazene_at  TEXT NOT NULL DEFAULT '',
  staznost_at  TEXT NOT NULL DEFAULT '',
  odhlasene_at TEXT NOT NULL DEFAULT '',
  UNIQUE (vydanie, email, skuska)
);
CREATE INDEX IF NOT EXISTS mail_prijemcovia_resend ON mail_prijemcovia (resend_id);
CREATE INDEX IF NOT EXISTS mail_prijemcovia_email ON mail_prijemcovia (email);
CREATE INDEX IF NOT EXISTS mail_prijemcovia_stav ON mail_prijemcovia (stav);

-- Odpovede na hromadné maily. Zámerne NIE v `leads`: dopyt z nich vznikne len
-- tlačidlom. Text býva zdravotný, preto je šifrovaný rovnako ako anamnéza.
CREATE TABLE IF NOT EXISTS mail_odpovede (
  id          TEXT PRIMARY KEY,
  vydanie     TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  meno        TEXT NOT NULL DEFAULT '',
  predmet     TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL DEFAULT '',
  prijate_at  TEXT NOT NULL,
  vybavene_at TEXT NOT NULL DEFAULT '',
  lead_id     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS mail_odpovede_vydanie ON mail_odpovede (vydanie);
