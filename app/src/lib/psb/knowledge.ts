// Background/context the AI assistant draws from — BEYOND the live data snapshot.
// PSB's history, philosophy, advisory rules and business-framework lens live in
// knowledge.md (Jerry's own documents + a distilled frameworks section). It is
// embedded in the (prompt-cached) system prompt, so every answer can be grounded
// in this context. Numbers still come ONLY from the live <data> snapshot.
//
// To update: edit knowledge.md and redeploy.
import knowledge from "./knowledge.md?raw";

export const PSB_KNOWLEDGE = knowledge;
