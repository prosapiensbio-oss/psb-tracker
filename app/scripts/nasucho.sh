#!/usr/bin/env bash
# NASUCHO: čo si appka založí sama, keď Jerry otvorí Kokpit.
#
# Jerry, 4. 10. 2026: „Zásah do reálnych finančných dát mi najprv ukáž."
# Balíčky vznikajú samy prvým tréningom a nesú dlh — toto je ten náhľad.
# Skript IBA ČÍTA.
#
#   ./scripts/nasucho.sh
#   KONTROLA_DATA=<dump z kontrola-profilov.sh> ./scripts/nasucho.sh   # bez sťahovania
#
# Dáta musia byť namapované PRESNE ako v appke — ručne poskladaný vstup
# `deriveClients` ticho rozsype a návrhy potom vyjdú úplne iné (8. 10. 2026:
# najprv 0 návrhov, potom 4 falošné). Preto sa hlavička nekopíruje, ale
# BERIE zo `kontrola-profilov.ts`, a telo je v `nasucho-telo.ts`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${KONTROLA_DATA:-}" ]; then
  export KONTROLA_DATA="$(mktemp -d)"
  echo "▸ sťahujem ostré dáta"
  ./scripts/kontrola-profilov.sh >/dev/null
fi

if [ ! -f "$KONTROLA_DATA/druhy.json" ]; then
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then eval "$(grep '^export CLOUDFLARE_API_TOKEN=' ~/.zshrc)"; fi
  bunx wrangler d1 execute 5f34fff3-d3a3-44f2-a68d-57d9f6151749 --remote --json \
    --command "SELECT klient,den,druh FROM trening_druh" > "$KONTROLA_DATA/raw-druhy.txt" 2>/dev/null
  python3 -c '
import json,sys
t=open(sys.argv[1]).read(); dec=json.JSONDecoder(); i=0
while True:
    i=t.find("[",i)
    if i<0: json.dump([], open(sys.argv[2],"w")); break
    try: obj,end=dec.raw_decode(t,i)
    except Exception: i+=1; continue
    if isinstance(obj,list) and obj and isinstance(obj[0],dict) and "results" in obj[0]:
        json.dump(obj[0]["results"], open(sys.argv[2],"w"), ensure_ascii=False); break
    i=end
' "$KONTROLA_DATA/raw-druhy.txt" "$KONTROLA_DATA/druhy.json"
fi

GEN="$KONTROLA_DATA/nasucho.gen.ts"
python3 - "$GEN" <<'PY'
import sys, os
hlava = open("scripts/kontrola-profilov.ts", encoding="utf-8").read()
hlava = hlava[:hlava.index("let nalezov = 0;")]
if "navrhNovehoBalicka" not in hlava:
    hlava = hlava.replace('import { deriveClients }',
        'import { navrhNovehoBalicka } from "../src/lib/psb/workspaceKroky";\nimport { deriveClients }', 1)
telo = open("scripts/nasucho-telo.ts", encoding="utf-8").read()
# Hlavička žije v scripts/, generovaný súbor inde — cesty k src/ musia sedieť.
koren = os.path.abspath("src")
out = (hlava + telo).replace('"../src/lib/psb/', f'"{koren}/lib/psb/')
open(sys.argv[1], "w", encoding="utf-8").write(out)
PY
bun run "$GEN"
