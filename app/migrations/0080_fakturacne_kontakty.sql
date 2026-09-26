-- Fakturačné kontakty z iDokladu — medzikrok k spárovaniu s klientmi.
--
-- Jerry, 26. 9. 2026: platba z firmy patrí KLIENTOVI, ktorý si dal faktúru
-- vystaviť na svoju firmu — „k menu sa priraďuje IČO, a nie názov". Aby to
-- appka vedela, musí poznať dvojicu človek ↔ firma. Tú vie povedať len Jerry.
--
-- Preto medzikrok: zoznam kontaktov z iDokladu sa naleje sem a v Prechode sa
-- páruje na klientov. Po spárovaní sa údaje zapíšu do `klient_fakturacia`,
-- odkiaľ ich berie faktúra aj párovanie bankových platieb.
--
-- Prečo vlastná tabuľka a nie rovno `klient_fakturacia`: kontakt bez klienta
-- tam nemá čo robiť — jej kľúčom je meno klienta. A nespárovaný kontakt musí
-- byť vidieť, inak by sa stratil.
CREATE TABLE IF NOT EXISTS fakturacne_kontakty (
  id         TEXT PRIMARY KEY,
  firma      TEXT NOT NULL DEFAULT '',
  ico        TEXT NOT NULL DEFAULT '',
  dic        TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  telefon    TEXT NOT NULL DEFAULT '',
  os_meno    TEXT NOT NULL DEFAULT '',
  os_priezvisko TEXT NOT NULL DEFAULT '',
  -- Komu patrí. Prázdne = ešte nespárované, to je zmysel tejto tabuľky.
  klient     TEXT NOT NULL DEFAULT '',
  -- Kontakt, ktorý ku klientovi nepatrí (dodávateľ, jednorazový odberateľ).
  -- Nemaže sa: inak by sa pri ďalšom importe vrátil a pýtal sa znova.
  odlozene_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fakturacne_kontakty_firma ON fakturacne_kontakty (firma, ico);
