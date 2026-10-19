// Médium zo zdrojovej reklamy — čo presne sa dá prevziať a odkiaľ.
//
// PREČO TO VZNIKLO (19. 10. 2026)
//
// Reklamný agent zakladal novú reklamu tak, že zo zdrojovej reklamy prečítal
// `creative.object_story_spec` a z neho vybral `video_data.video_id` alebo
// `link_data.image_hash`. Keď bol zdrojom BOOSTNUTÝ PRÍSPEVOK, kreatíva taký
// spec nemá vôbec — Meta drží pri boostoch médium inde:
//
//   • `video_id` a `thumbnail_url` PRIAMO na kreatíve (bez object_story_spec),
//   • `effective_object_story_id` = „<stránka>_<príspevok>" ako odkaz na post,
//   • `effective_instagram_media_id` pri reels z Instagramu.
//
// Kokpit teda hlásil „Zdrojová reklama nemá stránku (asi boost príspevku)"
// a Jerry nemohol použiť video, ktoré v účte už bolo. Dvakrát: pri sade
// A2 (Regina) a pri Jarekovi.
//
// PRAVIDLO
//
// Nekopírujeme kreatívu, berieme SAMOTNÉ MÉDIUM a skladáme kreatívu novú —
// vlastný text, nadpis, odkaz, CTA aj UTM. To je rozdiel proti boostu: boost
// propaguje príspevok taký, aký je (a jeho text sa meniť nedá), tu vzniká nová
// reklama, ktorá len používa ten istý záber.
//
// Stránku (`page_id`) hľadáme v tomto poradí: spec → prefix story id → tá,
// ktorú appka používa inde (`me/accounts` podľa napojeného Instagramu). Bez
// stránky Meta kreatívu neprijme.

/** Médium, z ktorého sa dá poskladať nová kreatíva. */
export type Medium =
  | { druh: "video"; videoId: string; obrazok?: string }
  | { druh: "obrazok"; imageHash?: string; obrazok?: string };

/** Čo sa dalo prečítať zo zdrojovej kreatívy. */
export type ZdrojMedia = {
  medium: Medium | null;
  pageId: string;
  /** „<stránka>_<príspevok>" — keď médium v kreatíve nie je, dočítava sa post. */
  prispevokId: string;
  igUser: string;
  /** Prečo médium nie je — ide do hlášky, nie do ticha. */
  preco: string;
};

/** Tvar kreatívy, ktorý nám Graph vráti. Len polia, ktoré čítame. */
export type Kreativa = {
  object_story_spec?: Record<string, unknown>;
  thumbnail_url?: string;
  video_id?: string;
  image_hash?: string;
  image_url?: string;
  object_story_id?: string;
  effective_object_story_id?: string;
  effective_instagram_media_id?: string;
  asset_feed_spec?: Record<string, unknown>;
};

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

/** Z „134954005386935_3949632315333321" spraví „134954005386935". */
export function pageIdZStory(storyId: string): string {
  const m = /^([0-9]{5,})_[0-9]+$/.exec(text(storyId));
  return m ? m[1] : "";
}

/** Je to ID príspevku v tvare „stránka_príspevok“? */
export function jePrispevokId(id: string): boolean {
  return /^[0-9]{5,}_[0-9]{5,}$/.test(text(id));
}

/**
 * Médium zo zdrojovej kreatívy — vlastná kreatíva aj boost príspevku.
 *
 * Poradie je zámerné: najprv `object_story_spec` (vlastná kreatíva, kde je aj
 * pôvodný náhľad videa), potom polia priamo na kreatíve (boost), nakoniec
 * `asset_feed_spec` (kreatíva s viacerými zábermi — berie sa prvý).
 */
export function mediumZKreativy(kreativa: Kreativa | null | undefined): ZdrojMedia {
  const k = kreativa || {};
  const spec = (k.object_story_spec as Record<string, unknown> | undefined) || {};
  const ld = (spec.link_data as Record<string, unknown> | undefined) || {};
  const vd = (spec.video_data as Record<string, unknown> | undefined) || {};
  const afs = (k.asset_feed_spec as Record<string, unknown> | undefined) || {};
  const afsVideo = ((afs.videos as Record<string, unknown>[] | undefined) || [])[0] || {};
  const afsObrazok = ((afs.images as Record<string, unknown>[] | undefined) || [])[0] || {};
  const story = text(k.effective_object_story_id) || text(k.object_story_id);

  const pageId = text(spec.page_id) || pageIdZStory(story);
  const igUser = text(spec.instagram_user_id);
  const nahlad = text(vd.image_url) || text(afsVideo.thumbnail_url) || text(k.image_url) || text(k.thumbnail_url);

  const videoId = text(vd.video_id) || text(k.video_id) || text(afsVideo.video_id);
  if (videoId) {
    return { medium: { druh: "video", videoId, ...(nahlad ? { obrazok: nahlad } : {}) }, pageId, prispevokId: story, igUser, preco: "" };
  }

  const imageHash = text(ld.image_hash) || text(k.image_hash) || text(afsObrazok.hash);
  const obrazok = text(ld.picture) || text(k.image_url) || text(afsObrazok.url) || text(k.thumbnail_url);
  if (imageHash || obrazok) {
    return {
      medium: { druh: "obrazok", ...(imageHash ? { imageHash } : {}), ...(obrazok ? { obrazok } : {}) },
      pageId, prispevokId: story, igUser, preco: "",
    };
  }

  return {
    medium: null,
    pageId,
    prispevokId: story,
    igUser,
    preco: story
      ? "V kreatíve nie je médium — dočíta sa z príspevku."
      : "Zdrojová reklama nemá ani médium, ani príspevok, z ktorého by sa dalo čítať.",
  };
}

/** Tvar príspevku z Graphu. Len polia, ktoré čítame. */
export type Prispevok = {
  attachments?: { data?: Record<string, unknown>[] };
  full_picture?: string;
  object_id?: string;
};

/**
 * Médium z príspevku stránky — záchranná cesta, keď kreatíva médium nenesie.
 *
 * Pri videu dáva Graph jeho ID do `attachments.data[].target.id`, pri fotke
 * len adresu obrázka (`media.image.src`, prípadne `full_picture`). Karusel má
 * zábery v `subattachments` — berie sa prvý, lebo nová reklama je jednozáberová.
 */
export function mediumZPrispevku(prispevok: Prispevok | null | undefined): Medium | null {
  const p = prispevok || {};
  const prilohy = (p.attachments?.data || []) as Record<string, unknown>[];
  const prve = prilohy[0] || {};
  const pod = (((prve.subattachments as { data?: Record<string, unknown>[] } | undefined)?.data) || [])[0] || {};
  const kandidati = [prve, pod];

  for (const c of kandidati) {
    const typ = text(c.media_type).toLowerCase();
    const cielId = text((c.target as { id?: string } | undefined)?.id);
    const src = text(((c.media as { image?: { src?: string } } | undefined)?.image)?.src);
    if ((typ === "video" || typ === "video_inline" || typ === "video_autoplay") && cielId) {
      return { druh: "video", videoId: cielId, ...(src ? { obrazok: src } : {}) };
    }
  }
  // Fotka: niekedy je ID fotky v `object_id`, ale na kreatívu stačí adresa.
  for (const c of kandidati) {
    const src = text(((c.media as { image?: { src?: string } } | undefined)?.image)?.src);
    if (src) return { druh: "obrazok", obrazok: src };
  }
  const plna = text(p.full_picture);
  return plna ? { druh: "obrazok", obrazok: plna } : null;
}

/** Tvar videa z Graphu. */
export type Video = {
  picture?: string;
  thumbnails?: { data?: { uri?: string; is_preferred?: boolean; width?: number; height?: number }[] };
};

/**
 * Náhľad videa pre kreatívu.
 *
 * Meta pri `video_data` chce `image_url` alebo `image_hash`; bez náhľadu
 * kreatívu neprijme. `thumbnail_url` z kreatívy je orezaný na 64 × 64 (Meta ho
 * vracia ako ikonu), preto sa berie až ako posledný — prvý je ten náhľad, ktorý
 * má video označený ako preferovaný, inak najväčší.
 */
export function nahladVidea(video: Video | null | undefined, zalozny = ""): string {
  const zoz = (video?.thumbnails?.data || []).filter((t) => text(t.uri));
  const preferovany = zoz.find((t) => t.is_preferred);
  if (preferovany) return text(preferovany.uri);
  const najvacsi = [...zoz].sort((a, b) => (Number(b.width || 0) * Number(b.height || 0)) - (Number(a.width || 0) * Number(a.height || 0)))[0];
  return text(najvacsi?.uri) || text(video?.picture) || text(zalozny);
}
