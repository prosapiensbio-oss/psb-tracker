-- PONUKA TERMÍNOV (7. 10. 2026)
--
-- Jerry: „objaví sa klient, ktorý chce termín, ponúknem mu dva a nemôže ani
-- jeden… v Kokpite by som si vyťukal všetky termíny, ktoré ponúkam, poslal
-- by som mu odkaz SMS, klikol by na ten, ktorý chce, a mne by sa objavila
-- udalosť v kalendári."
--
-- Jedna ponuka = jeden odkaz /t/<token> pre jedného človeka (klient alebo
-- nový z dopytu). Platí do konca týždňa posledného ponúknutého termínu,
-- alebo kým si nevyberie. Vybraný termín zmizne aj z ostatných ponúk
-- toho istého trénera (počíta sa pri zobrazení, nie zápisom).

CREATE TABLE IF NOT EXISTS ponuky_terminov (
  token TEXT PRIMARY KEY,
  -- komu: meno klienta, alebo meno nového človeka z dopytu
  klient TEXT NOT NULL,
  telefon TEXT,
  -- trening | uvodny — nový človek z dopytu dostane úvodný tréning
  typ TEXT NOT NULL DEFAULT 'trening',
  -- deň (RRRR-MM-DD, pražský), do ktorého vrátane ponuka platí
  plati_do TEXT NOT NULL,
  -- vybraný termín (id z ponuky_terminov_casy) a kedy
  vybrany_id TEXT,
  vybrane_at TEXT,
  -- uid udalosti v kal_udalosti, ktorú výber založil
  udalost_uid TEXT,
  zrusene_at TEXT,
  kto TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ponuky_terminov_casy (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  -- Jerry | Terezka — z čieho kalendára je termín
  trener TEXT NOT NULL,
  -- pražský čas bez pásma, ako kal_udalosti.zaciatok ('RRRR-MM-DDTHH:MM')
  zaciatok TEXT NOT NULL,
  koniec TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ponuky_terminov_casy_token ON ponuky_terminov_casy (token);
CREATE INDEX IF NOT EXISTS ponuky_terminov_casy_zaciatok ON ponuky_terminov_casy (trener, zaciatok);
