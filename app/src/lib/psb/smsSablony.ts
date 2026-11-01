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

/** Anamnéza. Kto už bol na tréningu, nedostane vetu „pred úvodní lekci". */
export function textSmsAnamnezy(url: string, uzBol: boolean): string {
  return bezDiakritiky(uzBol
    ? `Dobry den, prosime Vas jeste o kratky dotaznik k treninku: ${url} Dekujeme, ProSapiens Biomechanic`
    : `Dobry den, pred uvodni lekci Vas prosime o kratky dotaznik: ${url} Dekujeme, ProSapiens Biomechanic`);
}

/** Kalendár v mobile. Klient bez mena dostane vetu bez oslovenia. */
export function textSmsKalendara(meno: string, url: string, podpis: string): string {
  const o = oslovenieDoSms(meno);
  return bezDiakritiky(`${o ? `${o}, v` : "V"}ase treninky si muzete dat do kalendare v mobilu - pripomene vam je sam: ${url} ${podpis}`).trim();
}

/** Odkaz s fotkami. */
export function textSmsFotiek(meno: string, url: string, podpis: string): string {
  const o = oslovenieDoSms(meno);
  return bezDiakritiky(`Ahoj${o ? ` ${o}` : ""}, posilam ti srovnani tvych fotek: ${url}${podpis ? ` ${podpis}` : ""}`);
}

/** Hromadná správa: `{meno}` je krstné meno v 5. páde bez diakritiky. */
export const zlozHromadnuSms = (text: string, meno: string): string =>
  text.replace(/\{meno\}/gi, oslovenieDoSms(meno));
