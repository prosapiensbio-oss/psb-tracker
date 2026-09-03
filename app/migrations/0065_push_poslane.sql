-- Čo už na telefón odišlo.
--
-- Bez tejto tabuľky by plánovač poslal tú istú vetu každé tri hodiny, kým by
-- ju Jerry neodklepol — teda osemkrát denne to isté. Presne tým zomrel pôvodný
-- register: keď svieti všetko, nesvieti nič.
CREATE TABLE IF NOT EXISTS push_poslane (
  kluc  TEXT PRIMARY KEY,
  kedy  TEXT NOT NULL
);
