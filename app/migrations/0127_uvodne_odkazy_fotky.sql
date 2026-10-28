-- Fotky pred a po pri SMS po úvodnom (Jerry, 28. 10. 2026: „často odfotíme
-- klienta v rámci diagnostiky, počas tréningu ho narovnáme a odfotíme znovu —
-- a toto im poslať"). Zoznam id z `klient_fotky` (porovnania), ktoré stránka
-- /u/<token> ukáže. Fotka sama zostáva v R2 zašifrovaná; stránka ju vydá len
-- vtedy, keď je jej id v tomto zozname a patrí tomu istému klientovi.
ALTER TABLE uvodne_odkazy ADD COLUMN fotky_json TEXT;
