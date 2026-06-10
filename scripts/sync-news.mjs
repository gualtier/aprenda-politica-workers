import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseRss, slugify, urlHash, extractCodes } from './news/parse.mjs'
import { summarize } from './news/summarize.mjs'
import { buildSeed } from './news/seed.mjs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
for (const k of ['ANTHROPIC_API_KEY']) if (env[k]) process.env[k] = env[k]
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const PER_QUERY = Number(process.env.NEWS_PER_QUERY ?? 6)
const COVER_BY_CAT = { camara: 'congresso', senado: 'cupula', governo: 'palacio', eleicoes: 'urna', economia: 'grafico', cidades: 'cidade', justica: 'balanca' }

async function rss(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 AprendaPoliticaBot' } })
      if (res.ok) return parseRss(await res.text())
    } catch {}
    await new Promise(r => setTimeout(r, 500 * (a + 1)))
  }
  return []
}

async function loadMentionIndex() {
  const polByName = new Map()
  const { data: positions } = await supabase.from('positions').select('id, slug')
    .in('slug', ['presidente', 'governador', 'senador', 'deputado-federal'])
  const posIds = (positions ?? []).map(p => p.id)
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('politicians').select('id, name').in('position_id', posIds).range(from, from + 999)
    const batch = data ?? []
    for (const p of batch) { const key = slugify(p.name); if (key.includes('-')) polByName.set(key, { id: p.id, name: p.name }) }
    if (batch.length < 1000) break
  }
  return { polByName }
}

async function matchCode(code) {
  const em = code.match(/^Emenda\s+([\d.]+)\/(\d{4})$/i)
  if (em) {
    const { data } = await supabase.from('emendas').select('id').eq('numero', em[1]).eq('ano', Number(em[2])).limit(1)
    return data?.[0] ? { emenda_id: data[0].id, label: code } : null
  }
  const m = code.match(/^(\S+)\s+([\d.]+)\/(\d{4})$/)
  if (m) {
    const { data } = await supabase.from('propositions').select('id')
      .ilike('type', m[1]).eq('number', Number(m[2].replace(/\./g, ''))).eq('year', Number(m[3])).limit(1)
    return data?.[0] ? { proposition_id: data[0].id, label: code } : null
  }
  return null
}

async function main() {
  const all = await buildSeed(supabase)
  const seed = process.env.NEWS_SEED_LIMIT ? all.slice(0, Number(process.env.NEWS_SEED_LIMIT)) : all
  const idx = await loadMentionIndex()
  console.log(`[news] semente: ${seed.length}/${all.length} entidades · índice menção: ${idx.polByName.size} federais`)
  let inserted = 0, linked = 0
  for (const s of seed) {
    const items = (await rss(s.query)).slice(0, PER_QUERY)
    for (const it of items) {
      const url_hash = urlHash(it.link)
      const { data: ex } = await supabase.from('news').select('id').eq('url_hash', url_hash).limit(1)
      let newsId = ex?.[0]?.id
      if (!newsId) {
        const summary = await summarize(it.title, it.snippet)
        const slug = `${slugify(it.title)}-${url_hash.slice(0, 6)}`
        const row = {
          slug, title: it.title, summary,
          source_name: it.sourceName, source_domain: it.sourceDomain, source_url: it.link, url_hash,
          published_at: it.publishedAt ? it.publishedAt.toISOString() : null,
          category: s.category, sphere: s.sphere,
          topics: s.topicSlug ? [s.topicSlug] : [],
          cover_motif: COVER_BY_CAT[s.category] ?? 'congresso',
        }
        const { data: ins } = await supabase.from('news').insert(row).select('id').single()
        newsId = ins?.id
        if (newsId) inserted++
      }
      if (!newsId) continue
      const ents = []
      if (s.politician_id) ents.push({ news_id: newsId, role: 'principal', politician_id: s.politician_id, label: s.label })
      else if (s.orgao) ents.push({ news_id: newsId, role: 'principal', orgao: s.orgao, label: s.label })
      for (const code of extractCodes(`${it.title} ${it.snippet}`)) {
        const mm = await matchCode(code)
        if (mm) ents.push({ news_id: newsId, role: 'mencionado', ...mm })
      }
      const hay = slugify(`${it.title} ${it.snippet}`)
      for (const [key, p] of idx.polByName) {
        if (p.id === s.politician_id) continue
        if (hay.includes(key)) ents.push({ news_id: newsId, role: 'mencionado', politician_id: p.id, label: p.name })
      }
      if (ents.length) {
        await supabase.from('news_entities').delete().eq('news_id', newsId)
        const { error } = await supabase.from('news_entities').insert(ents)
        if (!error) linked += ents.length
      }
    }
    await new Promise(r => setTimeout(r, 120))
  }
  console.log(`[news] concluído: ${inserted} notícias novas · ${linked} vínculos`)
}
main().catch(e => { console.error(e); process.exit(1) })
