-- TRÉNING ZDARMA — hodina, ktorá sa z členstva neodpočíta.
--
-- Jerry, 27. 9. 2026: „niekedy sa stáva, že chceme dať tréning ZDARMA, ako to
-- budeme evidovať? V PTminderi dávame recoil tréningov, tu ale nič také nie je
-- — čo keď nechcem, aby sa klientovi odpočítal tréning od členstva?"
--
-- V exporte sa to poznať NEDÁ: `price_czk = 0` má 690 sedení a znamená
-- „zaplatené balíčkom", nie „zadarmo". Je to teda rozhodnutie trénera a musí
-- mať vlastný záznam.
--
-- Kľúč je klient + DEŇ, nie id sedenia: ten istý tréning príde raz z kalendára
-- a raz z exportu (os času ich už dnes páruje po dňoch) a značka musí prežiť
-- oba zdroje aj opakovaný import.
CREATE TABLE IF NOT EXISTS treningy_zdarma (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  den TEXT NOT NULL,
  dovod TEXT NOT NULL DEFAULT '',
  kto TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_treningy_zdarma_klient_den ON treningy_zdarma (client_name, den);
