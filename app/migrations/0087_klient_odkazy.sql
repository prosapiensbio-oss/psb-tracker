-- Verejný odkaz klienta: SMS nemá miesto na tabuľku, tak nesie token,
-- za ktorým stránka ukáže tréningy, platby a QR na platbu. Token je
-- náhodný (nedá sa uhádnuť ani odvodiť z mena) a na klienta je JEDEN —
-- zmazaním riadku sa dá odkaz kedykoľvek zneplatniť.
CREATE TABLE IF NOT EXISTS klient_odkazy (
  token TEXT PRIMARY KEY,
  klient TEXT NOT NULL UNIQUE,
  vytvorene TEXT NOT NULL,
  otvorene INTEGER NOT NULL DEFAULT 0,
  posledne_otvorene TEXT
);
