-- Hotový text príspevku — posledný chýbajúci článok reťaze.
--
-- Kokpit drží ZÁMER (koncept, fáza, kto v tom vystupuje), Claude Project
-- z neho vyrobí VETY. Do 23. 8. 2026 tie vety nemali kam ísť späť: žili
-- v okne prehliadača, odtiaľ išli do Metricoolu a v pláne po nich nezostala
-- stopa. O mesiac sa už nedalo zistiť, či ten reel vôbec vyšiel.
ALTER TABLE mkt_napady ADD COLUMN hotovy_text TEXT DEFAULT '';
