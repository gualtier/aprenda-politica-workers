import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { normalizeType } from '../normalize.mjs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BULK = 'https://dadosabertos.camara.leg.br/arquivos'

async function getBulk(dataset, year, attempts = 3) {
  const url = `${BULK}/${dataset}/json/${dataset}-${year}.json`
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) { const j = await res.json(); return j.dados ?? j }
      if (res.status === 404) return []
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 1500 * 2 ** i))
  }
  throw new Error(`bulk falhou: ${dataset}-${year}`)
}

const idFromUri = uri => { const m = (uri || '').match(/\/(\d+)$/); return m ? m[1] : null }

async function sittingDeputyIds() {
  const { data: pos } = await supabase.from('positions').select('id').eq('slug', 'deputado-federal').single()
  const ids = new Set()
  let from = 0
  for (;;) {
    const { data } = await supabase.from('politicians')
      .select('external_id').eq('position_id', pos.id).eq('source', 'camara').not('external_id', 'is', null)
      .order('id').range(from, from + 999)
    if (!data?.length) break
    for (const d of data) ids.add(String(d.external_id))
    if (data.length < 1000) break
    from += data.length
  }
  return ids
}

export const camaraAdapter = {
  source: 'camara',
  async *fetchPropositions({ sinceYear }) {
    const deputies = await sittingDeputyIds()
    console.log(`[camara] ${deputies.size} deputados em exercício`)
    const thisYear = new Date().getFullYear()
    for (let year = sinceYear; year <= thisYear; year++) {
      console.log(`[camara] baixando arquivos ${year}...`)
      const [autores, props] = await Promise.all([
        getBulk('proposicoesAutores', year),
        getBulk('proposicoes', year),
      ])
      if (!props.length) { console.log(`[camara] ${year}: sem dados`); continue }
      const byProp = new Map()
      for (const a of autores) {
        const arr = byProp.get(a.idProposicao); if (arr) arr.push(a); else byProp.set(a.idProposicao, [a])
      }
      const propById = new Map(props.map(p => [String(p.id), p]))
      console.log(`[camara] ${year}: ${props.length} proposições, ${autores.length} vínculos`)
      let emitted = 0
      for (const [idProp, authors] of byProp) {
        const hasSittingProponent = authors.some(a => a.proponente === '1' && deputies.has(idFromUri(a.uriAutor)))
        if (!hasSittingProponent) continue
        const p = propById.get(String(idProp))
        if (!p) continue
        const y = Number(p.ano) || null
        if (y && y < sinceYear) continue
        const ordered = [...authors].sort((a, b) => Number(a.ordemAssinatura || 0) - Number(b.ordemAssinatura || 0))
        yield {
          source: 'camara', externalId: String(p.id),
          type: normalizeType(p.siglaTipo), number: Number(p.numero) || null, year: y,
          title: p.ementa ?? null, summary: p.ementaDetalhada || p.ementa || null,
          presentedOn: p.dataApresentacao ? String(p.dataApresentacao).slice(0, 10) : null,
          status: p.ultimoStatus?.descricaoSituacao ?? null,
          themes: (p.keywords ? String(p.keywords).split(/[,;]+/).map(s => s.trim()).filter(Boolean) : []).slice(0, 8),
          url: `https://www.camara.leg.br/propostas-legislativas/${p.id}`,
          authors: ordered.map(a => ({
            name: a.nomeAutor, externalId: idFromUri(a.uriAutor),
            role: a.proponente === '1' ? 'autor' : 'coautor', ordem: Number(a.ordemAssinatura) || null,
          })),
        }
        emitted++
      }
      console.log(`[camara] ${year}: ${emitted} proposições com proponente em exercício`)
    }
  },
}
