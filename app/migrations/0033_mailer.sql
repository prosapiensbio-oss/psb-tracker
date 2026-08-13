-- MailerLite — odberatelia a kampane.
--
-- PREČO TO SEM PATRÍ
--
-- Formulár na /dychani zbiera MAILY, nie dopyty. Onboarding hlási, že má
-- vysoké zobrazenia a nula odoslaní — a to sa nedá overiť inde než tu:
-- keď funguje, pribúdajú odberatelia. Kokpit doteraz o tomto kanáli nevedel
-- nič, hoci je to najlacnejšie publikum, aké PSB má (4,60 Kč za kontakt).
--
-- PREČO SA UKLADÁ AJ E-MAIL
--
-- Aby sa dalo povedať, koľko z odberateľov sa stalo klientom. To je celý zmysel
-- Kokpitu — mať oba konce reťazca. Bez e-mailu je odberateľ číslo, nie človek,
-- a číslo sa s klientom spárovať nedá.
CREATE TABLE IF NOT EXISTS mail_odberatelia (
  id         TEXT PRIMARY KEY,      -- id z MailerLite
  email      TEXT NOT NULL DEFAULT '',
  meno       TEXT NOT NULL DEFAULT '',
  -- Deň prihlásenia. Toto je ten najdôležitejší stĺpec: rad prihlásení
  -- po dňoch je jediná odpoveď na otázku, či formulár funguje.
  prihlaseny TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',   -- active | unsubscribed | bounced…
  skupiny    TEXT NOT NULL DEFAULT '',   -- mená skupín oddelené „ · "
  updated_at TEXT NOT NULL
);

-- Kampane aj s tým, ako dopadli. `otvorenia` a `prekliky` sú UNIKÁTNE počty —
-- celkové by pri jednom človeku, čo si mail otvoril päťkrát, tvrdili, že
-- záujem je päťnásobný.
CREATE TABLE IF NOT EXISTS mail_kampane (
  id         TEXT PRIMARY KEY,
  nazov      TEXT NOT NULL DEFAULT '',
  odoslane   TEXT NOT NULL DEFAULT '',   -- dátum odoslania
  prijemcov  INTEGER NOT NULL DEFAULT 0,
  otvorenia  INTEGER NOT NULL DEFAULT 0,
  prekliky   INTEGER NOT NULL DEFAULT 0,
  odhlasenia INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
