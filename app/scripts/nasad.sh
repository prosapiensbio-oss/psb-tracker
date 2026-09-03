#!/usr/bin/env bash
#
# Nasadenie Kokpitu, ktoré vie povedať pravdu.
#
# PREČO TENTO SÚBOR EXISTUJE
#
# Do 17. 8. 2026 nebol na stroji Node. Wrangler ho vyžaduje (v22+) a jeho
# spúšťač `node_modules/.bin/wrangler` má `#!/usr/bin/env node`, takže ho
# `bunx` púšťal pod bunom. Merané na šiestich rovnakých behoch: DVA skončili
# sekundu po štarte s výpisom obsahujúcim len hlavičku, návratovým kódom 0
# a bez nasadenia; jeden sa nasadil, ale výpis sa zastavil na „Total Upload".
# Spúšťač totiž robí `.on("exit", (code) => process.exit(code ?? 0))` — smrť
# dieťaťa na signál ohlási ako ÚSPECH.
#
# Node je odvtedy nainštalovaný (v24.19.0) a tá istá šesťnásobná skúška dáva
# 6/6 s úplným výpisom. Skript preto beží cez skutočný Node, keď je po ruke.
#
# OVEROVANIE ZOSTÁVA. Nie preto, že by Node zlyhával, ale preto, že je tu
# druhá pasca, ktorá s Node nesúvisí: wrangler si v `.wrangler/tmp` pamätá,
# čo už nahral, a po prerušenom pokuse hlási „No updated asset files to
# upload" — workera nasadí, ale assety nepošle, takže v prehliadači beží
# stará appka nad novým workerom. To sa nedá vyčítať z výpisu, len z toho,
# či je nový súbor naozaj dostupný. A overiť výsledok je aj tak lacnejšie
# než ho hádať.
#
# Použitie:
#   ./scripts/nasad.sh              build + nasadenie + overenie
#   ./scripts/nasad.sh --bez-buildu  keď je build už hotový

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

ucet="ec175e983db96989b58758532245e031"
worker="kokpit"
adresa="https://kokpit.prosapiensbio.workers.dev"
pokusov=6

# Token žije v ~/.zshrc a tento shell profil nečíta.
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  eval "$(grep '^export CLOUDFLARE_API_TOKEN=' ~/.zshrc)"
fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "✗ CLOUDFLARE_API_TOKEN nie je nastavený ani v ~/.zshrc."
  exit 1
fi

# ── Stráž migrácií ───────────────────────────────────────────────────────────
#
# Migrácie sa púšťajú ručne (`wrangler d1 execute --file`) a NIKTO si to
# nezapisoval: tabuľka d1_migrations skončila pri 0024, priečinok mal 0050.
# Presne cez túto dieru kedysi prepadlo `precoNeprisiel` — obrazovka mala
# input, databáza nemala stĺpec (revízia 19. 8. 2026).
#
# Pred každým nasadením sa preto porovná priečinok s evidenciou v DB. Súbor,
# ktorý v evidencii chýba, sa OHLÁSI a nasadenie sa ZASTAVÍ — nepúšťa sa sám,
# lebo migrácia, ktorá už bola aplikovaná ručne, by sa spustila druhýkrát.
# Keď si istý, že je aplikovaná, dopíš ju do evidencie:
#   ./scripts/nasad.sh --migracia-hotova 0051_nazov.sql
d1() {
  node node_modules/.bin/wrangler d1 execute psb-tracker-db --remote --config wrangler.jsonc --command "$1" --json 2>/dev/null
}
if [ "${1:-}" = "--migracia-hotova" ] && [ -n "${2:-}" ]; then
  d1 "INSERT INTO d1_migrations (name, applied_at) VALUES ('$2', datetime('now'))" >/dev/null \
    && echo "✓ $2 zapísaná do evidencie" || echo "✗ zápis zlyhal"
  exit 0
fi
evidencia=$(d1 "SELECT name FROM d1_migrations" | grep -o '"name": "[^"]*"' | sed 's/"name": "//; s/"$//')
chybaju=""
for f in migrations/*.sql; do
  n=$(basename "$f")
  echo "$evidencia" | grep -qx "$n" || chybaju="$chybaju $n"
done
if [ -n "$chybaju" ]; then
  echo "✗ Migrácie v priečinku, ale NIE v evidencii databázy:"
  for n in $chybaju; do echo "    $n"; done
  echo "  Ak je aplikovaná: ./scripts/nasad.sh --migracia-hotova <súbor>"
  echo "  Ak nie je:        wrangler d1 execute psb-tracker-db --remote --config wrangler.jsonc --file migrations/<súbor>"
  echo "                    a potom --migracia-hotova."
  exit 1
fi
echo "✓ migrácie: evidencia sedí s priečinkom"

verzia() {
  curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$ucet/workers/scripts/$worker/versions?per_page=1" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['items'][0]['number'])" 2>/dev/null
}

if [ "${1:-}" != "--bez-buildu" ]; then
  # Testy pred buildom — 20. 8. 2026 sa nasadila zmena, ktorá rozbila 3 testy,
  # a nikto si to nevšimol, lebo nasadenie testy nepúšťalo. Zelený build nie je
  # dôkaz; zelené testy aspoň strážia to, čo dokumentujú.
  echo "▸ testy…"
  if ! bun run test > /tmp/nasad-test.log 2>&1; then
    echo "✗ testy zlyhali — pozri /tmp/nasad-test.log"
    tail -20 /tmp/nasad-test.log
    exit 1
  fi
  echo "  testy OK ($(grep -Eo '[0-9]+ pass' /tmp/nasad-test.log | tail -1))"
  echo "▸ build…"
  if ! bun run build > /tmp/nasad-build.log 2>&1; then
    echo "✗ build zlyhal:"; tail -20 /tmp/nasad-build.log; exit 1
  fi
  echo "  build OK"
fi

# Súbor, ktorého prítomnosť na serveri dokazuje, že sa nasadila TÁTO appka.
# Samotné číslo verzie nestačí: wrangler vie nasadiť workera a assety pritom
# neposlať (pamätá si v .wrangler/tmp, čo už poslal), a v prehliadači potom
# beží stará appka nad novým workerom.
kontrolny=$(ls -t dist/client/assets/index-*.js 2>/dev/null | head -1 | xargs -r basename)

# Čo má server, aby to appka vedela porovnať s tým, čo naozaj beží.
#
# Na iPhone beží Kokpit zo Safari a po návrate z pozadia môže pokračovať starý
# kód v pamäti. Zvonku sa to nedá odlíšiť od „ešte to nie je nasadené" — a
# presne to sa Jerry 31. 8. 2026 pýtal. Čas sa VYBERÁ Z POSTAVENÉHO BALÍKA
# (vite ho tam zapiekol), nie generuje nanovo: musí to byť ten istý reťazec
# do znaku, inak by porovnanie hlásilo nezhodu po každom nasadení.
cas_buildu=$(grep -ohE '"20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z"' dist/client/assets/index-*.js 2>/dev/null | head -1 | tr -d '"')
if [ -n "$cas_buildu" ]; then
  printf '{"cas":"%s"}' "$cas_buildu" > dist/client/verzia.json
  echo "▸ verzia balíka: $cas_buildu"
else
  echo "⚠ čas buildu sa v balíku nenašiel — appka nebude vedieť ohlásiť starú verziu"
fi
if [ -z "$kontrolny" ]; then
  echo "✗ v dist/client/assets nie je žiadny index-*.js — chýba build."
  exit 1
fi

# Skutočný Node, keď je; inak bun priamo na cli.js (bez klamlivého spúšťača).
if command -v node > /dev/null 2>&1; then
  spustac="./node_modules/.bin/wrangler"
  runtime="node $(node -v)"
else
  spustac="bun node_modules/wrangler/wrangler-dist/cli.js"
  runtime="bun (Node nie je nainštalovaný — nasadenie býva nespoľahlivé)"
fi

pred=$(verzia)
echo "▸ runtime: $runtime"
echo "▸ nasadzujem (verzia teraz: ${pred:-?}, kontrolný súbor: $kontrolny)"

for i in $(seq 1 $pokusov); do
  # Vyrovnávacia pamäť wranglera po prerušenom pokuse tvrdí, že assety už
  # nahral — a potom ich naozaj nenahrá. Pred každým pokusom preč.
  rm -rf .wrangler/tmp
  # `-c` výslovne, hoci je to východzí súbor: vedľa dlho ležala jeho kópia
  # a väzba pridaná do tej nesprávnej sa ticho nenasadila (25. 8. 2026).
  $spustac deploy -c wrangler.jsonc > /tmp/nasad-$i.log 2>&1

  po=$(verzia)
  asset=$(curl -s -o /dev/null -w '%{http_code}' "$adresa/assets/$kontrolny")

  if [ -n "$po" ] && [ -n "$pred" ] && [ "$po" -gt "$pred" ] && [ "$asset" = "200" ]; then
    echo "✓ nasadené — verzia $pred → $po, súbor $kontrolny je živý"
    exit 0
  fi
  echo "  pokus $i/$pokusov nestačil (verzia ${po:-?}, súbor $asset) — skúšam znova"
  sleep 3
done

echo "✗ po $pokusov pokusoch sa nepodarilo overiť nasadenie."
echo "  Posledný výpis: /tmp/nasad-$pokusov.log"
tail -5 "/tmp/nasad-$pokusov.log"
exit 1
