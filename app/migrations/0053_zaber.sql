-- Úvodný záber príspevku.
--
-- Hák doteraz znamenal len prvú VETU. Lenže v reeli rozhoduje prvá sekunda
-- OBRAZU — text sa číta až druhý. Bez tohto poľa Jerry dostal dokonalú vetu
-- a natočil k nej statický záber, ktorý ju zabil.
ALTER TABLE mkt_napady ADD COLUMN zaber TEXT DEFAULT '';
