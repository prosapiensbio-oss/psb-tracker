import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Zmazanie jedného klienta zo všetkých tabuliek.
//
// Vzniklo z konkrétnej diery: appka vedela dáta iba pridávať. Keď sa do nej
// omylom dostal riadok — preklep v mene pri importe, testovací záznam, klient
// zapísaný dvakrát pod dvoma zápismi mena — nedalo sa s tým spraviť nič.
// Jediná existujúca možnosť bolo vymazať VŠETKO a nahrať znova, čo je pri
// jednom zlom riadku absurdné.
//
// Zámerne sa maže podľa presného mena a zámerne to nie je v UI ako tlačidlo pri
// každom klientovi: je to oprava dát, nie bežná operácia. Zostáva po tom
// záznam v audite vrátane počtu zmazaných riadkov.
export const Route = createFileRoute("/api/client-delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { name?: string; reason?: string };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const name = String(b.name || "").trim();
        if (!name) return Response.json({ ok: false, error: "no_name" }, { status: 400 });

        const zmazane: Record<string, number> = {};
        // POZOR: `kal_udalosti` sa tu MAŽE, ale pri premenovaní sa len
        // prepisuje — je to zámer. Zmazaný klient nemá v kalendári čo hľadať
        // a inak sa vráti späť ako „po úvodnom, čaká na export“ (appka ten
        // zoznam stavia práve z kalendára). Zoznam musí rásť s appkou. Pribudli tabuľky, ktoré v pôvodnom
        // zozname neboli — vlastná evidencia balíčkov a kniha platieb (obe
        // 22. 9. 2026), poplatky, denník, merania a mapovanie z kalendára —
        // a bez nich by po „zmazanom“ klientovi zostali riadky, ktoré ho
        // z appky vrátia späť.
        //
        // 21. 10. 2026 — PENIAZE SA NEMAŽÚ, LEN RUŠIA. `platby` a `balicky`
        // sú vlastná kniha Kokpitu (banka, zošit, predaj); tvrdé DELETE by
        // z nej vymazalo skutočné peniaze bez stopy a P&L mesiaca by sa ticho
        // zmenil. Dostanú `zrusene_at` ako pri ručnom zrušení — z appky
        // zmiznú rovnako, ale dajú sa dohľadať a vrátiť. Vydané faktúry,
        // anamnéza, kartotéka fotiek (súbory v R2) a rozrobené v editore sa
        // nemažú vôbec: sú to doklady a zdravotné záznamy, nie omyl v mene.
        // Koľko ich zostalo, ide späť v `ponechane`.
        //
        // Pribudli aj tabuľky z 9.–10. 2026, ktoré klienta vrátia alebo po
        // ňom nechajú visieť platný odkaz (/v/, kalendár, ponuka termínov…).
        const MAZAT: (readonly [string, string])[] = [
          ["sessions", "client_name"],
          ["payments", "client_name"],
          ["packages", "client_name"],
          ["services", "client_name"],
          ["poplatky", "client_name"],
          ["client_notes", "client_name"],
          ["klient_merania", "klient"],
          ["kal_mapovanie", "klient"],
          ["kal_udalosti", "klient"],
          ["kal_zmeny", "klient"],
          ["platba_mapovanie", "klient"],
          ["leads", "name"],
          ["client_overrides", "name"],
          ["trening_druh", "klient"],
          ["treningy_zdarma", "client_name"],
          ["doplnenia_hodiny", "klient"],
          ["balicky_presun", "klient"],
          ["ptminder_historia", "klient"],
          ["ptminder_klienti", "meno"],
          ["klient_odkazy", "klient"],
          ["uvodne_odkazy", "klient"],
          ["fotky_odkazy", "klient"],
          ["fotky_odpovede", "klient"],
          ["dotaznik_odkazy", "klient"],
          ["klient_kalendar", "klient"],
          ["ponuky_terminov", "klient"],
          ["klient_fakturacia", "klient"],
          ["klient_odberatelia", "klient"],
        ];
        const ZRUSIT: (readonly [string, string])[] = [
          ["platby", "klient"],
          ["balicky", "klient"],
        ];
        const PONECHAT: (readonly [string, string])[] = [
          ["vydane_faktury", "klient"],
          ["vydane_faktury_polozky", "klient"],
          ["anamnezy", "klient"],
          ["klient_fotky", "klient"],
          // Poznámky k foteniu patria k fotkám — fotky ostávajú, tak aj ony.
          ["klient_fotky_poznamky", "klient"],
          ["editor_navrhy", "klient"],
        ];

        // Fakturačný kontakt firmy nesie zoznam mien („A, B“) — meno sa
        // z neho vyberie, kontakt firmy ostáva pre ostatných.
        const kontaktyR = await DB.prepare("SELECT id, klient FROM fakturacne_kontakty WHERE klient LIKE ?1")
          .bind(`%${name}%`).all<{ id: string; klient: string }>().catch((e: unknown) => String(e));
        if (typeof kontaktyR === "string") {
          return Response.json({
            ok: false, tabulka: "fakturacne_kontakty",
            error: `Zmazanie neprebehlo, nezmenilo sa nič — zlyhala tabuľka fakturacne_kontakty: ${kontaktyR.slice(0, 300)}`,
          }, { status: 500 });
        }
        const kontakty = (kontaktyR.results || [])
          .map((k) => ({ id: k.id, zoznam: String(k.klient || "").split(",").map((x) => x.trim()).filter(Boolean) }))
          .filter((k) => k.zoznam.includes(name));

        const teraz = new Date().toISOString();
        const prikazy = [
          ...MAZAT.map(([t, c]) => DB.prepare(`DELETE FROM ${t} WHERE ${c} = ?1`).bind(name)),
          ...ZRUSIT.map(([t, c]) => DB.prepare(`UPDATE ${t} SET zrusene_at = ?2 WHERE ${c} = ?1 AND zrusene_at IS NULL`).bind(name, teraz)),
          ...kontakty.map((k) => DB.prepare("UPDATE fakturacne_kontakty SET klient = ?2 WHERE id = ?1")
            .bind(k.id, k.zoznam.filter((x) => x !== name).join(", "))),
        ];

        /**
         * JEDNA DÁVKA, A CHYBA SA HLÁSI (21. 10. 2026).
         *
         * Predtým každá tabuľka zvlášť a `catch { zmazane[t] = 0 }`: keď
         * jedno DELETE zlyhalo, odpoveď bola `ok: true` s nulou — klient
         * zostal napoly zmazaný a nikto to nevedel. Teraz je to jedna
         * transakcia (všetko alebo nič) a pri chybe sa bez zápisu zistí,
         * ktorá tabuľka ju spôsobila.
         */
        try {
          const vysledky = await DB.batch(prikazy);
          MAZAT.forEach(([t], i) => { zmazane[t] = vysledky[i]?.meta?.changes ?? 0; });
          ZRUSIT.forEach(([t], i) => { zmazane[`${t} (zrušené)`] = vysledky[MAZAT.length + i]?.meta?.changes ?? 0; });
          if (kontakty.length) zmazane["fakturacne_kontakty (meno zo zoznamu)"] = kontakty.length;
        } catch (e) {
          let tabulka = "";
          for (const [t, c] of [...MAZAT, ...ZRUSIT]) {
            const ok = await DB.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${c} = ?1`).bind(name).first().then(() => true, () => false);
            if (!ok) { tabulka = t; break; }
          }
          return Response.json({
            ok: false,
            error: `Zmazanie neprebehlo, nezmenilo sa nič${tabulka ? ` — zlyhala tabuľka ${tabulka}` : ""}: ${String(e).slice(0, 300)}`,
            tabulka: tabulka || null,
          }, { status: 500 });
        }

        const ponechane: Record<string, number> = {};
        for (const [t, c] of PONECHAT) {
          const r = await DB.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${c} = ?1`).bind(name).first<{ n: number }>().catch(() => null);
          if (r?.n) ponechane[t] = r.n;
        }

        await audit(DB, {
          action: "zmazanie-klienta",
          predmet: name,
          neu: Object.entries(zmazane).map(([t, n]) => `${t}: ${n}`).join(", ")
            + (Object.keys(ponechane).length ? ` · ponechané: ${Object.entries(ponechane).map(([t, n]) => `${t}: ${n}`).join(", ")}` : ""),
          reason: b.reason ? String(b.reason).slice(0, 300) : undefined,
          actor: await currentUser(request) || undefined,
        });
        return Response.json({ ok: true, zmazane, ponechane });
      },
    },
  },
});
