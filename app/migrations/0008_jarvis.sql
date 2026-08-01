-- Jarvisova pamäť.
--
-- Doteraz žili chaty výhradne v localStorage jedného prehliadača: na telefóne
-- boli prázdne a vymazaná cache ich zmazala. Horšie ale bolo, že Jarvis nemal
-- ako nadviazať na debatu spred mesiaca — každý rozhovor začínal od nuly, takže
-- nemohol vyhodnotiť, či to, čo poradil, vôbec zabralo.
--
-- Dve tabuľky, lebo sú to dve rôzne veci:
--   chats   = celé rozhovory (archív, prenositeľný medzi zariadeniami)
--   zavery  = to podstatné z rozhovoru, čo sa vracia do promptu
-- Prepis debaty je na vyhodnocovanie nepoužiteľný — dvadsať správ, z toho jedna
-- veta rozhodnutia. Do promptu ide len tá veta.

CREATE TABLE IF NOT EXISTS jarvis_chats (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  messages   TEXT NOT NULL,      -- JSON pole správ
  archived   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jarvis_chats_updated ON jarvis_chats (updated_at);

-- Záver = rozhodnutie z debaty. Kľúčové je pole `overit_do`: bez neho je to
-- poznámka, s ním je to sľub, ktorý sa raz sám ozve v "Na čo sa pozrieť".
CREATE TABLE IF NOT EXISTS jarvis_zavery (
  id         TEXT PRIMARY KEY,
  datum      TEXT NOT NULL,      -- kedy sme sa dohodli
  tema       TEXT NOT NULL,      -- marketing | ceny | klienti | prevadzka | ine
  zaver      TEXT NOT NULL,      -- čo sme rozhodli, jedna veta
  preco      TEXT,               -- na základe čoho
  overit     TEXT,               -- čo sa má stať, aby sme vedeli, že to zabralo
  overit_do  TEXT,               -- dátum, kedy sa na to spýtať
  vysledok   TEXT,               -- doplní sa pri vyhodnotení
  stav       TEXT NOT NULL DEFAULT 'otvoreny',  -- otvoreny | zabralo | nezabralo | zrusene
  chat_id    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jarvis_zavery_overit ON jarvis_zavery (overit_do);
