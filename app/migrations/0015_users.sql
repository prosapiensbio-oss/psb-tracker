-- Vlastné prihlásenie pre každého.
--
-- Doteraz bolo jedno spoločné heslo a audit písal k zmene „app". Odpovedalo to
-- na „čo sa zmenilo", nikdy na „kto". Pred importom z banky je to posledná
-- chvíľa, kedy sa to dá zaviesť lacno — spätne sa mená k starým zápisom
-- doplniť nedajú.
--
-- Obaja majú PLNÝ prístup (Jerryho rozhodnutie), takže tu nejde o oprávnenia,
-- ale o identitu. Roly zavedieme, až keď príde tretí tréner.
--
-- Heslo sa neukladá — ukladá sa PBKDF2 hash so soľou. Zdieľané heslo
-- (PSB_PASSWORD) zostáva funkčné ako záchranná brzda, aby zlá migrácia nikoho
-- nevyzamkla z vlastnej appky.
CREATE TABLE IF NOT EXISTS users (
  login      TEXT PRIMARY KEY,      -- malými písmenami, napr. "jerry"
  name       TEXT NOT NULL,         -- zobrazované meno, napr. "Jerry"
  pass_hash  TEXT NOT NULL,
  pass_salt  TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login TEXT
);
