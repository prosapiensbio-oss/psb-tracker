-- Verzia prihlásenia na konte: zvýšením sa odhlásia všetky zariadenia.
-- Verzia 0 = pôvodný tvar cookie, takže migrácia nikoho neodhlási.
ALTER TABLE users ADD COLUMN session_ver INTEGER NOT NULL DEFAULT 0;

-- Limit pokusov o prihlásenie. Kľúč je hash (IP + meno, alebo IP samotná).
CREATE TABLE IF NOT EXISTS login_pokusy (
  kluc     TEXT PRIMARY KEY,
  pocet    INTEGER NOT NULL DEFAULT 0,
  prve_at  TEXT NOT NULL
);
