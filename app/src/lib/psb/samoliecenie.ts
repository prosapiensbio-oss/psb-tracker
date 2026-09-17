// Samoliečenie zaseknutého PWA shellu.
//
// PREČO: nasadenie vymení hashované assety (index-<hash>.js) a staré zmaže.
// iOS si pri PWA na ploche drží STARÝ index.html, ktorý žiada starý hash →
// 404 → nespustí sa žiadny JS → BIELA OBRAZOVKA. Appka sa ani nenaštartuje,
// takže pás „nová verzia“ (a jeho cache-busting Aktualizovať) sa nemá ako
// ukázať. 11. 9. 2026: v Safari fungovalo, v PWA biela obrazovka — presne toto.
//
// AKO: platforma servíruje existujúce assety sama; na worker padnú len
// CHÝBAJÚCE (`not_found_handling: "none"`). Chýbajúci *.js preto nevraciame
// ako 404, ale ako 200 + maličký skript, ktorý appku presmeruje na čerstvú
// URL (`?v=čas`). Shell je `no-cache`, takže sa stiahne nový index.html s
// novým hashom a appka ožije. Musí to byť 200 — 404-ový module script sa
// nevykoná.
//
// POISTKA PROTI SLUČKE: po presmerovaní už nový shell žiada existujúci hash,
// takže sem nepríde. Keby predsa (uprostred nasadenia), sessionStorage povolí
// jeden reload za minútu a potom radšej ostane ticho než točiť.

export function samoliecenieAssetu(pathname: string): Response | null {
  if (!pathname.startsWith("/assets/") || !pathname.endsWith(".js")) return null;
  const js = [
    "(function(){",
    "try{",
    "var k='kokpit-samoliecenie',t=Date.now(),p=Number(sessionStorage.getItem(k)||0);",
    "if(t-p<60000)return;",
    "sessionStorage.setItem(k,String(t));",
    "var u=new URL(location.href);u.searchParams.set('v',String(t));",
    "location.replace(u.toString());",
    "}catch(e){location.reload();}",
    "})();",
  ].join("");
  return new Response(js, {
    status: 200,
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
      "x-kokpit-samoliecenie": "1",
    },
  });
}
