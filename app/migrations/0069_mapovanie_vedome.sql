-- Vedomé rozhodnutie o nejednoznačnom mene.
--
-- „Marketa = Lozias" v mapovaní bolo — a bolo zlé. Staré mapovania vznikli
-- vtedy, keď appka o dvojici klientok s rovnakým krstným menom nič nehovorila,
-- takže nie sú dôkazom, že sa niekto rozhodol; sú dôkazom, že sa niekto nemal
-- ako rozhodnúť. Preto rozlišujeme: 1 = človek to potvrdil s vedomím, že to
-- meno sedí na viacerých ľudí.
ALTER TABLE kal_mapovanie ADD COLUMN vedome INTEGER NOT NULL DEFAULT 0;
