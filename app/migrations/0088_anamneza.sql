-- ANAMNÉZA V KOKPITE (Jerry, 30. 9. 2026)
--
-- Doteraz žila v Google Forms. Analýza 56 odpovedí ukázala, že to nikdy
-- nebol klientsky dotazník: 48 z 56 odpovedí obsahuje slovenčinu a 33 je
-- v tretej osobe — vypĺňal ho Jerry počas úvodného tréningu.
--
-- Preto sú tu dve polia s odpoveďami, nie jedno:
--   klient_json — čo odklikol klient pred úvodným (bolesť alebo cieľ),
--   zapis_json  — čo zapísal tréner pri tréningu.
--
-- OBE SÚ ŠIFROVANÉ. Bolesti, operácie a lieky sú podľa GDPR osobitná
-- kategória; kľúč je Worker secret (ANAMNEZA_KLUC), takže obsah neuvidí
-- Jarvis, kontrolné skripty ani nikto s prístupom k databáze — len
-- prihlásený tréner na karte klienta.
--
-- `suhlasy_json` šifrovaný NIE JE a je to zámer: doklad o súhlase musí byť
-- čitateľný aj vtedy, keď sa kľúč stratí — inak by sme nevedeli dokázať,
-- že sme ho mali.
CREATE TABLE IF NOT EXISTS anamnezy (
  id TEXT PRIMARY KEY,
  klient TEXT NOT NULL UNIQUE,
  -- Token verejnej stránky /a/<token>. Náhodný, na klienta jeden;
  -- zmazaním riadku odkaz zhasne.
  token TEXT NOT NULL UNIQUE,
  -- ceka | klient_vyplnil | hotova
  stav TEXT NOT NULL DEFAULT 'ceka',
  verzia INTEGER NOT NULL DEFAULT 1,
  klient_json TEXT,
  zapis_json TEXT,
  suhlasy_json TEXT,
  klient_vyplnil_at TEXT,
  zapis_at TEXT,
  vytvorene_at TEXT NOT NULL,
  autor TEXT
);

CREATE INDEX IF NOT EXISTS anamnezy_stav ON anamnezy (stav);

-- Formulár ako DÁTA, nie ako kód — Jerry si ho má vedieť upraviť sám
-- (sekcie, otázky, možnosti, poradie). V tabuľke je len to, čo prepísal;
-- kým je prázdna, platí predvolená definícia z `anamnezaFormular.ts`.
--
-- Verzia sa nikdy neprepisuje, pridáva sa nová. Staré odpovede sa tým
-- pádom nerozsypú: každá anamnéza si pamätá, podľa ktorej verzie vznikla.
CREATE TABLE IF NOT EXISTS anamneza_formular (
  verzia INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  vytvorene TEXT NOT NULL,
  autor TEXT
);
