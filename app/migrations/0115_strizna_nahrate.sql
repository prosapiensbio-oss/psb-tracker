-- Videá nahraté z mobilu pre Strižňu (12. 10. 2026).
--
-- Jerry natáča na iPhone a strihá v Strižni na Macu. Video ide z telefónu
-- cez Kokpit (Marketing → Nahrať do Strižne) do R2 pod prefix
-- `strizna/nahrate/<id>/<meno>` v buckete kokpit-fotky — fotky klientov majú
-- vlastné kľúče a s týmto sa nemiešajú. Strižňa si zoznam a súbor stiahne
-- tokenom (x-strizna-token) a nahlási „stiahnuté“; vtedy sa objekt z R2
-- zmaže a riadok tu ostáva ako história.
--
-- stav: nahrava (multipart beží alebo zostal nedokončený) | nahrate (čaká
-- na Strižňu) | stiahnute (Strižňa ho má, R2 je prázdne).
-- upload_id je id R2 multipart uploadu — bez neho sa časti nedajú doplniť
-- ani zrušiť. Nedokončený upload R2 sám zahodí po 7 dňoch.
CREATE TABLE IF NOT EXISTS strizna_nahrate (
  id              TEXT PRIMARY KEY,
  nazov           TEXT NOT NULL,
  velkost         INTEGER NOT NULL,
  typ             TEXT NOT NULL,
  kluc            TEXT NOT NULL,
  upload_id       TEXT,
  stav            TEXT NOT NULL DEFAULT 'nahrava',
  kto             TEXT NOT NULL DEFAULT '',
  zacate_kedy     TEXT NOT NULL,
  nahrate_kedy    TEXT,
  stiahnute_kedy  TEXT
);
CREATE INDEX IF NOT EXISTS strizna_nahrate_stav ON strizna_nahrate(stav, nahrate_kedy);
