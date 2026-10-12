-- ODKAZ S FOTKAMI PRE KLIENTA `/f/<token>` (Jerry, 12. 10. 2026).
--
-- 1) Porovnanie z editora sa ukladá v dvoch podobách: s čiarami/kresbou
--    (kluc) a čisté (kluc_ciste) — klient si ich na stránke prepína.
ALTER TABLE klient_fotky ADD COLUMN kluc_ciste TEXT;

-- 2) Jeden poslaný odkaz = jeden riadok. Fotky sa NEKOPÍRUJÚ — odkaz drží
--    len ich id (a voliteľné čísla „pred → po"); zmazaná fotka zo stránky
--    zmizne. Správa a body „čo ďalej" sú ZAŠIFROVANÉ (ako poznámky k foteniu).
CREATE TABLE IF NOT EXISTS fotky_odkazy (
  token TEXT PRIMARY KEY,
  klient TEXT NOT NULL,
  -- [{ "id": "f…", "cisla": [{ "nazov": "pánev", "pred": "14°", "po": "6°" }] }] v poradí kariet
  fotky_json TEXT NOT NULL,
  sprava TEXT,
  dalej TEXT,
  kto TEXT,
  -- tréner klienta v čase poslania — jemu ide notifikácia o odpovedi
  trener TEXT,
  vytvorene_at TEXT NOT NULL,
  plati_do TEXT NOT NULL,
  zrusene_at TEXT,
  -- prvé otvorenie klientom (len čas, nič o zariadení)
  otvorene_at TEXT,
  -- súhlas so zverejnením porovnania bez tváre: 'ano' | 'ne' | NULL = neodpovedal (= nie)
  suhlas TEXT,
  suhlas_at TEXT
);
CREATE INDEX IF NOT EXISTS fotky_odkazy_klient ON fotky_odkazy (klient, vytvorene_at);

-- 3) Odpoveď klienta zo stránky („Chceš se na něco zeptat?"). ZAŠIFROVANÁ.
--    Notifikácia trénerovi z nej vzniká v registri; vybavenie je ack ako inde.
CREATE TABLE IF NOT EXISTS fotky_odpovede (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  klient TEXT NOT NULL,
  text TEXT NOT NULL,
  vytvorene_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fotky_odpovede_klient ON fotky_odpovede (klient, vytvorene_at);
