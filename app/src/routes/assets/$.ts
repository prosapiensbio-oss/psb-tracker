import { createFileRoute } from '@tanstack/react-router'
import { samoliecenieAssetu } from '../../lib/psb/samoliecenie'

// Sem padnú LEN chýbajúce súbory z /assets/ — existujúce servíruje platforma
// sama (wrangler `assets`, `not_found_handling: "none"`). Chýbajúci *.js je
// takmer vždy zaseknutý PWA shell so starým hashom → samoliečenie (viď lib).
export const Route = createFileRoute('/assets/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const r = samoliecenieAssetu(new URL(request.url).pathname)
        return r ?? new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
