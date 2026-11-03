/**
 * KONKURENTI NA INSTAGRAME (presunuté zo Strižne, Jerry 3. 11. 2026): Kokpit
 * vyhodnocuje, Strižňa vyrába. Vidia sa len účty pridané v Metricoole medzi
 * konkurentov. Metricool o nich nedáva zhliadnutia ani dosah, len lajky,
 * komentáre, interakcie a engagement, preto sa radí podľa interakcií.
 */
export type UcetKonkurenta = { ucet: string; meno: string; sledovatelia: number | null; engagement: number | null; prispevky: number; reels: number };
export type PrispevokKonkurenta = { ucet: string; datum: string; typ: string; text: string; lajky: number; komentare: number; interakcie: number; engagement: number | null; url: string };
export type VzoryKonkurentov = { vzory: { vzor: string; priklad: string; preco: string }[]; prePsb: string[] };
export type Konkurenti = { nacitane: string; od: string; do: string; ucty: UcetKonkurenta[]; prispevky: PrispevokKonkurenta[]; vzory: VzoryKonkurentov | null };

export const KLUC_KONKURENTOV = "mkt_konkurenti";
/** Do jedného riadku nastavení: D1 má strop ~1 MB na hodnotu. */
const MAX_PRISPEVKOV = 200;
const MAX_TEXTU = 600;

const cisloAleboNull = (x: unknown) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
const cislo = (x: unknown) => cisloAleboNull(x) ?? 0;

export function uctyKonkurentov(riadky: Record<string, unknown>[]): UcetKonkurenta[] {
  return riadky.map((r) => ({
    ucet: String(r.screenName ?? ""), meno: String(r.displayName ?? ""), sledovatelia: cisloAleboNull(r.followers),
    engagement: cisloAleboNull(r.engagement), prispevky: cislo(r.posts), reels: cislo(r.reels),
  })).filter((u) => u.ucet);
}

/**
 * Publikácie nesú `blogId` konkurenta (číslo z jeho riadku), nie meno účtu. Riadok
 * bez odkazu aj textu sa zahodí; najviac interakcií ide hore.
 */
export function prispevkyKonkurentov(publikacie: Record<string, unknown>[], ucty: Record<string, unknown>[]): PrispevokKonkurenta[] {
  const menoPodlaId = new Map(ucty.map((u) => [String(u.id), String(u.screenName ?? "")]));
  return publikacie
    .map((p) => ({
      ucet: menoPodlaId.get(String(p.blogId)) ?? "",
      datum: String(p.created ?? "").slice(0, 10),
      typ: String(p.type ?? ""),
      text: String(p.content ?? "").trim().slice(0, MAX_TEXTU),
      lajky: cislo(p.likes), komentare: cislo(p.comments), interakcie: cislo(p.interactions),
      engagement: cisloAleboNull(p.engagement),
      url: /^https?:\/\//.test(String(p.url ?? "")) ? String(p.url) : "",
    }))
    .filter((p) => p.text || p.url)
    .sort((a, b) => b.interakcie - a.interakcie)
    .slice(0, MAX_PRISPEVKOV);
}

export function zadanieVzorov(prispevky: PrispevokKonkurenta[]): string {
  const riadky = prispevky.slice(0, 40).map((p, i) => `${i + 1}. @${p.ucet} · ${p.interakcie} interakcií\n${p.text.slice(0, 400)}`).join("\n\n");
  return `Toto sú popisy príspevkov konkurentov štúdia ProSapiens Biomechanic na Instagrame, od najviac interakcií. Prečítaj ich a odpovedz PO SLOVENSKY IBA platným JSON bez \`\`\`:
{"vzory":[{"vzor":"opakujúci sa vzor v popisoch (štruktúra, prvý riadok, dĺžka, tón, výzva, hashtagy)","priklad":"krátky doslovný úryvok do 12 slov","preco":"prečo to môže fungovať"}],"prePsb":["konkrétny nápad pre popisy PSB: forma, nie cudzí obsah; žiadne kopírovanie techník ani loga Functional Patterns"]}
3 až 6 vzorov a 2 až 4 nápady, každá hodnota krátka, jedna veta. V hodnotách nepoužívaj rovné úvodzovky, rozbili by JSON. Nič si nevymýšľaj, len z toho, čo je v textoch. Keď je príspevkov málo, povedz menej.

${riadky}`;
}

export function vzoryZOdpovede(text: string): VzoryKonkurentov | null {
  const od = text.indexOf("{");
  const po = text.lastIndexOf("}");
  if (od < 0 || po <= od) return null;
  try {
    const o = JSON.parse(text.slice(od, po + 1)) as { vzory?: unknown; prePsb?: unknown };
    const vzory = (Array.isArray(o.vzory) ? o.vzory : []).map((v) => {
      const x = (v ?? {}) as Record<string, unknown>;
      return { vzor: String(x.vzor ?? "").trim(), priklad: String(x.priklad ?? "").trim(), preco: String(x.preco ?? "").trim() };
    }).filter((v) => v.vzor);
    const prePsb = (Array.isArray(o.prePsb) ? o.prePsb : []).map((x) => String(x ?? "").trim()).filter(Boolean);
    return vzory.length || prePsb.length ? { vzory, prePsb } : null;
  } catch {
    return null;
  }
}
