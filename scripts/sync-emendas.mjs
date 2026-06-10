/** Ingere emendas (2023→2025) da API do Portal da Transparência. */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseBRL, parseLocalidade, tipoGrupo } from './emendas/parse.mjs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = env.PORTAL_TRANSPARENCIA_KEY
const API = 'https://api.portaldatransparencia.gov.br/api-de-dados/emendas'
const YEARS = (process.env.EMENDAS_ANOS ?? env.EMENDAS_ANOS ?? '2023,2024,2025')
  .split(',').map(s => Number(s.trim())).filter(Boolean)

const slugify = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

async function getPage(ano, pagina, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000)
      const res = await fetch(`${API}?ano=${ano}&pagina=${pagina}`, { headers: { 'chave-api-dados': KEY, Accept: 'application/json' }, signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return await res.json()
      if (res.status === 404) return []
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * 2 ** i))
  }
  throw new Error(`falha ano ${ano} pág ${pagina}`)
}

async function loadIndex() {
  const polByName = new Map()
  let from = 0
  for (;;) {
    const { data } = await supabase.from('politicians')
      .select('id, name, position:positions(slug)').order('id').range(from, from + 999)
    if (!data?.length) break
    for (const p of data) {
      const slug = p.position?.slug
      if (slug === 'deputado-federal' || slug === 'senador') {
        const k = slugify(p.name)
        if (!polByName.has(k)) polByName.set(k, p.id)
      }
    }
    if (data.length < 1000) break
    from += data.length
  }
  const muniByKey = new Map()
  from = 0
  for (;;) {
    const { data } = await supabase.from('municipalities')
      .select('id, name, state:states(abbr)').order('id').range(from, from + 999)
    if (!data?.length) break
    for (const m of data) {
      const uf = m.state?.abbr
      if (uf) muniByKey.set(`${uf}|${slugify(m.name)}`, m.id)
    }
    if (data.length < 1000) break
    from += data.length
  }
  return { polByName, muniByKey }
}

async function runPool(items, worker, concurrency = 20) {
  let idx = 0, done = 0, fail = 0
  async function lane() {
    while (idx < items.length) {
      const it = items[idx++]
      try { await worker(it) } catch { fail++ }
      if (++done % 2000 === 0) console.log(`  ...${done}/${items.length} upserts`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane))
  return { done, fail }
}

async function main() {
  if (!KEY) throw new Error('PORTAL_TRANSPARENCIA_KEY ausente no .env')
  const idx = await loadIndex()
  console.log(`[emendas] índices: ${idx.polByName.size} parlamentares, ${idx.muniByKey.size} municípios`)
  const rows = []
  for (const ano of YEARS) {
    let pagina = 1
    for (;;) {
      const page = await getPage(ano, pagina)
      if (!page.length) break
      for (const e of page) {
        const { municipio, uf } = parseLocalidade(e.localidadeDoGasto)
        const tg = tipoGrupo(e.tipoEmenda)
        const politician_id = tg === 'individual' ? (idx.polByName.get(slugify(e.nomeAutor || e.autor)) ?? null) : null
        const municipality_id = municipio && uf ? (idx.muniByKey.get(`${uf}|${slugify(municipio)}`) ?? null) : null
        rows.push({
          codigo: String(e.codigoEmenda), ano: Number(e.ano) || ano, numero: e.numeroEmenda ?? null,
          tipo: e.tipoEmenda ?? null, tipo_grupo: tg, autor_nome: e.nomeAutor || e.autor || null, politician_id,
          funcao: e.funcao ?? null, subfuncao: e.subfuncao ?? null,
          localidade_raw: e.localidadeDoGasto ?? null, municipality_id, uf,
          valor_empenhado: parseBRL(e.valorEmpenhado), valor_liquidado: parseBRL(e.valorLiquidado), valor_pago: parseBRL(e.valorPago),
          updated_at: new Date().toISOString(),
        })
      }
      if (pagina % 50 === 0) console.log(`[emendas] ${ano}: ${pagina} páginas, ${rows.length} linhas`)
      pagina++
      await new Promise(r => setTimeout(r, 60))
    }
    console.log(`[emendas] ${ano}: coletado (total acumulado ${rows.length})`)
  }
  console.log(`[emendas] ${rows.length} linhas a gravar...`)
  const { done, fail } = await runPool(rows, r =>
    supabase.from('emendas').upsert(r, { onConflict: 'codigo,localidade_raw,funcao,ano' }))
  const comPol = rows.filter(r => r.politician_id).length
  const comMuni = rows.filter(r => r.municipality_id).length
  console.log(`[emendas] concluído: ${done - fail} gravadas, ${fail} falhas · autor casado: ${comPol} · município casado: ${comMuni}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
