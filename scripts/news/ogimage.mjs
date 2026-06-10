// Resolve a URL ofuscada do Google News -> URL do veículo -> og:image (foto real).
// Best-effort: qualquer falha retorna {url:null, image:null} (o card cai na capa geométrica).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

async function getText(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(opts.timeout ?? 9000), ...opts })
  return res.text()
}

/** Decodifica o link do Google News no link real do veículo (via batchexecute). */
async function decodePublisherUrl(googleNewsUrl) {
  const artId = googleNewsUrl.split('/articles/')[1]?.split('?')[0]
  if (!artId) return null
  const page = await getText(googleNewsUrl)
  const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1]
  const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1]
  if (!sg || !ts) return null
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${artId}",${ts},"${sg}"]`
  const freq = JSON.stringify([[['Fbv4je', inner, null, 'generic']]])
  const resp = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
    body: new URLSearchParams({ 'f.req': freq }).toString(),
    signal: AbortSignal.timeout(9000),
  })
  const text = await resp.text()
  const m = text.match(/garturlres.*?(https?:\/\/[^\\"]+)/)
  return m ? m[1] : null
}

const OG_RE = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"|<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i

/**
 * @returns {Promise<{url: string|null, image: string|null}>} url = link real do veículo, image = og:image
 */
export async function resolveOgImage(googleNewsUrl) {
  try {
    const pub = await decodePublisherUrl(googleNewsUrl)
    if (!pub) return { url: null, image: null }
    const html = await getText(pub, { timeout: 9000 })
    const m = html.match(OG_RE)
    const image = m ? (m[1] || m[2]) : null
    return { url: pub, image: image && /^https?:\/\//.test(image) ? image : null }
  } catch {
    return { url: null, image: null }
  }
}
