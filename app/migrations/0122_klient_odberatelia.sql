-- ĎALŠIE FIRMY NA FAKTÚRU PRI KLIENTOVI (Jerry, 20. 10. 2026: „vymazávať si
-- to nemusel, možno niekedy v budúcnosti sa to zmení — ulož obidva, daj mi
-- možnosť to zmeniť a predvolene nechaj 19806710").
-- Predvolený odberateľ ostáva v `klient_fakturacia`; tu sú ostatné. Keď sa
-- predvolená firma zmení, stará sa sem odloží sama — nič sa nemaže.
CREATE TABLE IF NOT EXISTS klient_odberatelia (
  id TEXT PRIMARY KEY,
  klient TEXT NOT NULL,
  firma TEXT NOT NULL DEFAULT '',
  ico TEXT NOT NULL DEFAULT '',
  dic TEXT NOT NULL DEFAULT '',
  ulica TEXT NOT NULL DEFAULT '',
  psc TEXT NOT NULL DEFAULT '',
  mesto TEXT NOT NULL DEFAULT '',
  stat TEXT NOT NULL DEFAULT 'Česká republika',
  created_at TEXT NOT NULL,
  autor TEXT
);
CREATE INDEX IF NOT EXISTS klient_odberatelia_klient ON klient_odberatelia (klient);
