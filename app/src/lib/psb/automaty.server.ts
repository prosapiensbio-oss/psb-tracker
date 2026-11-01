import type { D1Database } from "@cloudflare/workers-types";

/**
 * ZÁPIS BEHU AUTOMATU.
 *
 * Zapisuje sa KAŽDÝ pokus, nielen úspech — chýbajúci riadok potom znamená
 * „nespustilo sa", čo je iná porucha než „spustilo sa a spadlo". Je to tá
 * istá lekcia ako pri kalendári: worker vie zomrieť na limit PRED tým, než
 * stihne zapísať chybu, takže prázdno nie je dôkaz, že je dobre.
 *
 * Zápis NIKDY nezhodí samotný automat: keď padne on, automat pokračuje.
 * Stráž, ktorá rozbije to, čo stráži, je horšia než žiadna.
 */
export async function zapisBeh(
  DB: D1Database | undefined,
  automat: string,
  ok: boolean,
  detail?: string,
  chyba?: string,
): Promise<void> {
  if (!DB) return;
  try {
    await DB.prepare(
      "INSERT INTO automaty (id, automat, kedy, ok, detail, chyba) VALUES (?1,?2,?3,?4,?5,?6)",
    ).bind(
      crypto.randomUUID(), automat, new Date().toISOString(), ok ? 1 : 0,
      (detail || "").slice(0, 300) || null, (chyba || "").slice(0, 300) || null,
    ).run();
    // Staršie než 30 dní nikoho nezaujímajú a tabuľka by rástla donekonečna.
    if (Math.random() < 0.05) {
      await DB.prepare("DELETE FROM automaty WHERE kedy < ?1")
        .bind(new Date(Date.now() - 30 * 86400000).toISOString()).run();
    }
  } catch {
    /* zápis stavu nesmie zhodiť automat */
  }
}
