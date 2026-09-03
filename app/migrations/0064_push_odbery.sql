-- Odbery web push notifikácií.
--
-- Jeden riadok = jedno zariadenie. Ten istý človek má bežne dva (telefón,
-- notebook), preto kľúčom NIE JE meno, ale `endpoint` — adresa, ktorú
-- pridelil push server prehliadača a ktorá je pre zariadenie jedinečná.
--
-- `p256dh` a `auth` sú kľúče, ktorými sa obsah notifikácie šifruje. Bez nich
-- sa poslať nedá nič: push servery Apple ani Google obsah nevidia a ani nesmú.
CREATE TABLE IF NOT EXISTS push_odbery (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  kto         TEXT NOT NULL DEFAULT '',
  zariadenie  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  -- Posledné úspešné doručenie a posledná chyba. Bez nich sa mŕtvy odber
  -- (odinštalovaná appka) nedá odlíšiť od funkčného, ktorému len nič neprišlo.
  posledne_ok TEXT,
  chyba       TEXT
);
CREATE INDEX IF NOT EXISTS ix_push_kto ON push_odbery (kto);
