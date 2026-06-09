import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { buildSlug, dedupeAuthors, slugify, SUBSTANTIVE_TYPES } from './normalize.mjs'
import { classifyTopics } from './topics.mjs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * Índice de casamento de autores:
 *  - federal: external_id (id deputado / código senador) -> { id, party_id }
 *  - ES: nome normalizado (dep. estadual do ES) -> { id, party_id }
 */
async function loadMatchIndex() {
  const byExternal = new Map()
  const byNameES = new Map()
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('politicians')
      .select('id, name, party_id, external_id, source, state_id, position:positions(slug), state:states(abbr)')
      .order('id').range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    for (const p of data) {
      if (p.external_id && (p.source === 'camara' || p.source === 'senado')) {
        byExternal.set(`${p.source}:${p.external_id}`, { id: p.id, party_id: p.party_id })
      }
      const posSlug = p.position?.slug
      const uf = p.state?.abbr
      if (posSlug === 'deputado-estadual' && uf === 'ES') {
        byNameES.set(slugify(p.name), { id: p.id, party_id: p.party_id })
      }
    }
    if (data.length < 1000) break
    from += data.length
  }
  return { byExternal, byNameES }
}

function matchAuthor(raw, source, idx) {
  if ((source === 'camara' || source === 'senado') && raw.externalId) {
    return idx.byExternal.get(`${source}:${raw.externalId}`) ?? null
  }
  if (source === 'ales') return idx.byNameES.get(slugify(raw.name)) ?? null
  return null
}

export async function ingest(adapter, { sinceYear = 2023 } = {}) {
  const idx = await loadMatchIndex()
  let ok = 0, fail = 0
  for await (const p of adapter.fetchPropositions({ sinceYear })) {
    if (p.type && !SUBSTANTIVE_TYPES.has(p.type)) continue // pula lixo procedural
    try {
      const authors = dedupeAuthors((p.authors || []).map(a => ({
        author_name: a.name, author_external_id: a.externalId ?? null,
        role: a.role ?? 'autor', ordem: a.ordem ?? null,
      })))
      const matched = authors.map(a => ({ a, m: matchAuthor({ name: a.author_name, externalId: a.author_external_id }, p.source, idx) }))
      const partyIds = [...new Set(matched.map(x => x.m?.party_id).filter(Boolean))]
      const slug = buildSlug({ type: p.type, number: p.number, year: p.year, source: p.source, externalId: p.externalId })

      const row = {
        source: p.source, external_id: p.externalId, type: p.type,
        number: p.number ?? null, year: p.year ?? null,
        title: p.title ?? null, summary: p.summary ?? null,
        presented_on: p.presentedOn ?? null, status: p.status ?? null,
        themes: p.themes ?? [],
        topics: classifyTopics(p.title, p.summary, p.themes ?? []),
        url: p.url ?? null,
        party_ids: partyIds, slug, updated_at: new Date().toISOString(),
      }
      const { data: up, error: upErr } = await supabase
        .from('propositions').upsert(row, { onConflict: 'source,external_id' }).select('id').single()
      if (upErr) throw upErr

      const authorRows = matched.map(({ a, m }) => ({
        proposition_id: up.id, politician_id: m?.id ?? null,
        author_name: a.author_name, author_external_id: a.author_external_id,
        role: a.role, ordem: a.ordem,
      }))
      if (authorRows.length) {
        await supabase.from('proposition_authors')
          .upsert(authorRows, { onConflict: 'proposition_id,author_name' })
      }
      if (++ok % 200 === 0) console.log(`  ...${ok} proposições`)
    } catch (e) {
      fail++
      console.warn(`  ✗ ${p.type} ${p.number}/${p.year}: ${e.message}`)
    }
  }
  console.log(`[${adapter.source}] concluído: ${ok} proposições, ${fail} falhas`)
}
