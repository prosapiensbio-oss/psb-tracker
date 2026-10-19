import { describe, expect, it } from "bun:test";

import { jePrispevokId, mediumZKreativy, mediumZPrispevku, nahladVidea, pageIdZStory } from "./reklamaMedium";

describe("reklamaMedium", () => {
  it("vlastná kreatíva s videom — médium aj stránka zo specu", () => {
    const r = mediumZKreativy({
      object_story_spec: {
        page_id: "134954005386935",
        instagram_user_id: "17841400000000000",
        video_data: { video_id: "1039810895336170", image_url: "https://nahlad/vlastny.jpg" },
      },
      thumbnail_url: "https://nahlad/ikonka64.jpg",
    });
    expect(r.medium).toEqual({ druh: "video", videoId: "1039810895336170", obrazok: "https://nahlad/vlastny.jpg" });
    expect(r.pageId).toBe("134954005386935");
    expect(r.igUser).toBe("17841400000000000");
  });

  it("vlastná kreatíva s obrázkom — image_hash z link_data", () => {
    const r = mediumZKreativy({ object_story_spec: { page_id: "1", link_data: { image_hash: "abc123", picture: "https://p/x.jpg" } } });
    expect(r.medium).toEqual({ druh: "obrazok", imageHash: "abc123", obrazok: "https://p/x.jpg" });
  });

  it("boost príspevku — video_id a stránka z effective_object_story_id", () => {
    // Presne to, čo Graph vrátil 19. 10. 2026 pri kreatíve 1686254312454365.
    const r = mediumZKreativy({
      video_id: "3949632315333321",
      thumbnail_url: "https://scontent/ikonka.jpg",
      effective_object_story_id: "134954005386935_3949632315333321",
      effective_instagram_media_id: "18080903213665448",
    });
    expect(r.medium).toEqual({ druh: "video", videoId: "3949632315333321", obrazok: "https://scontent/ikonka.jpg" });
    expect(r.pageId).toBe("134954005386935");
    expect(r.prispevokId).toBe("134954005386935_3949632315333321");
    expect(r.preco).toBe("");
  });

  it("kreatíva s viacerými zábermi — berie prvé video z asset_feed_spec", () => {
    const r = mediumZKreativy({
      asset_feed_spec: { videos: [{ video_id: "555", thumbnail_url: "https://t/1.jpg" }, { video_id: "666" }] },
      object_story_id: "77777_888888",
    });
    expect(r.medium).toEqual({ druh: "video", videoId: "555", obrazok: "https://t/1.jpg" });
    expect(r.pageId).toBe("77777");
  });

  it("kreatíva bez média — povie, že sa dočíta z príspevku", () => {
    const r = mediumZKreativy({ effective_object_story_id: "134954005386935_1094034983211656" });
    expect(r.medium).toBeNull();
    expect(r.prispevokId).toBe("134954005386935_1094034983211656");
    expect(r.preco).toContain("príspevku");
  });

  it("kreatíva bez média aj bez príspevku — povie dôvod", () => {
    const r = mediumZKreativy({});
    expect(r.medium).toBeNull();
    expect(r.pageId).toBe("");
    expect(r.preco).toContain("ani príspevok");
  });

  it("prázdna kreatíva nespadne", () => {
    expect(mediumZKreativy(null).medium).toBeNull();
    expect(mediumZKreativy(undefined).pageId).toBe("");
  });

  it("stránka z ID príspevku", () => {
    expect(pageIdZStory("134954005386935_123456789")).toBe("134954005386935");
    expect(pageIdZStory("123456789")).toBe("");
    expect(pageIdZStory("")).toBe("");
    expect(jePrispevokId("134954005386935_123456789")).toBe(true);
    expect(jePrispevokId("134954005386935")).toBe(false);
  });

  it("príspevok s videom — ID z target", () => {
    const m = mediumZPrispevku({
      attachments: { data: [{ media_type: "video", target: { id: "987654321" }, media: { image: { src: "https://t/v.jpg" } } }] },
    });
    expect(m).toEqual({ druh: "video", videoId: "987654321", obrazok: "https://t/v.jpg" });
  });

  it("karusel — berie prvý záber zo subattachments", () => {
    const m = mediumZPrispevku({
      attachments: { data: [{ media_type: "album", subattachments: { data: [{ media_type: "video", target: { id: "111" } }] } }] },
    });
    expect(m).toEqual({ druh: "video", videoId: "111" });
  });

  it("príspevok s fotkou — adresa obrázka", () => {
    const m = mediumZPrispevku({ attachments: { data: [{ media_type: "photo", media: { image: { src: "https://t/f.jpg" } } }] } });
    expect(m).toEqual({ druh: "obrazok", obrazok: "https://t/f.jpg" });
  });

  it("príspevok bez príloh — full_picture", () => {
    expect(mediumZPrispevku({ full_picture: "https://t/p.jpg" })).toEqual({ druh: "obrazok", obrazok: "https://t/p.jpg" });
    expect(mediumZPrispevku({})).toBeNull();
    expect(mediumZPrispevku(null)).toBeNull();
  });

  it("náhľad videa — preferovaný pred väčším a pred ikonkou z kreatívy", () => {
    const v = {
      picture: "https://t/picture.jpg",
      thumbnails: { data: [{ uri: "https://t/male.jpg", width: 100, height: 100 }, { uri: "https://t/pref.jpg", is_preferred: true, width: 10, height: 10 }] },
    };
    expect(nahladVidea(v, "https://t/ikonka.jpg")).toBe("https://t/pref.jpg");
    expect(nahladVidea({ thumbnails: { data: [{ uri: "https://t/a.jpg", width: 10, height: 10 }, { uri: "https://t/b.jpg", width: 100, height: 100 }] } }))
      .toBe("https://t/b.jpg");
    expect(nahladVidea({ picture: "https://t/picture.jpg" })).toBe("https://t/picture.jpg");
    expect(nahladVidea(null, "https://t/ikonka.jpg")).toBe("https://t/ikonka.jpg");
    expect(nahladVidea(null)).toBe("");
  });
});
