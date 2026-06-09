/**
 * Enriquece a base completa (estaduais + municipais) com campos do TSE:
 * ocupação declarada + bio (profissão, escolaridade, nascimento) a partir
 * dos ZIPs consulta_cand. Só mexe em quem NÃO tem bio (pula os federais
 * já enriquecidos via Câmara/Senado).
 * Uso: node scripts/enrich-tse.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { unzipSync } from 'fflate'
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ZIP_2022 = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'
const ZIP_2024 = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip'
const CACHE_2022 = '/tmp/tse_cand_2022.zip'
const CACHE_2024 = '/tmp/tse_cand_2024.zip'

const titleCase = s => (s || '').toLowerCase().replace(/(^|\s|'|\/|-)\p{L}/gu, c => c.toUpperCase())
const SKIP_OCC = new Set(['', 'OUTROS', 'NÃO INFORMADO', 'NAO INFORMADO'])
const SKIP_INSTR = new Set(['', 'NÃO INFORMADO', 'NAO INFORMADO'])

async function loadZip(cache, url, minBytes) {
  if (existsSync(cache) && statSync(cache).size >= minBytes) {
    console.log(`[tse] usando cache ${cache} (${(statSync(cache).size / 1e6).toFixed(0)}MB)`)
    return new Uint8Array(readFileSync(cache))
  }
  console.log(`[tse] baixando ${url} ...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download falhou: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  writeFileSync(cache, buf)
  console.log(`[tse] baixado (${(buf.length / 1e6).toFixed(0)}MB)`)
  return buf
}

/** Extrai só as colunas necessárias por SQ_CANDIDATO, mantendo apenas SQs do set `wanted`. */
function harvest(csvBuf, wanted, out) {
  const text = new TextDecoder('iso-8859-1').decode(csvBuf)
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return
  const split = l => l.split(';').map(v => v.replace(/^"|"$/g, '').trim())
  const H = split(lines[0])
  const idx = name => H.indexOf(name)
  const iSQ = idx('SQ_CANDIDATO'), iOcc = idx('DS_OCUPACAO'), iInstr = idx('DS_GRAU_INSTRUCAO')
  const iNasc = idx('DT_NASCIMENTO'), iGen = idx('DS_GENERO')
  if (iSQ < 0) return
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const v = split(lines[i])
    const sq = v[iSQ]
    if (!sq || !wanted.has(sq) || out.has(sq)) continue
    out.set(sq, { occ: v[iOcc] || '', instr: v[iInstr] || '', nasc: v[iNasc] || '', gen: v[iGen] || '' })
  }
}

function buildPatch(d) {
  const fem = d.gen === 'FEMININO'
  const occRaw = (d.occ || '').toUpperCase()
  const occupation = SKIP_OCC.has(occRaw) ? null : titleCase(d.occ)
  const parts = []
  if (occupation) parts.push(`Profissão declarada: ${occupation}.`)
  const instrRaw = (d.instr || '').toUpperCase()
  if (!SKIP_INSTR.has(instrRaw)) parts.push(`Escolaridade: ${titleCase(d.instr)}.`)
  const year = d.nasc?.split('/')?.[2]
  if (year && /^\d{4}$/.test(year)) {
    const age = new Date().getFullYear() - Number(year)
    parts.push(`${fem ? 'Nascida' : 'Nascido'} em ${year}${age > 0 && age < 120 ? ` (${age} anos)` : ''}.`)
  }
  const bio = parts.join(' ') || null
  if (!bio && !occupation) return null
  const patch = {}
  if (bio) patch.bio = bio
  if (occupation) patch.occupation = occupation
  return Object.keys(patch).length ? patch : null
}

async function fetchTargets() {
  // políticos SEM bio (pula federais já enriquecidos), com external_id
  const map = new Map() // external_id -> politician id
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('politicians')
      .select('id, external_id').is('bio', null).not('external_id', 'is', null)
      .order('id').range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    for (const p of data) map.set(p.external_id, p.id)
    if (data.length < 1000) break
    from += data.length
  }
  return map
}

async function runPool(items, worker, concurrency = 30) {
  let idx = 0, done = 0, fail = 0
  async function lane() {
    while (idx < items.length) {
      const it = items[idx++]
      try { await worker(it) } catch { fail++ }
      if (++done % 5000 === 0) console.log(`  ...${done}/${items.length} atualizados`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane))
  return { done, fail }
}

async function main() {
  console.log('[tse] buscando alvos (sem bio)...')
  const wantedById = await fetchTargets()
  const wanted = new Set(wantedById.keys())
  console.log(`[tse] ${wanted.size} políticos a enriquecer`)

  const fields = new Map() // SQ -> {occ,instr,nasc,gen}

  // 2024 (municipal: prefeitos + vereadores) — CSV por UF
  const zip24 = await loadZip(CACHE_2024, ZIP_2024, 40e6)
  const files24 = unzipSync(zip24)
  for (const name of Object.keys(files24)) {
    if (/consulta_cand_2024_[A-Z]{2}\.csv$/i.test(name)) harvest(files24[name], wanted, fields)
  }
  console.log(`[tse] após 2024: ${fields.size} casados`)

  // 2022 (estadual/federal) — CSV por UF (mesma estrutura do 2024); ZIP ~4MB
  try {
    const zip22 = await loadZip(CACHE_2022, ZIP_2022, 3e6)
    const files22 = unzipSync(zip22)
    for (const name of Object.keys(files22)) {
      if (/consulta_cand_2022_[A-Z]{2}\.csv$/i.test(name)) harvest(files22[name], wanted, fields)
    }
    console.log(`[tse] após 2022: ${fields.size} casados`)
  } catch (e) {
    console.warn(`[tse] 2022 pulado (${e.message}) — segue só com 2024`)
  }

  // monta patches
  const updates = []
  for (const [sq, id] of wantedById) {
    const d = fields.get(sq)
    if (!d) continue
    const patch = buildPatch(d)
    if (patch) updates.push({ id, patch })
  }
  console.log(`[tse] ${updates.length} updates a aplicar...`)

  const { done, fail } = await runPool(updates, u => supabase.from('politicians').update(u.patch).eq('id', u.id))
  console.log(`[tse] concluído: ${done - fail} aplicados, ${fail} falhas, ${wanted.size - updates.length} sem dado TSE`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
