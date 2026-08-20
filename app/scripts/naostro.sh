#!/usr/bin/env bash
# Hĺbkový test notifikácií nad OSTRÝMI dátami z D1.
#
# Jednotkové testy overujú pravidlá na vymyslených dátach. Toto overuje, čo
# appka naozaj povie Jerrymu dnes — a hlavne čo sa stane PO kliknutí. Dvakrát
# to už odhalilo chybu, ktorú testy nevideli (klient tretieho trénera, ktorého
# notifikácie nevidel nikto).
#
#   ./scripts/naostro.sh
#
# Dáta sa sťahujú do dočasného priečinka a nikam sa nezapisujú — skript je
# výhradne na čítanie.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=5f34fff3-d3a3-44f2-a68d-57d9f6151749
DATA="${NAOSTRO_DATA:-$(mktemp -d)}"
export NAOSTRO_DATA="$DATA"

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
        r = obj[0]["results"]
        json.dump(r, open(sys.argv[3],"w"), ensure_ascii=False)
        print("  %-14s %5d" % (sys.argv[2], len(r))); break
    i=end
' "$1" "$2" "$3"
}
stiahni() {
  bunx wrangler d1 execute "$DB" --remote --json --command "$2" > "$DATA/raw.txt" 2>/dev/null
  vyber "$DATA/raw.txt" "$1" "$DATA/$1.json"
}

echo "▸ sťahujem ostré dáta"
stiahni sessions     "SELECT date,time,client_name,session_trainer,session_name,session_type,duration_min,price_czk FROM sessions"
stiahni packages     "SELECT * FROM packages"
stiahni overrides    "SELECT * FROM client_overrides"
stiahni acks         "SELECT * FROM anomaly_ack"
stiahni leads        "SELECT * FROM leads"
stiahni payments     "SELECT date,client_name,amount_czk,payment_method FROM payments"
stiahni services     "SELECT date,client_name,service_type,service_description,price_czk,is_6m,trainer FROM services"
stiahni kal_udalosti "SELECT uid,trener,zaciatok,koniec,nazov,klient,typ,zmizla_at FROM kal_udalosti WHERE zaciatok >= date('now','-40 days')"
stiahni kal_zmeny    "SELECT id,kedy,trener,druh,nazov,klient,pred,po,vysvetlene,poznamka FROM kal_zmeny ORDER BY kedy DESC LIMIT 300"

bun run scripts/naostro.ts
