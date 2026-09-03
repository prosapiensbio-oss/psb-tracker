-- Zoradenie dopytov podľa zobrazení bez prehľadania celej tabuľky.
--
-- Ranná dávka si berie 150 najčastejších viet, ktoré ľudia napísali do
-- Googlu, ako zdroj témy na hovorené video. Bez indexu musí SQLite kvôli
-- ORDER BY prejsť všetkých 16 587 riadkov a zoradiť ich — a spolu s načítaním
-- klientov v tej istej požiadavke to worker neutiahol (3. 9. 2026, HTTP 500).
--
-- S indexom je to čítanie 150 riadkov z konca indexu.
CREATE INDEX IF NOT EXISTS idx_gads_dopyty_zobrazenia ON gads_dopyty (zobrazenia DESC);
