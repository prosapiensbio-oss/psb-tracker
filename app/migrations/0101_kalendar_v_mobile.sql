-- KALENDÁR V MOBILE (7. 10. 2026)
--
-- Jerry: termíny klienta v kalendári jeho telefónu (A1 + B1). Klient NEODOBERÁ
-- kalendár trénera — Kokpit mu vyrobí vlastný (`/k/<token>/kalendar.ics`)
-- len z udalostí s jeho menom. Jeden platný odkaz na klienta; nový odkaz
-- starý zneplatní (zrusene_at).
--
-- posledne_stiahnutie / pocet / platforma zapisuje sťahovanie kalendára —
-- telefón si ho obnovuje sám, a tak Kokpit vie, kto ho naozaj odoberá.
CREATE TABLE IF NOT EXISTS klient_kalendar (
  token TEXT PRIMARY KEY,
  klient TEXT NOT NULL,
  created_at TEXT NOT NULL,
  kto TEXT,
  posledne_stiahnutie TEXT,
  pocet INTEGER NOT NULL DEFAULT 0,
  platforma TEXT,
  zrusene_at TEXT
);
CREATE INDEX IF NOT EXISTS klient_kalendar_klient ON klient_kalendar (klient);
