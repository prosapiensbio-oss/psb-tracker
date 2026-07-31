// Marketing — skeleton. The numbers below are a one-off extract from Jerry's
// Metricool exports (18 months, jan 2025 – jún 2026: 40 posts, 74 reels, 994
// stories), so the screen has something real to show before the importer exists.
// They get replaced by an upload the same way PTminder reports are.
//
// What this module deliberately does NOT claim: Instagram cannot say who became
// a client. Reach and views are inputs; the only honest bridge to money is the
// enquiry funnel plus the "odkiaľ prišiel" field, which is why the conversion
// card reads from PTminder and the funnel, never from these figures.

export type MktMesiac = {
  m: string;
  reels: number;
  posty: number;
  stories: number;
  views: number;
  dosah: number;
  ulozenia: number;
  zdielania: number;
  spend: number;
  viewRate: number;
};

export type MktKus = { m: string; typ: "reel" | "post"; hook: string; views: number; ulozenia: number; viewRate: number };

export const MKT_MESACNE: MktMesiac[] = [
  { m: "2025-01", reels: 3, posty: 1, stories: 16, views: 3430, dosah: 3178, ulozenia: 9, zdielania: 5, spend: 700, viewRate: 34.4 },
  { m: "2025-02", reels: 2, posty: 2, stories: 66, views: 3815, dosah: 7004, ulozenia: 6, zdielania: 2, spend: 400, viewRate: 38.0 },
  { m: "2025-03", reels: 4, posty: 1, stories: 85, views: 3670, dosah: 7553, ulozenia: 9, zdielania: 5, spend: 300, viewRate: 37.0 },
  { m: "2025-04", reels: 1, posty: 3, stories: 50, views: 4229, dosah: 5739, ulozenia: 6, zdielania: 6, spend: 0, viewRate: 49.7 },
  { m: "2025-05", reels: 3, posty: 1, stories: 61, views: 3710, dosah: 6243, ulozenia: 11, zdielania: 7, spend: 400, viewRate: 40.7 },
  { m: "2025-06", reels: 2, posty: 3, stories: 75, views: 5193, dosah: 6196, ulozenia: 13, zdielania: 7, spend: 0, viewRate: 36.0 },
  { m: "2025-07", reels: 1, posty: 3, stories: 68, views: 4119, dosah: 5787, ulozenia: 3, zdielania: 4, spend: 0, viewRate: 36.4 },
  { m: "2025-08", reels: 4, posty: 2, stories: 61, views: 5221, dosah: 5323, ulozenia: 19, zdielania: 10, spend: 780, viewRate: 36.0 },
  { m: "2025-09", reels: 7, posty: 2, stories: 58, views: 7356, dosah: 6360, ulozenia: 17, zdielania: 5, spend: 919, viewRate: 34.2 },
  { m: "2025-10", reels: 4, posty: 2, stories: 60, views: 5065, dosah: 6045, ulozenia: 13, zdielania: 6, spend: 799, viewRate: 32.8 },
  { m: "2025-11", reels: 5, posty: 1, stories: 46, views: 4183, dosah: 5327, ulozenia: 11, zdielania: 6, spend: 0, viewRate: 34.5 },
  { m: "2025-12", reels: 5, posty: 2, stories: 35, views: 6070, dosah: 5113, ulozenia: 15, zdielania: 8, spend: 0, viewRate: 46.6 },
  { m: "2026-01", reels: 6, posty: 2, stories: 35, views: 6125, dosah: 5483, ulozenia: 14, zdielania: 9, spend: 1599, viewRate: 38.2 },
  { m: "2026-02", reels: 5, posty: 3, stories: 34, views: 6038, dosah: 6004, ulozenia: 18, zdielania: 18, spend: 2794, viewRate: 36.0 },
  { m: "2026-03", reels: 5, posty: 2, stories: 45, views: 4214, dosah: 5071, ulozenia: 16, zdielania: 5, spend: 2298, viewRate: 32.1 },
  { m: "2026-04", reels: 7, posty: 3, stories: 72, views: 7500, dosah: 9520, ulozenia: 14, zdielania: 34, spend: 2599, viewRate: 38.5 },
  { m: "2026-05", reels: 4, posty: 3, stories: 66, views: 4994, dosah: 5969, ulozenia: 20, zdielania: 11, spend: 1895, viewRate: 35.6 },
  { m: "2026-06", reels: 6, posty: 4, stories: 61, views: 5233, dosah: 6686, ulozenia: 16, zdielania: 7, spend: 2696, viewRate: 33.9 },
];

export const MKT_TOP: MktKus[] = [
  { m: "2026-05", typ: "post", hook: "Když se řekne bránice, většina lidí si představí nádech a výdech. Sval, který se pohybuje ", views: 689, ulozenia: 9, viewRate: 0 },
  { m: "2025-05", typ: "reel", hook: "Jarek je s námi od úplného začátku. Přišel ve chvíli, kdy už vyzkoušel všechno – silový tr", views: 1251, ulozenia: 8, viewRate: 50.7 },
  { m: "2025-06", typ: "post", hook: "💡 STRES a TVOJE DRŽENÍ TĚLA – VÍC SOUVISÍ, NEŽ SI MYSLÍŠ!", views: 1154, ulozenia: 6, viewRate: 0 },
  { m: "2025-08", typ: "reel", hook: "🌀 Nestačí jen protáhnout", views: 560, ulozenia: 5, viewRate: 25.9 },
  { m: "2025-12", typ: "reel", hook: "Jsme @prosapiens.biomechanic", views: 881, ulozenia: 5, viewRate: 46.2 },
  { m: "2026-02", typ: "reel", hook: "Nepřišel proto, že by chtěl víc svalů nebo lepší výkon.", views: 1065, ulozenia: 5, viewRate: 43.8 },
  { m: "2026-05", typ: "reel", hook: "Prkno. Sklapovačky. Plank s hodinami odcvičenými za život.", views: 1029, ulozenia: 5, viewRate: 40.0 },
  { m: "2025-08", typ: "post", hook: "🔥 Táhne tě mezi lopatkami?", views: 1319, ulozenia: 5, viewRate: 0 },
];

export const mktSum = (k: keyof MktMesiac) =>
  MKT_MESACNE.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
