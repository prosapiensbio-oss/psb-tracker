-- Bankové pohyby z Fio.
--
-- Podľa pravidla, na ktorom sme sa dohodli: z banky sa sledujú hlavne VÝDAVKY.
-- Príchodzie platby sa ukladajú tiež, ale slúžia len na kontrolu proti
-- PTminderu — tržby sa z nich nikdy nepočítajú, lebo cez účet neprejde
-- bitcoin, hotovosť ani barter.
--
-- `dedup_key` drží import idempotentný: ten istý výpis sa dá nahrať dvakrát a
-- nič sa nezduplikuje. Kategória je prázdna, kým ju človek nepotvrdí.
CREATE TABLE IF NOT EXISTS fio_transactions (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  amount_czk REAL NOT NULL,
  counterparty TEXT,
  note       TEXT,
  typ        TEXT,
  category   TEXT NOT NULL DEFAULT '',
  dedup_key  TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fio_date ON fio_transactions (date);
