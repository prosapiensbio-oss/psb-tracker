/**
 * ŠABLÓNY SMS S ODKAZOM — anamnéza, fotky, kalendár, hromadná správa.
 *
 * 13. — 25. 10. 2026 odišli všetky SMS s odkazom na anamnézu (3/3), fotky (2/2),
 * kalendár (1/1) a ponuku termínov (5/5) ako DVE správy. Jediný mäkčeň alebo
 * dlhá pomlčka prepne správu do UCS-2 a limit padne zo 160 znakov na 70, takže
 * sa neplatilo za dĺžku, ale za diakritiku v šablóne.
 *
 * Text bez diakritiky je zámer, nie lenivosť (rovnako `textSms` a úvodná SMS).
 * `smsSablony.test.ts` meria každú šablónu cez `dlzkaSpravy` so skutočnou dĺžkou
 * odkazu — keď niekto text predĺži nad jednu správu, test spadne.
 */
import { oslovenieKlienta } from "./oslovenie";
import { bezDiakritiky } from "./sms";

/** „Kateřina" → „Katerino". 5. pád a bez diakritiky — jedno miesto pre všetky SMS. */
export const oslovenieDoSms = (meno: string): string => bezDiakritiky(oslovenieKlienta(meno));

/** „Ahoj Katerino," — bez známeho mena len „Ahoj,". Klientom sa tyká (Jerry, 1. 11. 2026). */
const ahoj = (meno: string): string => {
  const o = oslovenieDoSms(meno);
  return `Ahoj${o ? ` ${o}` : ""},`;
};

/** Anamnéza. Kto už bol na tréningu, nedostane vetu „pred úvodní lekci". */
export function textSmsAnamnezy(url: string, uzBol: boolean, meno = ""): string {
  return bezDiakritiky(uzBol
    ? `${ahoj(meno)} prosime te jeste o kratky dotaznik k treninku: ${url} Diky, ProSapiens Biomechanic`
    : `${ahoj(meno)} pred uvodni lekci te prosime o kratky dotaznik: ${url} Diky, ProSapiens Biomechanic`);
}

/**
 * Pred úvodným — Dashboard, Kalendár aj skúšobná dávka berú to isté znenie.
 * Stav (termín, cena) nesie stránka za odkazom, nie správa.
 */
export const textSmsPredUvodnym = (meno: string, url: string): string =>
  bezDiakritiky(`${ahoj(meno)} vitej v ProSapiens Biomechanic. Termin, adresu i co si vzit k uvodni lekci najdes tady: ${url}`);

/**
 * Po úvodnom. `co` je výpočet toho, čo stránka naozaj ukáže — termín a fotky sa
 * menujú, len keď tam sú. S fotkami „cteni" namiesto „doporucene cteni": s dlhším
 * oslovením by ten variant prerástol do dvoch správ.
 */
export function textSmsPoUvodnom(meno: string, url: string, co: { termin?: boolean; fotky?: boolean } = { termin: true }): string {
  const zoznam = [co.termin ? "termin dalsiho treninku" : "", co.fotky ? "fotky pred a po" : "", "souhrn"].filter(Boolean).join(", ");
  return bezDiakritiky(`${ahoj(meno)} diky za uvodni lekci. ${zoznam.charAt(0).toUpperCase()}${zoznam.slice(1)} i ${co.fotky ? "" : "doporucene "}cteni najdes tady: ${url}`);
}

/** Kalendár v mobile. Klient bez mena dostane vetu bez oslovenia. */
export function textSmsKalendara(meno: string, url: string, podpis: string): string {
  return bezDiakritiky(`${ahoj(meno)} treninky si muzes dat do kalendare v mobilu - pripomene ti je sam: ${url} ${podpis}`).trim();
}

/** Odkaz s fotkami. */
export function textSmsFotiek(meno: string, url: string, podpis: string): string {
  return bezDiakritiky(`${ahoj(meno)} posilam ti srovnani tvych fotek: ${url}${podpis ? ` ${podpis}` : ""}`);
}

/** Hromadná správa: `{meno}` je krstné meno v 5. páde bez diakritiky. */
export const zlozHromadnuSms = (text: string, meno: string): string =>
  text.replace(/\{meno\}/gi, oslovenieDoSms(meno));

/** Zmluva 6M na podpis (10. 11. 2026) — odkaz na /z/, zvyšok nesie stránka. */
export const textSmsZmluvy = (meno: string, url: string): string =>
  bezDiakritiky(`${ahoj(meno)} posilam ti k podpisu podminky 6M spoluprace. Pravidla si odklikni a podepis se prstem: ${url} Diky, Jerry`);
