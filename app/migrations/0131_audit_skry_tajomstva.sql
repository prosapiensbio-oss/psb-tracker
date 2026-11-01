-- Audit do novembra 2026 zapisoval hodnoty nastavení čitateľne, aj heslo k pošte.
-- Zasiahne 11 riadkov (stav 1. 11. 2026): mail_heslo 4, meta_token 3, web_lead_secret 2,
-- google_sa 1, mailer_token 1. Čitateľnú hodnotu tajomstva majú len mail_heslo
-- a web_lead_secret; ostatné nesú text typu „token nastavený".
-- Kto a kedy kľúč zmenil, v audite ostáva. Prázdna hodnota ostáva prázdna.
UPDATE vzas_audit
   SET old_value = CASE WHEN old_value IS NULL THEN NULL ELSE '[skryté]' END,
       new_value = CASE WHEN new_value IS NULL THEN NULL ELSE '[skryté]' END
 WHERE action = 'nastavenie'
   AND payment_id IN (
     'gads_dev_token','google_sa','mail_heslo','mailer_token','meta_capi_token','meta_token',
     'metricool_klient','metricool_pkce','metricool_token','psi_api_key','sms_kluc',
     'vapid_private','web_lead_secret'
   );
