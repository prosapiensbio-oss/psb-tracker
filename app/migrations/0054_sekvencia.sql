-- Sekvencia záberov k hotovému textu.
--
-- Reťaz mala doteraz dieru: Jarvis dal zámer, Project vety, ale nikto
-- nepovedal, ČO sa pri ktorej vete natočí. Jerry to držal v hlave a pri
-- natáčaní improvizoval.
--
-- JSON, nie vlastná tabuľka: sekvencia nemá zmysel bez svojho slotu, nikdy
-- sa nedopytuje samostatne a je krátka (3–10 položiek).
ALTER TABLE mkt_napady ADD COLUMN sekvencia TEXT DEFAULT '';
