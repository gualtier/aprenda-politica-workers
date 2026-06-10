import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRss, slugify, urlHash, sourceDomain, extractCodes } from './parse.mjs'

const SAMPLE = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Câmara aprova PL 4012/2025 sobre emendas</title>
  <link>https://news.google.com/rss/articles/abc123?oc=5</link>
  <pubDate>Mon, 09 Jun 2026 12:00:00 GMT</pubDate>
  <description>&lt;a href="x"&gt;Texto do snippet da matéria.&lt;/a&gt;</description>
  <source url="https://oglobo.globo.com">O Globo</source>
</item>
</channel></rss>`

test('parseRss extrai os campos do item', () => {
  const items = parseRss(SAMPLE)
  assert.equal(items.length, 1)
  const it = items[0]
  assert.equal(it.title, 'Câmara aprova PL 4012/2025 sobre emendas')
  assert.equal(it.link, 'https://news.google.com/rss/articles/abc123?oc=5')
  assert.equal(it.sourceName, 'O Globo')
  assert.equal(it.sourceDomain, 'oglobo.globo.com')
  assert.ok(it.snippet.includes('Texto do snippet'))
  assert.ok(!it.snippet.includes('<a'))
  assert.ok(it.publishedAt instanceof Date)
})

test('slugify gera slug ascii', () => {
  assert.equal(slugify('Câmara aprova Lei'), 'camara-aprova-lei')
})

test('urlHash é estável e determinístico', () => {
  assert.equal(urlHash('https://x.com/a'), urlHash('https://x.com/a'))
  assert.notEqual(urlHash('https://x.com/a'), urlHash('https://x.com/b'))
})

test('sourceDomain normaliza www', () => {
  assert.equal(sourceDomain('https://www.folha.uol.com.br/x'), 'folha.uol.com.br')
})

test('extractCodes acha PL/PEC/Emenda', () => {
  const c = extractCodes('Câmara aprova PL 4012/2025 e a PEC 18/2025; cita Emenda 71/2026')
  assert.deepEqual(c.sort(), ['Emenda 71/2026', 'PEC 18/2025', 'PL 4012/2025'].sort())
})
