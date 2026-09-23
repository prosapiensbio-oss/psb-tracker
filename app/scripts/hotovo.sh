#!/usr/bin/env bash
# Celý reťazec naraz: typy → testy → nasadenie → kontrola naživo → ostré dáta.
#
# PREČO
#
# Jerry, 22. 9. 2026: „postav testera, kontrolóra, nasadzovača — a ty mi len
# napíš, keď to bude celé hotové." Jednotlivé kúsky existovali (nasad.sh,
# naostro.sh, bun run test), ale spúšťali sa ručne a v rôznom poradí, takže sa
# dalo nasadiť bez toho, aby niekto pozrel, či appka naživo vôbec beží. Táto
# appka má na to vlastnú lekciu: zelený build ani úspešný `wrangler deploy`
# nehovoria nič o tom, či worker odpovedá — 503 sa objaví až pri prvej
# skutočnej požiadavke.
#
# PORADIE JE ZÁMER
#
#   1. typy       — najlacnejšie, spadne najskôr
#   1b. hooky     — poradie hookov; chyba, ktorú typy ani testy nevidia
#   2. testy      — pravidlá na vymyslených dátach
#   3. nasadenie  — nasad.sh (má v sebe stráž migrácií aj overenie assetu)
#   4. naživo     — shell, asset a API cez HTTP; to je jediný dôkaz, že beží
#   5. ostré dáta — naostro.sh nad produkčným D1, iba na čítanie
#
# Kontrola naživo je AŽ PO nasadení zámerne: pred ním by merala starú verziu.
#
#   ./scripts/hotovo.sh              celý reťazec
#   ./scripts/hotovo.sh --bez-nasadenia   len typy, testy a kontroly
#
# Návratový kód je 0 len vtedy, keď prešlo všetko.
set -uo pipefail
cd "$(dirname "$0")/.."

adresa="https://kokpit.prosapiensbio.workers.dev"
log=$(mktemp -d)/hotovo
mkdir -p "$log"
bez_nasadenia=0
[ "${1:-}" = "--bez-nasadenia" ] && bez_nasadenia=1

zelena=$'\033[32m'; cervena=$'\033[31m'; siva=$'\033[90m'; koniec=$'\033[0m'
zoznam=()
zlyhalo=0

krok() {
  local nazov="$1"; shift
  local subor="$log/$(echo "$nazov" | tr ' /' '__').log"
  # printf %-22s počíta BAJTY a bash 3.2 na macOS počíta v ${#…} tiež bajty —
  # pri „naživo" a „ostré dáta" sa stĺpec rozsypal o jeden znak na každý
  # dĺžeň. Znaky sa preto rátajú ako bajty mínus pokračovacie bajty UTF-8
  # (tie majú vždy tvar 10xxxxxx).
  local pokracovacie
  pokracovacie=$(printf '%s' "$nazov" | LC_ALL=C grep -o $'[\x80-\xBF]' | wc -l | tr -d ' ')
  local medzery=$((22 - ${#nazov} + pokracovacie))
  [ "$medzery" -lt 1 ] && medzery=1
  printf '▸ %s%*s' "$nazov" "$medzery" ""
  if "$@" > "$subor" 2>&1; then
    # Posledný riadok sa NEOREZÁVA: `cut -c` krája po bajtoch a z rámčekov
    # v naostro.sh robilo to orezanie nečitateľnú kašu.
    printf '%s✓%s %s%s%s\n' "$zelena" "$koniec" "$siva" "$(tail -1 "$subor" | tr -d '\r')" "$koniec"
    zoznam+=("✓ $nazov")
  else
    printf '%s✗%s\n' "$cervena" "$koniec"
    echo "  ── posledných 20 riadkov ($subor):"
    tail -20 "$subor" | sed 's/^/  /'
    zoznam+=("✗ $nazov")
    zlyhalo=1
  fi
}

# Kontrola naživo. Nie je to „curl vrátil dačo" — každá odpoveď má očakávaný
# kód a ten sa vypíše, aby sa z chyby dalo niečo prečítať (appka má pravidlo
# nikdy nehlásiť len stavový kód bez tela).
naziveA() {
  local chyba=0
  local kod
  kod=$(curl -s -o /dev/null -w '%{http_code}' "$adresa/?v=$(date +%s)")
  echo "shell: $kod"
  [ "$kod" = "200" ] || { echo "  ČAKALO SA 200 — worker nebeží alebo padá"; chyba=1; }

  # Čerstvý asset z posledného buildu: keď wrangler assety nenahral, appka
  # v prehliadači beží stará nad novým workerom a poznať to inak nedá.
  local asset
  asset=$(ls -t dist/client/assets/index-*.js 2>/dev/null | head -1 | xargs -r basename)
  if [ -n "$asset" ]; then
    kod=$(curl -s -o /dev/null -w '%{http_code}' "$adresa/assets/$asset")
    echo "asset $asset: $kod"
    [ "$kod" = "200" ] || { echo "  ČAKALO SA 200 — assety sa nenahrali"; chyba=1; }
  fi

  # API bez prihlásenia musí odmietnuť. 401 je dôkaz, že server žije AJ že
  # heslová brána drží; 200 by znamenalo otvorené dáta.
  for cesta in /api/data /api/kalendar /api/balicky; do
    kod=$(curl -s -o /dev/null -w '%{http_code}' "$adresa$cesta")
    echo "$cesta bez prihlásenia: $kod"
    case "$kod" in
      401|403) ;;
      5*) echo "  SERVEROVÁ CHYBA"; chyba=1 ;;
      200) echo "  OTVORENÉ BEZ HESLA — to je díra, nie úspech"; chyba=1 ;;
      *) echo "  neočakávaný kód"; chyba=1 ;;
    esac
  done
  return $chyba
}

echo "── Kokpit: celý reťazec ────────────────────────────────"
krok "typy"        bunx tsc --noEmit -p tsconfig.json
krok "hooky"       bunx eslint -c eslint.hooks.config.js src --quiet
krok "testy"       bun run test
if [ "$bez_nasadenia" = "0" ]; then
  krok "nasadenie"  ./scripts/nasad.sh
  krok "naživo"     naziveA
else
  echo "▸ nasadenie            preskočené (--bez-nasadenia)"
fi
krok "ostré dáta"  ./scripts/naostro.sh

echo "────────────────────────────────────────────────────────"
for r in "${zoznam[@]}"; do echo "  $r"; done
if [ "$zlyhalo" = "0" ]; then
  printf '%s✓ HOTOVÉ — všetko prešlo.%s  %s\n' "$zelena" "$koniec" "$adresa"
else
  printf '%s✗ NIE JE HOTOVÉ — pozri vyššie.%s  logy: %s\n' "$cervena" "$koniec" "$log"
fi
exit $zlyhalo
