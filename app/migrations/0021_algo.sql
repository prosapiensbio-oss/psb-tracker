-- Sledovanie zmien v algoritmoch.
--
-- Platformy menia váhy signálov priebežne a doteraz sa to k PSB dostávalo len
-- náhodou — cez niečí príspevok alebo článok. Appka teraz číta oficiálne
-- zdroje (Google Search Central, Meta Newsroom, TikTok, YouTube) a odkladá si,
-- čo vyšlo.
--
-- Neukladá sa celý článok, len titulok a odkaz. Rozhodnúť, či sa to PSB týka,
-- je práca pre Jarvisa alebo pre človeka; databáza má byť zoznam toho, čo sa
-- stalo, nie archív internetu.
CREATE TABLE IF NOT EXISTS algo_novinky (
  id         TEXT PRIMARY KEY,      -- hash odkazu, aby sa tá istá správa nepridala dvakrát
  zdroj      TEXT NOT NULL,
  titulok    TEXT NOT NULL,
  url        TEXT NOT NULL,
  datum      TEXT NOT NULL,         -- ISO deň publikovania
  relevantne INTEGER NOT NULL DEFAULT 0,  -- 1 = titulok obsahuje slovo o hodnotení/dosahu
  precitane  INTEGER NOT NULL DEFAULT 0,
  ulozene_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_algo_datum ON algo_novinky (datum DESC);
