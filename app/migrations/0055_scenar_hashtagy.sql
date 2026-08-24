-- Scenár a hashtagy — dva rôzne texty, ktoré sa doteraz mlčky mieša do jedného.
--
-- `hotovy_text` bol pomenovaný nejasne a používal sa ako caption. Chýbalo:
--   scenar   — čo Jerry HOVORÍ na kameru (iný text než popis pod príspevkom)
--   hashtagy — bez nich sa príspevok nedá zverejniť a dopisovali sa ručne
--
-- Prečo tri polia a nie jedno: caption sa kopíruje do Metricoolu, scenár sa
-- čita pri natáčaní a hashtagy sa menia nezávisle od oboch. Jedno pole by
-- znamenalo, že sa pred každým použitím musí ručne rozstrihať.
ALTER TABLE mkt_napady ADD COLUMN scenar TEXT DEFAULT '';
ALTER TABLE mkt_napady ADD COLUMN hashtagy TEXT DEFAULT '';
