// Service worker Kokpitu — jediná úloha: ukázať notifikáciu, keď príde push.
//
// ZÁMERNE NEKEŠUJE. Kokpit je celý o živých číslach; offline kópia by
// ukazovala včerajšie tržby a tvárila sa ako dnešok. To je horšie než hláška
// „nie si online". Keby raz keš pribudla, dáta z /api/ do nej nesmú.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = { titulok: "Kokpit", text: "", url: "/", znacka: "kokpit" };
  try { d = { ...d, ...(e.data ? e.data.json() : {}) }; }
  catch { d.text = e.data ? e.data.text() : ""; }

  e.waitUntil(self.registration.showNotification(d.titulok, {
    body: d.text,
    icon: "/ikona-192.png",
    badge: "/ikona-192.png",
    // Rovnaká značka = nová notifikácia NAHRADÍ starú. Bez toho by sa pri
    // každom behu plánovača nakopili na zamknutej obrazovke rovnaké riadky
    // a človek by ich prestal čítať — presne to, čomu sa register bráni.
    tag: d.znacka,
    renotify: true,
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ciel = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const okna = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Keď je Kokpit už otvorený, len ho vytiahni dopredu a prepni — otvárať
    // druhé okno tej istej appky je na telefóne mätúce.
    for (const w of okna) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ("navigate" in w) { try { await w.navigate(ciel); } catch { /* focus stačí */ } }
        return;
      }
    }
    await self.clients.openWindow(ciel);
  })());
});
