-- Lightningové faktúry z odkazu klienta (/v/). Kokpit si pamätá, komu ju ukázal
-- a na koľko korún znela, a plánovač sa Blinku pýta, či je zaplatená. Tu je jediné
-- miesto, kde ostáva dohodnutá suma: kniha pozná len satoshi a kurz.
CREATE TABLE IF NOT EXISTS ln_faktury (
  id            TEXT PRIMARY KEY,   -- posledný kus overovacej adresy (hash platby)
  klient        TEXT NOT NULL,      -- komu sa stránka ukázala, teda kto platí
  rozpis_json   TEXT NOT NULL,      -- [{ klient, czk }] aj pri platbe za viacerých
  czk           INTEGER NOT NULL,
  sats          INTEGER NOT NULL,
  overit        TEXT NOT NULL,
  vytvorena     TEXT NOT NULL,
  zaplatena_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ln_faktury_cakaju ON ln_faktury (zaplatena_at, vytvorena);
