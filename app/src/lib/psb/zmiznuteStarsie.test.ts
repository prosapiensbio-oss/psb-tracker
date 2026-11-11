// Tréning zmazaný z Google až po vypadnutí z okna snímky (Matej Procházka, 11. 11. 2026).
import { describe, expect, it } from "bun:test";

import { uidyVIcale, zmiznuteStarsie } from "./kalendarZmeny";

const ical = (uidy: string[]) => ["BEGIN:VCALENDAR", ...uidy.flatMap((u) => ["BEGIN:VEVENT", `UID:${u}`, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const dvadsat = Array.from({ length: 25 }, (_, i) => `ev${i}@google.com`);

describe("uidyVIcale", () => {
  it("číta UID aj zo zalomeného riadku", () => {
    const t = "BEGIN:VEVENT\r\nUID:abcdefghij\r\n klmnop@google.com\r\nEND:VEVENT";
    expect([...uidyVIcale(t)]).toEqual(["abcdefghijklmnop@google.com"]);
  });
});

describe("zmiznuteStarsie", () => {
  const uidy = uidyVIcale(ical(dvadsat));
  it("udalosť, ktorej UID v súbore nie je, zmizla", () => {
    const stare = [{ uid: "ev1@google.com|2026-10-01T09:30" }, { uid: "zmazany@google.com|2026-10-14T10:00" }];
    expect(zmiznuteStarsie(stare, uidy).zmizle.map((x) => x.uid)).toEqual(["zmazany@google.com|2026-10-14T10:00"]);
  });
  it("výskyt opakovanej série sa pozná podľa UID série", () => {
    expect(zmiznuteStarsie([{ uid: "ev3@google.com|2026-09-16T10:00" }], uidy).zmizle).toEqual([]);
  });
  it("skoro prázdny súbor sa nesúdi", () => {
    expect(zmiznuteStarsie([{ uid: "x@google.com|2026-10-01T09:30" }], uidyVIcale(ical(["a"]))).zmizle).toEqual([]);
  });
  it("keď by zmizla veľká časť naraz, nezmizne nič", () => {
    const stare = Array.from({ length: 12 }, (_, i) => ({ uid: `iny${i}@google.com|2026-10-0${(i % 9) + 1}T09:00` }));
    const r = zmiznuteStarsie(stare, uidy);
    expect(r.odmietnute).toBe(true);
    expect(r.zmizle).toEqual([]);
  });
});
