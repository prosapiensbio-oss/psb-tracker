// Background/context the AI assistant draws from — BEYOND the live data snapshot.
// PSB's history, philosophy, advisory rules and business-framework lens live in
// knowledge.md (Jerry's own documents + a distilled frameworks section). It is
// embedded in the (prompt-cached) system prompt, so every answer can be grounded
// in this context. Numbers still come ONLY from the live <data> snapshot.
//
// To update: edit knowledge.md and redeploy.
import knowledge from "./knowledge.md?raw";
// Prevádzkové pravidlá — cenník, členstvá, zľavy, kto je kto. Nedajú sa
// odvodiť z dát a bez nich si model z čísel vyrobí príbeh, ktorý nie je
// pravdivý (9 828 Kč = bitcoin, nie odmena za doporučenie).
import prevadzka from "./prevadzka.md?raw";
// Ich vlastné odpovede na riadený marketingový rozhovor (2026-08-01) + destilát
// rozhodovacích pravidiel z Jerryho knižnice. Profil je dôležitejší než rámce:
// hovorí, kto sú a čo nechcú, kým rámce hovoria len, ako o tom uvažovať.
import marketingProfil from "./marketing-profil.md?raw";
import marketingRamce from "./marketing-ramce.md?raw";
// Ako platformy rozhodujú o dosahu — s číslami PSB pri každom signáli. Datované
// a zastarávajúce; appka sleduje oficiálne kanály a pripomína polročnú revíziu.
import algoritmy from "./algoritmy.md?raw";

export const PSB_KNOWLEDGE = `${knowledge}

---

${prevadzka}

---

# MARKETINGOVÝ PROFIL PSB (ich vlastné slová)

${marketingProfil}

---

# MARKETINGOVÉ RÁMCE (destilát)

${marketingRamce}

---

${algoritmy}`;
