#!/usr/bin/env bash
# Beta Kokpitu na vlastnej adrese — ten istý kód, tá istá databáza.
#
# PREČO A ČO TO NIE JE
#
# Jerry, 23. 9. 2026: „vedel by si postaviť niečo ako beta verziu Kokpitu, kde
# by sme mohli testovať rôzne návrhy?" Toto je ono. Nové rozloženia sa dajú
# preklikať naživo, na skutočných číslach, bez toho, aby ich uvidel ostrý
# Kokpit.
#
# **Pozor: je to TÁ ISTÁ databáza.** Čo sa v bete zapíše, je zapísané naozaj.
# Oddelená kópia dát by znamenala testovanie na starých číslach a stratilo by
# to zmysel; radšej jedna pravda a červený pruh hore, ktorý to hovorí nahlas.
#
# PREČO NIE DRUHÝ CONFIG
#
# `wrangler.jsonc` je jediný config nasadenia (pravidlo z 25. 8. 2026 — kópia
# vedľa neho raz tvrdila, že nasadzovacia je ona, a väzba sa ticho nenasadila).
# Meno workera sa preto prepisuje parametrom `--name`, nie druhým súborom:
# jeden config, dva ciele.
#
#   ./scripts/beta.sh            build + nasadenie bety
#   ./scripts/beta.sh --bez-buildu   použije, čo je v dist/
set -uo pipefail
cd "$(dirname "$0")/.."

meno="kokpit-beta"
adresa="https://${meno}.prosapiensbio.workers.dev"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "✗ chýba CLOUDFLARE_API_TOKEN — pusti: eval \"\$(grep '^export CLOUDFLARE_API_TOKEN=' ~/.zshrc)\""
  exit 1
fi

if [ "${1:-}" != "--bez-buildu" ]; then
  echo "▸ build…"
  if ! bun run build > /tmp/beta-build.log 2>&1; then
    echo "✗ build zlyhal:"; tail -20 /tmp/beta-build.log; exit 1
  fi
  echo "  build OK"
fi

kontrolny=$(ls -t dist/client/assets/index-*.js 2>/dev/null | head -1 | xargs -r basename)
[ -z "$kontrolny" ] && { echo "✗ v dist/client/assets nie je index-*.js"; exit 1; }
cas_buildu=$(grep -ohE '"20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z"' dist/client/assets/index-*.js 2>/dev/null | head -1 | tr -d '"')
[ -n "$cas_buildu" ] && printf '{"cas":"%s"}' "$cas_buildu" > dist/client/verzia.json

if command -v node > /dev/null 2>&1; then spustac="./node_modules/.bin/wrangler"; else spustac="bun node_modules/wrangler/wrangler-dist/cli.js"; fi

# Rovnaká poistka ako v nasad.sh: wrangler si v .wrangler/tmp pamätá, čo už
# poslal, a po prerušenom pokuse nasadí workera bez assetov.
rm -rf .wrangler/tmp 2>/dev/null
echo "▸ nasadzujem betu ako $meno (kontrolný súbor: $kontrolny)"
if ! $spustac deploy -c wrangler.jsonc --name "$meno" > /tmp/beta-deploy.log 2>&1; then
  echo "✗ nasadenie zlyhalo:"; tail -25 /tmp/beta-deploy.log; exit 1
fi

# Overenie cez HTTP — zelený deploy nehovorí nič o tom, či worker beží.
kod=$(curl -s -o /dev/null -w '%{http_code}' "$adresa/?v=$(date +%s)")
kodAsset=$(curl -s -o /dev/null -w '%{http_code}' "$adresa/assets/$kontrolny")
echo "  shell: $kod · asset: $kodAsset"
if [ "$kod" = "200" ] && [ "$kodAsset" = "200" ]; then
  echo "✓ beta beží — $adresa"
  echo "  POZOR: je to tá istá databáza ako ostrý Kokpit. Čo tu klikneš, je zapísané naozaj."

  # Tajomstvá sú VLASTNÉ pre každého workera — deploy pod iným menom ich
  # neprenesie. 23. 9. 2026 sa preto v bete nenačítal bitcoin a Jerry si
  # myslel, že je to chyba obrazovky; pritom /api/btc-reserve vracal
  # „no_token". Radšej to povedať hneď pri nasadení než hľadať v kóde.
  maju=$($spustac secret list --name "$meno" 2>/dev/null | tr -d ' "' | grep -o 'name:[A-Z_]*' | cut -d: -f2)
  chyba=""
  for s in ANTHROPIC_API_KEY BTC_RESERVE_TOKEN PSB_SESSION_SECRET; do
    echo "$maju" | grep -qx "$s" || chyba="$chyba $s"
  done
  [ -n "$chyba" ] && {
    echo "  Bez tajomstiev (tieto časti budú v bete prázdne):$chyba"
    echo "  Doplníš ich: $spustac secret put NAZOV --name $meno"
  }
else
  echo "✗ beta neodpovedá tak, ako má (čakalo sa 200/200)"
  tail -12 /tmp/beta-deploy.log
  exit 1
fi
