-- Additive: per-client "pays in Bitcoin" flag on the manual overrides table.
ALTER TABLE client_overrides ADD COLUMN bitcoin INTEGER NOT NULL DEFAULT 0;
