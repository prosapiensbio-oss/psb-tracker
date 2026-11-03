import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { SKRYTE, TAJNE_KLUCE, hodnotaDoAuditu, jeTajnyKluc, maskujAuditRiadok, rozdelNastavenia } from "./tajneKluce";

const KOREN = new URL("../../../", import.meta.url).pathname;
const zdroj = (p: string) => readFileSync(`${KOREN}${p}`, "utf8");

describe("zoznam tajných kľúčov", () => {
  it("pozná všetky prístupy, čo v databáze reálne ležia", () => {
    for (const k of ["mail_heslo", "vapid_private", "meta_token", "meta_capi_token", "mailer_token", "metricool_token", "metricool_api_token",
      "metricool_klient", "metricool_pkce", "gads_dev_token", "psi_api_key", "web_lead_secret", "google_sa", "sms_kluc"]) {
      expect(jeTajnyKluc(k)).toBe(true);
    }
  });

  it("nové tajomstvo chytí podľa mena, aj keď sa do zoznamu zabudne", () => {
    expect(jeTajnyKluc("fakturoid_token")).toBe(true);
    expect(jeTajnyKluc("novy_api_key")).toBe(true);
  });

  it("nesiahne na to, čo prehliadač potrebuje", () => {
    for (const k of ["vapid_public", "ciele", "kpi_targets", "cennik", "mkt_znacky", "stav_penazi", "fio_zostatok", "salary_personal",
      "pnl_overrides", "pohyb_splits", "barter_jarek", "btc_parovanie", "mail_host", "mail_user", "mail_od", "mail_ignoruj",
      "meta_pixel_id", "meta_ad_account", "gads_manager", "sms_brana", "sms_odosielatel", "google_ga4_property"]) {
      expect(jeTajnyKluc(k)).toBe(false);
    }
  });

  it("meno klienta v predmete auditu tajomstvo nie je", () => {
    expect(jeTajnyKluc("Jana Tokenová")).toBe(false);
    expect(jeTajnyKluc(null)).toBe(false);
  });

  it("každý kľúč zo zoznamu spĺňa formát, ktorý POST pustí", () => {
    for (const k of TAJNE_KLUCE) expect(/^[a-z0-9_]+$/.test(k)).toBe(true);
  });
});

describe("GET /api/vzas-settings", () => {
  const riadky = [
    { key: "mail_heslo", value: JSON.stringify("tajne-heslo-123") },
    { key: "sms_kluc", value: JSON.stringify("") },
    { key: "ciele", value: JSON.stringify([{ id: "c1" }]) },
    { key: "vapid_public", value: JSON.stringify("verejny") },
    { key: "rozbity", value: "{nie json" },
  ];
  const v = rozdelNastavenia(riadky);

  it("hodnota tajomstva v odpovedi nie je nikde", () => {
    expect(JSON.stringify(v)).not.toContain("tajne-heslo-123");
    expect(v.settings.mail_heslo).toBeUndefined();
  });

  it("tajomstvo je len áno/nie; prázdne a chýbajúce = nie", () => {
    expect(v.nastavene.mail_heslo).toBe(true);
    expect(v.nastavene.sms_kluc).toBe(false);
    expect(v.nastavene.meta_token).toBe(false);
  });

  it("netajné ostávajú presne ako boli, vrátane holého reťazca", () => {
    expect(v.settings.ciele).toEqual([{ id: "c1" }]);
    expect(v.settings.vapid_public).toBe("verejny");
    expect(v.settings.rozbity).toBe("{nie json");
  });
});

describe("audit", () => {
  it("tajný predmet: hodnota preč, prázdne ostáva prázdne", () => {
    expect(hodnotaDoAuditu("mail_heslo", "x")).toBe(SKRYTE);
    expect(hodnotaDoAuditu("mail_heslo", null)).toBeNull();
    expect(hodnotaDoAuditu("ciele", "x")).toBe("x");
  });

  it("riadok z databázy pred odoslaním von", () => {
    const r = maskujAuditRiadok({ payment_id: "web_lead_secret", old_value: "a", new_value: "b", actor: "Jerry" });
    expect(r).toEqual({ payment_id: "web_lead_secret", old_value: SKRYTE, new_value: SKRYTE, actor: "Jerry" });
    const n = { payment_id: "Jana Nováková", old_value: "a", new_value: "b" };
    expect(maskujAuditRiadok(n)).toBe(n);
  });
});

/**
 * Stráž proti návratu: tajomstvá von z týchto ciest nesmú ísť ani po úprave.
 * Správanie funkcií testujú bloky vyššie; tu sa kontroluje, že ich trasy naozaj volajú.
 */
describe("trasy používajú jeden zoznam", () => {
  it("GET nastavení ide cez rozdelNastavenia", () => {
    expect(zdroj("src/routes/api/vzas-settings.ts")).toContain("rozdelNastavenia(");
  });
  it("audit skrýva sám, pri každom volaní", () => {
    expect(zdroj("src/lib/psb/audit.server.ts")).toContain("hodnotaDoAuditu(z.predmet, z.neu)");
  });
  it("zoznam auditu a záloha maskujú", () => {
    expect(zdroj("src/routes/api/periods.ts")).toContain("maskujAuditRiadok");
    expect(zdroj("src/routes/api/export.ts")).toContain("jeTajnyKluc");
    expect(zdroj("src/routes/api/export.ts")).toContain("pass_hash");
  });
  it("migrácia auditu pozná presne ten istý zoznam", () => {
    const sql = zdroj("migrations/0131_audit_skry_tajomstva.sql");
    // Kľúč pridaný po tej migrácii sa cez `nastavenie` nikdy nezapisoval; v audite nič čitateľné nemá.
    const novsie = new Set<string>(["metricool_api_token"]);
    for (const k of TAJNE_KLUCE) if (!novsie.has(k)) expect(sql).toContain(`'${k}'`);
  });
  it("prehliadač tajný kľúč zo `settings` nečíta", () => {
    for (const f of ["App", "Udaje", "Dashboard", "Zapis", "Assistant", "DashGrafy", "Marketing", "PeniazePrehlad", "Vzas"]) {
      const s = zdroj(`src/components/psb/${f}.tsx`);
      for (const m of s.matchAll(/\b(?:s|st|n|nastavenia)\[["']([a-z0-9_]+)["']\]/g)) expect(jeTajnyKluc(m[1])).toBe(false);
    }
  });
});
