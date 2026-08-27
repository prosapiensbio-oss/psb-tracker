/**
 * Prompt na obrázok do titulky.
 *
 * PREČO PROMPT A NIE VOLANIE API
 *
 * Odhováral som od generovania a Jerry na tom trval, takže to tu je — ale nie
 * ako „appka nakreslí titulku". Tam by sa vrátil presne ten problém, kvôli
 * ktorému sme titulku Higgsfieldu nedali: o mesiac ten istý prompt dá inú
 * hrúbku a iné okraje. Toto je obrázok pre rodinu Fotka, keď zrovna nie je čo
 * odfotiť.
 *
 * ČO DRŽÍ ŠTÝL
 *
 * PEVNÁ ČASŤ PROMPTU, nie model. Paleta, zoznam áno/nie, pomer strán a zákaz
 * textu sú vždy tie isté; mení sa len jedna veta o téme. Preto sa prompt
 * skladá tu a nie v hlave — ručne písaný je zakaždým trochu iný, a v tom je
 * celý rozdiel medzi identitou a náhodou.
 *
 * PREČO PLOCHÝ VEKTOR A NIE FOTKA
 *
 * Prvá verzia tu mala „muted duotone photography" a „restrained studio
 * scenes" — a Higgsfield z toho poslušne vyrobil fotoreálne štúdio s tabuľami,
 * monitormi a modelmi kolena. Do titulky, ktorá stojí na sadzbe, sa taký obraz
 * nezmestí: bije sa s nadpisom a je prepchatý (Jerry, 25. 8.). Navyše to bolo
 * proti Jerryho vlastným vizuálnym pravidlám, kde je fotografický realizmus
 * v zozname NIE. Teraz je celý prompt postavený na opaku — plochá vektorová
 * kresba, jeden motív, najviac tri prvky a väčšina plátna prázdna.
 *
 * PREČO ZÁKAZ TEXTU
 *
 * Titulku sádže appka. Keby model do obrázka napísal písmená, prekryli by sa
 * s nadpisom a ešte by boli s chybami v diakritike — to je to isté, na čom
 * generovanie titulky padlo hneď na začiatku.
 */

import { PALETA, type Rezim } from "./titulka";

/** Kam v obrázku nesmie prísť nič dôležité — tam sadá nadpis. */
const MIESTO_NA_TEXT: Record<Rezim, string> = {
  svetly: "Keep the upper half calm and uncluttered — headline type will be set over it.",
  tmavy: "Keep the upper half calm and uncluttered — light headline type will be set over it.",
};

const PEVNA_CAST = [
  "FLAT VECTOR ILLUSTRATION. Not a photograph. Not a 3D render. Not a mockup.",
  "Vertical 9:16, 1080x1920.",
  "ProSapiens Biomechanic — a biomechanics studio in Brno. Clinical, editorial, like a figure from a scientific paper.",
  `Use ONLY these flat colours, no others: deep green ${PALETA.tmavaZelena}, accent green ${PALETA.akcent}, mid green ${PALETA.stredna}, grey green ${PALETA.sivaZelena}, pale green ${PALETA.svetlaZelena}, off-white ${PALETA.velmiSvetla}, white ${PALETA.biela}, muted green ${PALETA.mutedZelena}.`,
  "Line work: thin, even weight throughout. Flat colour fills only.",
  // „a person in movement", nie „human bodies": Workers AI to druhé označil za
  // nevhodný obsah (chyba 8007), hoci ide o biomechaniku. Overené 25. 8. 2026.
  "YES: a person in movement drawn as a thin-line anatomical silhouette, schematic diagrams of movement, an axis with an arc, a segmented column, a simple chain of nodes.",
  "ONE subject. At most three elements on the whole canvas. Most of the canvas is empty.",
  "NO TEXT, NO LETTERS, NO NUMBERS, NO WATERMARKS, NO LOGOS.",
  "NO photography, NO realism, NO studio scenes, NO equipment, NO screens, NO furniture, NO people's faces.",
  "NO shading, NO shadows, NO gradients, NO textures, NO depth, NO perspective, NO lighting effects.",
  "NO icons, NO clipart, NO emoji, NO infographic clutter, NO fitness-influencer aesthetics.",
];

/**
 * Zloží prompt.
 *
 * Téma sa berie z toho, čo o príspevku vieme — najprv nadpis (to je tá jedna
 * veta, ktorá bude na titulke), potom koncept. Vymýšľať k tomu nič netreba.
 */
export function promptObrazka(v: { nadpis: string; koncept: string; rezim: Rezim; skladba?: string }): string {
  const tema = (v.nadpis || v.koncept || "").replace(/\*/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  return [
    tema ? `Subject: an image for a post about — ${tema}` : "Subject: a person in a considered, neutral posture.",
    ...PEVNA_CAST,
    // Skladba, kde je obraz vidieť LEN cez písmená, potrebuje kresbu po celej
    // ploche. Bledé pole s jedným tmavým objektom sa v písmenách rozpadne na
    // svetlé a tmavé kusy a nadpis prestane byť čitateľný — overené 25. 8.
    v.skladba === "vPismenach"
      ? "Even texture and tone across the whole frame — the image will be visible only through letterforms, so large empty areas break it."
      : MIESTO_NA_TEXT[v.rezim],
  ].join("\n");
}

/** Adresa, kde sa to generuje. Odkaz je len skratka, prompt je to podstatné. */
export const HIGGSFIELD = "https://higgsfield.ai";
