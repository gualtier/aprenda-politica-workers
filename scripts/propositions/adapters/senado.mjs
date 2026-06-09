import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { normalizeType, SUBSTANTIVE_TYPES } from '../normalize.mjs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const API = 'https://legis.senado.leg.br/dadosabertos'

async function getJSON(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 25000)
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return await res.json()
      if (res.status === 404) return null
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * 2 ** i))
  }
  throw new Error(`falha: ${url}`)
}
const arr = x => Array.isArray(x) ? x : x == null ? [] : [x]

async function senadorCodigos() {
  const { data: pos } = await supabase.from('positions').select('id').eq('slug', 'senador').single()
  const ids = []
  let from = 0
  for (;;) {
    const { data } = await supabase.from('politicians')
      .select('external_id').eq('position_id', pos.id).eq('source', 'senado').not('external_id', 'is', null)
      .order('id').range(from, from + 999)
    if (!data?.length) break
    ids.push(...data.map(d => d.external_id))
    if (data.length < 1000) break
    from += data.length
  }
  return ids
}

// Autores estruturados (com CodigoParlamentar p/ casamento). Endpoint: /materia/autoria/{cod}.json
async function autores(codMateria) {
  const j = await getJSON(`${API}/materia/autoria/${codMateria}.json`)
  const lista = arr(j?.AutoriaMateria?.Materia?.Autoria?.Autor)
  return lista
    .map(a => ({
      name: a.NomeAutor ?? a.IdentificacaoParlamentar?.NomeParlamentar ?? null,
      externalId: a.IdentificacaoParlamentar?.CodigoParlamentar ?? null,
      ordem: Number(a.NumOrdemAutor) || null,
    }))
    .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))
    .map((a, i) => ({ ...a, role: i === 0 ? 'autor' : 'coautor', ordem: a.ordem ?? i + 1 }))
}

// Situação atual. Endpoint: /materia/situacaoatual/{cod}.json
async function situacao(codMateria) {
  const j = await getJSON(`${API}/materia/situacaoatual/${codMateria}.json`)
  const m = arr(j?.SituacaoAtualMateria?.Materias?.Materia)[0]
  const aut = arr(m?.SituacaoAtual?.Autuacoes?.Autuacao)[0]
  const sit = arr(aut?.Situacoes?.Situacao)[0]
  return sit?.DescricaoSituacao ?? null
}

// Detalhe (ementa completa + indexação/temas). Endpoint: /materia/{cod}.json
async function indexacao(codMateria) {
  const j = await getJSON(`${API}/materia/${codMateria}.json`)
  const dados = j?.DetalheMateria?.Materia?.DadosBasicosMateria || {}
  const idx = (dados.IndexacaoMateria || '')
    .split(/[,;.]+/).map(s => s.trim()).filter(Boolean)
  return { ementa: dados.EmentaMateria ?? null, themes: idx.slice(0, 8) }
}

export const senadoAdapter = {
  source: 'senado',
  async *fetchPropositions({ sinceYear }) {
    const cods = await senadorCodigos()
    console.log(`[senado] ${cods.length} senadores; coletando autorias...`)
    const seen = new Set()
    for (const cod of cods) {
      const j = await getJSON(`${API}/senador/${cod}/autorias.json`)
      const aut = arr(j?.MateriasAutoriaParlamentar?.Parlamentar?.Autorias?.Autoria)
      for (const a of aut) {
        const mat = a.Materia || {}
        const codMat = mat.Codigo
        if (!codMat || seen.has(codMat)) continue
        seen.add(codMat)
        const type = normalizeType(mat.Sigla)
        // pré-filtro pelo tipo (mesmo conjunto do ingest) p/ evitar fetches de detalhe inúteis
        if (type && !SUBSTANTIVE_TYPES.has(type)) continue
        const year = Number(mat.Ano) || null
        if (year && year < sinceYear) continue
        const [authors, status, det] = await Promise.all([
          autores(codMat), situacao(codMat), indexacao(codMat),
        ])
        const ementa = det.ementa ?? mat.Ementa ?? null
        // fallback: se o endpoint de autoria falhar, ao menos vincula o senador iterado
        const finalAuthors = authors.length
          ? authors
          : [{ name: null, externalId: cod, role: 'autor', ordem: 1 }]
        yield {
          source: 'senado', externalId: String(codMat),
          type, number: Number(mat.Numero) || null, year,
          title: ementa, summary: ementa,
          presentedOn: mat.Data ?? null,
          status,
          themes: det.themes,
          url: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${codMat}`,
          authors: finalAuthors,
        }
        await new Promise(r => setTimeout(r, 80))
      }
    }
  },
}
