-- Meta zrušila trojsekundové videnia. Dnešná metrika je „continuous 2-second"
-- a stĺpec sa preto volá podľa toho, čo v ňom naozaj je — 19. 8. 2026.
-- Benchmarky hook rate boli merané na trojsekundových videniach; dvojsekundové
-- vychádzajú o niečo vyššie, takže pásma sú orientačné, nie presné.
ALTER TABLE mkt_reklamy RENAME COLUMN videnia3s TO videnia2s;
