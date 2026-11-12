import { posunDen, terazPraha } from "./cas";

/**
 * KEDY SA ČÍTA SCHRÁNKA.
 *
 * Plánovač búcha na `/api/mail-dopyty?cron=1` každé tri hodiny (`0 *\/3 * * *`,
 * v UTC). Dopyt mailom príde párkrát za mesiac, takže časté prihlasovanie kupuje
 * len niekoľko hodín rýchlejšiu odpoveď — a platí sa zaň. 28. 9. 2026 nás
 * Websupport prestal púšťať na IMAP aj SMTP (webmail pritom heslo bral) a séria
 * neúspešných prihlásení taký zámok len predlžuje.
 *
 * Jerry v ten deň: „kľudne nech mail číta každý večer a ráno."
 *
 * OKNO NIE JE JEDNA HODINA, ALE ÚSEK OD ZAČIATKU PO ĎALŠIE OKNO. Hodinové okná
 * 7:00 a 20:00 sa s trojhodinovým rozvrhom v UTC stretli len raz denne: v zime
 * o 7:00 (20:00 na mriežke nie je), v lete o 20:00 (7:00 nie je). Od zmeny času
 * 25. 10. 2026 sa preto čítalo len ráno. Teraz číta PRVÝ beh od 7:00 a PRVÝ beh
 * od 20:00, nech padne kedykoľvek:
 *
 *   zima   7:00 a 22:00      (6:00 a 21:00 UTC)
 *   leto   8:00 a 20:00      (6:00 a 18:00 UTC)
 *
 * Každý úsek číta raz, zlyhanie sa v ňom neopakuje: Dovecot po sérii prihlásení
 * odmieta aj správne heslo. Ručné „Stiahnuť teraz" sa počíta tiež, zapisuje ten
 * istý `mail_stav`.
 *
 * ROZHODUJE SA TU, NIE V PLÁNOVAČI. Keby sa rozvrh písal tam, v Kokpite by nebolo
 * vidieť, prečo sa schránka číta práve takto.
 */

/**
 * Začiatky okien v pražskom čase.
 *
 * DO 12. 11. 2026 DVAKRÁT DENNE (7:00 a 20:00) — kvôli zámkom z GEO ochrany
 * schránky na Websupporte. GEO ochrana je odvtedy vypnutá a schránka je
 * karta Email vo Workspace (Jerry: „aby sa mail načítaval každé 2 až 3
 * hodiny"). Preto každé tri hodiny cez deň; v noci nie — nikto ju nečíta
 * a každé prihlásenie navyše je riziko zámku.
 */
export const OKNA_HODIN = [7, 10, 13, 16, 19, 22] as const;

/** Hodina v pražskom čase (0–23). */
export function hodinaVPrahe(kedy: Date): number {
  return Number(terazPraha(kedy).slice(11, 13));
}

/** Do ktorého okna čas patrí („2026-09-28|7"). Po polnoci je to ešte včerajší večer. */
export function oknoCitania(kedy: Date): string {
  const den = terazPraha(kedy).slice(0, 10);
  const h = hodinaVPrahe(kedy);
  const posledne = OKNA_HODIN[OKNA_HODIN.length - 1];
  if (h < OKNA_HODIN[0]) return `${posunDen(den, -1)}|${posledne}`;
  const okno = [...OKNA_HODIN].reverse().find((x) => x <= h) ?? OKNA_HODIN[0];
  return `${den}|${okno}`;
}

/**
 * Má sa teraz čítať?
 *
 * `poslednyBeh` je čas posledného pokusu (úspešného aj nie). Číta sa len vtedy,
 * keď patrí do skoršieho okna než teraz.
 */
export function jeCasCitat(kedy: Date, poslednyBeh: string | null): boolean {
  if (!poslednyBeh) return true;
  const predtym = new Date(poslednyBeh);
  if (Number.isNaN(predtym.getTime())) return true;
  return oknoCitania(kedy) !== oknoCitania(predtym);
}

/** Text pre odpoveď behu: od kedy sa bude čítať nabudúce. */
export function najblizsieOkno(kedy: Date): string {
  const h = hodinaVPrahe(kedy);
  const dalsia = OKNA_HODIN.find((x) => x > h);
  return dalsia ? `dnes od ${dalsia}:00` : `zajtra od ${OKNA_HODIN[0]}:00`;
}
