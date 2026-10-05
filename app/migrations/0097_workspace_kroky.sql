-- WORKSPACE PO KROKOCH (Jerry, 4. 10. 2026) — tri malé doplnky dát.

-- 1. PLATBA VOPRED. Klient zaplatí skôr, než začne nový balíček; balíček
--    vznikne až prvým tréningom a tá platba ho má pokryť sama. Dlh sa počíta
--    z platieb od prvého balíčka z Kokpitu — platba spred neho by sa stratila.
--    Príznak sa nastaví pri priradení platby, keď klient v tej chvíli nič
--    nedlží: platba teda nepatrí ničomu, čo už existuje.
ALTER TABLE platby ADD COLUMN vopred INTEGER NOT NULL DEFAULT 0;

-- 2. DRUHÉ ČÍSLO KLIENTA. SMS sa dá poslať aj na číslo, ktoré nie je
--    v profile (rodič, partner); Jerry: „keby použijem číslo, ktoré nepatrí
--    žiadnemu klientovi, mala by byť možnosť toto číslo uložiť na profil
--    daného klienta ako druhé číslo."
ALTER TABLE klient_fakturacia ADD COLUMN telefon2 TEXT NOT NULL DEFAULT '';

-- 3. PRESUN HODÍN DO ĎALŠIEHO BALÍČKA. Pri předplatnom sa po konci
--    platnosti smú preniesť najviac dve hodiny — do ĎALŠIEHO balíčka, takže
--    vznikne „6h Předplatné" s 8 hodinami. Ďalší balíček často ešte nie je;
--    presun preto čaká tu a pridá sa k prvému balíčku, ktorý po ňom vznikne.
CREATE TABLE IF NOT EXISTS balicky_presun (
  id                 TEXT PRIMARY KEY,
  klient             TEXT NOT NULL,
  hodiny             REAL NOT NULL,
  -- Koniec platnosti balíčka, z ktorého sa hodiny presúvajú.
  z_platnosti_do     TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  autor              TEXT,
  -- Do ktorého balíčka hodiny odišli; prázdne = ešte čakajú.
  pouzite_balicek_id TEXT,
  pouzite_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_balicky_presun_klient ON balicky_presun (klient);
