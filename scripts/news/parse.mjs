import { createHash } from 'node:crypto'

const decode = (s) => (s || '')
  .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ').trim()

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : ''
}

export function slugify(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

export const urlHash = (url) => createHash('sha1').update(url || '').digest('hex')

export function sourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

const CODE_RE = /\b(PL|PLP|PEC|PDL|MPV?|ADI|ADPF|Lei|Resolu[çc][aã]o|Emenda)\s*n?[ºo.]?\s*([\d.]+\/\d{4})/gi

export function extractCodes(text) {
  const out = new Set()
  for (const m of (text || '').matchAll(CODE_RE)) {
    out.add(`${m[1].replace(/^Mp$/i, 'MP')} ${m[2]}`.replace(/\s+/g, ' ').trim())
  }
  return [...out]
}

export function parseRss(xml) {
  const items = []
  for (const m of (xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1]
    const link = tag(block, 'link')
    const srcM = block.match(/<source\s+url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i)
    const pub = tag(block, 'pubDate')
    items.push({
      title: tag(block, 'title'),
      link,
      snippet: tag(block, 'description'),
      publishedAt: pub ? new Date(pub) : null,
      sourceName: srcM ? decode(srcM[2]) : null,
      sourceDomain: srcM ? sourceDomain(srcM[1]) : null,
    })
  }
  return items.filter(i => i.title && i.link)
}
