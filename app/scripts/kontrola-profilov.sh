#!/usr/bin/env bash
# KONTROLÓR PROFILU KLIENTA nad OSTRÝMI dátami.
#
# Jerry, 27. 9. 2026: „skontroluj celú túto časť — profily, tréningy, ceny,
# platby, dochádzku — a napíš report všetkého, čo by potenciálne mohlo
# nesedieť."
#
# Jednotkové testy overujú PRAVIDLÁ na vymyslených dátach; `naostro.sh` overuje
# NOTIFIKÁCIE. Toto overuje ČÍSLA V PROFILE: odpočet hodín, dlh, platby a
# dochádzku — a hlavne miesta, kde sa dva zdroje o tom istom rozchádzajú.
#
#   ./scripts/kontrola-profilov.sh
#
# Skript IBA ČÍTA. Nález neznamená chybu v kóde — znamená „pozri sa na to".
set -euo pipefail
cd "$(dirname "$0")/.."

DB=5f34fff3-d3a3-44f2-a68d-57d9f6151749
DATA="${KONTROLA_DATA:-$(mktemp -d)}"
export KONTROLA_DATA="$DATA"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  eval "$(grep '^export CLOUDFLARE_API_TOKEN=' ~/.zshrc)"
fi

# wrangler mieša do JSON aj ľudské hlásenia — vyberie sa prvé pole s `results`.
vyber() {
  python3 -c '
import json,sys
t=open(sys.argv[1]).read(); dec=json.JSONDecoder(); i=0
while True:
    i=t.find("[",i)
    if i<0: sys.exit(f"nenasiel som vysledok pre {sys.argv[2]}")
    try: obj,end=dec.raw_decode(t,i)
    except Exception: i+=1; continue
    if isinstance(obj,list) and obj and isinstance(obj[0],dict) and "results" in obj[0]:
        json.dump(obj[0]["results"], open(sys.argv[3],"w"), ensure_ascii=False)
        print("  %-16s %5d" % (sys.argv[2], len(obj[0]["results"]))); break
    i=end
' "$1" "$2" "$3"
}
stiahni() {
  bunx wrangler d1 execute "$DB" --remote --json --command "$2" > "$DATA/raw.txt" 2>/dev/null
  vyber "$DATA/raw.txt" "$1" "$DATA/$1.json"
}

echo "▸ sťahujem ostré dáta"
stiahni sessions   "SELECT date,time,client_name,session_trainer,session_name,session_type,duration_min,price_czk FROM sessions"
stiahni packages   "SELECT client_name,package_name,sessions_total,sessions_remaining,valid_from,valid_to,payment_czk,added FROM packages"
stiahni services   "SELECT date,client_name,service_type,service_description,price_czk,is_6m,trainer FROM services"
stiahni payments   "SELECT date,client_name,amount_czk,payment_method FROM payments"
stiahni platby     "SELECT klient,datum,suma_czk,sposob,fio_id FROM platby WHERE zrusene_at IS NULL"
stiahni poplatky   "SELECT id,datum,client_name,popis,suma_czk FROM poplatky"
stiahni zdarma     "SELECT client_name,den,dovod,kto FROM treningy_zdarma"
stiahni overrides  "SELECT * FROM client_overrides"
stiahni acks       "SELECT * FROM anomaly_ack"
stiahni leads      "SELECT * FROM leads"
stiahni kal        "SELECT uid,trener,zaciatok,koniec,nazov,klient,typ,zmizla_at FROM kal_udalosti WHERE zmizla_at IS NULL"

bun run scripts/kontrola-profilov.ts
