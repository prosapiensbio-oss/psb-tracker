-- Celý popisný riadok platby z PTmindera.
--
-- Doteraz sa z riadku vytiahlo len meno, suma a spôsob platby a zvyšok textu sa
-- zahodil. Práve v ňom ale môže byť to, čo najviac chýba — KÓD ZĽAVY. Bez neho
-- sa dôvod nižšej sumy dá len hádať, a hádanie už raz vyrobilo nesprávny záver
-- (9 828 Kč vyzeralo ako odmena za doporučenie, bola to bitcoinová zľava).
--
-- Ukladá sa surový text, nie interpretácia: keď sa v ňom kód objaví, dá sa
-- doplniť parsovanie spätne nad už nahratými dátami.
ALTER TABLE payments ADD COLUMN note TEXT NOT NULL DEFAULT '';
