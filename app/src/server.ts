import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * HTML sa NESMIE kešovať bez overenia.
 *
 * Worker doteraz neposielal pri HTML žiadnu inštrukciu o keške, takže si ju
 * prehliadač určoval sám (heuristikou z Last-Modified). Výsledok: Jerry videl
 * po nasadení starú appku a musel zakaždým tvrdo obnovovať — trikrát za jedno
 * popoludnie hlásil „nič sa nezmenilo", hoci na serveri nová verzia bola.
 *
 * `no-cache` neznamená „nekešuj", ale „pred použitím sa vždy spýtaj". HTML je
 * malé (2,8 kB) a nesie odkazy na balíky s hashom v názve — akonáhle sa
 * overí, načítajú sa nové balíky samy. Samotné balíky sa kešovať MÔŽU
 * a majú: ich meno sa pri každej zmene mení, takže starý súbor nikdy
 * neprekáža novému.
 */
function bezKesovaniaHtml(response: Response): Response {
  const typ = response.headers.get("content-type") ?? "";
  if (!typ.includes("text/html")) return response;
  const h = new Headers(response.headers);
  h.set("cache-control", "no-cache, must-revalidate");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return bezKesovaniaHtml(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
