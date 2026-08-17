#!/usr/bin/env bash
#
# Nasadenie Kokpitu, ktoré vie povedať pravdu.
#
# PREČO TENTO SÚBOR EXISTUJE
#
# `wrangler deploy` sa na tomto stroji chová nespoľahlivo a — čo je horšie —
# klame. Merané 17. 8. 2026 na šiestich rovnakých behoch za sebou:
#
#   • dva behy skončili sekundu po štarte, výpis obsahoval len hlavičku
#     wranglera, návratový kód 0 a NIČ sa nenasadilo;
#   • jeden beh sa nasadil úspešne, ale výpis sa zastavil na „Total Upload"
#     a o úspechu nepovedal nič.
#
# Príčina je v tom, že na tomto stroji nie je Node. Wrangler ho vyžaduje
# (v22+) a jeho spúšťač `node_modules/.bin/wrangler` má `#!/usr/bin/env node`,
# takže ho `bunx` púšťa pod bunom. Ten spúšťač navyše robí toto:
#
#     .on("exit", (code) => process.exit(code ?? 0))
#
# — keď dieťa zomrie na signál (code je null), rodič ohlási ÚSPECH. Preto je
# návratový kód pri tomto nástroji bezcenný a nedá sa naň spoľahnúť.
#
# Trvalá liečba je nainštalovať Node. Kým sa tak nestane, platí tu jediné
# pravidlo: neveriť výpisu ani návratovému kódu, ale OVERIŤ VÝSLEDOK — číslo
# verzie na Cloudflare musí stúpnuť a nový súbor appky musí byť naozaj
# dostupný. Kým to neplatí, skúša sa znova.
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

verzia() {
  curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$ucet/workers/scripts/$worker/versions?per_page=1" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['items'][0]['number'])" 2>/dev/null
}

if [ "${1:-}" != "--bez-buildu" ]; then
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
if [ -z "$kontrolny" ]; then
  echo "✗ v dist/client/assets nie je žiadny index-*.js — chýba build."
  exit 1
fi

pred=$(verzia)
echo "▸ nasadzujem (verzia teraz: ${pred:-?}, kontrolný súbor: $kontrolny)"

for i in $(seq 1 $pokusov); do
  # Vyrovnávacia pamäť wranglera po prerušenom pokuse tvrdí, že assety už
  # nahral — a potom ich naozaj nenahrá. Pred každým pokusom preč.
  rm -rf .wrangler/tmp
  # Priamo cli.js, nie spúšťač: ten prekladá smrť dieťaťa na návratový kód 0.
  bun node_modules/wrangler/wrangler-dist/cli.js deploy > /tmp/nasad-$i.log 2>&1

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
