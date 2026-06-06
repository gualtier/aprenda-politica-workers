import { unzipSync } from 'fflate'
import { slugify } from '@aprenda-politica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

const TSE_ZIP_2022 = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'
const TSE_ZIP_2024 = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip'

const CARGO_TO_POSITION: Record<string, string> = {
  'PRESIDENTE': 'presidente',
  'PRESIDENTE DA REPÚBLICA': 'presidente',
  'GOVERNADOR': 'governador',
  'DEPUTADO ESTADUAL': 'deputado-estadual',
  'PREFEITO': 'prefeito',
  'VEREADOR': 'vereador',
}

const MANDATE: Record<string, { start: string; end: string }> = {
  'presidente':        { start: '2023-01-01', end: '2026-12-31' },
  'governador':        { start: '2023-01-01', end: '2026-12-31' },
  'deputado-estadual': { start: '2023-02-01', end: '2027-01-31' },
  'prefeito':          { start: '2025-01-01', end: '2028-12-31' },
  'vereador':          { start: '2025-01-01', end: '2028-12-31' },
}

const BATCH_SIZE = 500

let cache2022: Uint8Array | null = null
let cache2024: Uint8Array | null = null

async function getZip(year: 2022 | 2024): Promise<Uint8Array> {
  if (year === 2022 && cache2022) return cache2022
  if (year === 2024 && cache2024) return cache2024
  const url = year === 2022 ? TSE_ZIP_2022 : TSE_ZIP_2024
  console.log(`[tse] downloading ${year} ZIP...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TSE ZIP ${year} failed: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (year === 2022) cache2022 = buf
  else cache2024 = buf
  return buf
}

function parseCSV(buffer: Uint8Array): Record<string, string>[] {
  const text = new TextDecoder('iso-8859-1').decode(buffer)
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const parse = (l: string) => l.split(';').map(v => v.replace(/^"|"$/g, '').trim())
  const headers = parse(lines[0])
  return lines.slice(1).map(l => {
    const vals = parse(l)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

async function resolveParties(supabase: SupabaseClient, rows: Record<string, string>[]): Promise<Map<string, number>> {
  const parties = new Map<string, string>()
  for (const r of rows) {
    const abbr = r['SG_PARTIDO']?.trim()
    if (abbr && !parties.has(abbr)) parties.set(abbr, r['NM_PARTIDO']?.trim() ?? abbr)
  }
  if (parties.size === 0) return new Map()
  await supabase.from('parties').upsert(
    Array.from(parties.entries()).map(([abbr, name]) => ({ abbr, name, color_hex: '#888888' })),
    { onConflict: 'abbr', ignoreDuplicates: true }
  )
  const { data } = await supabase.from('parties').select('id, abbr').in('abbr', Array.from(parties.keys()))
  const map = new Map<string, number>()
  for (const p of data ?? []) map.set(p.abbr, p.id)
  return map
}

async function resolveMunicipalities(supabase: SupabaseClient, stateId: number): Promise<Map<string, number>> {
  const { data } = await supabase.from('municipalities').select('id, name').eq('state_id', stateId)
  const map = new Map<string, number>()
  for (const m of data ?? []) map.set(m.name.toUpperCase(), m.id)
  return map
}

export async function syncTSEState(
  supabase: SupabaseClient,
  uf: string,
  cargos: ('GOVERNADOR' | 'DEPUTADO ESTADUAL' | 'PREFEITO' | 'VEREADOR')[]
): Promise<number> {
  const { data: state } = await supabase.from('states').select('id').eq('abbr', uf).single()
  if (!state) throw new Error(`State not found: ${uf}`)

  const positionSlugs = Array.from(new Set(cargos.map(c => CARGO_TO_POSITION[c])))
  const { data: positions } = await supabase.from('positions').select('id, slug').in('slug', positionSlugs)
  const positionIds: Record<string, number> = {}
  for (const p of positions ?? []) positionIds[p.slug] = p.id

  const years = new Set(cargos.map(c => (c === 'PREFEITO' || c === 'VEREADOR') ? 2024 : 2022))
  const rowsByYear: Record<number, Record<string, string>[]> = {}
  for (const year of Array.from(years)) {
    const zipBuf = await getZip(year as 2022 | 2024)
    const files = unzipSync(zipBuf)
    const csvName = Object.keys(files).find(n => n.includes(`_${uf}.csv`))
    if (!csvName) throw new Error(`CSV for ${uf} not found in ${year} ZIP`)
    rowsByYear[year] = parseCSV(files[csvName])
  }

  const allElected: Record<string, string>[] = []
  for (const cargo of cargos) {
    const year = (cargo === 'PREFEITO' || cargo === 'VEREADOR') ? 2024 : 2022
    const elected = rowsByYear[year].filter(r =>
      r['DS_CARGO'] === cargo && r['DS_SIT_TOT_TURNO']?.startsWith('ELEITO')
    )
    console.log(`[tse] ${uf} ${cargo}: ${elected.length} eleitos`)
    allElected.push(...elected)
  }
  if (allElected.length === 0) return 0

  const partyMap = await resolveParties(supabase, allElected)
  const munMap = await resolveMunicipalities(supabase, state.id)

  const records = allElected.map(row => {
    const cargo = row['DS_CARGO']
    const positionSlug = CARGO_TO_POSITION[cargo]
    const positionId = positionIds[positionSlug]
    if (!positionId) return null
    const sqCandidato = row['SQ_CANDIDATO']?.trim()
    const name = (row['NM_CANDIDATO'] || row['NM_URNA_CANDIDATO'])?.trim()
    if (!name || !sqCandidato) return null
    const mandate = MANDATE[positionSlug]
    const isMunicipal = cargo === 'PREFEITO' || cargo === 'VEREADOR'
    return {
      name,
      slug: `${slugify(name)}-${uf.toLowerCase()}-${sqCandidato.slice(-6)}`,
      photo_url: null,
      party_id: partyMap.get(row['SG_PARTIDO']?.trim()) ?? null,
      position_id: positionId,
      state_id: state.id,
      municipality_id: isMunicipal ? (munMap.get(row['NM_UE']?.trim().toUpperCase()) ?? null) : null,
      external_id: sqCandidato,
      source: 'tse',
      mandate_start: mandate.start,
      mandate_end: mandate.end,
    }
  }).filter(Boolean) as object[]

  let upserted = 0
  for (const batch of chunks(records, BATCH_SIZE)) {
    const { error, count } = await supabase.from('politicians')
      .upsert(batch, { onConflict: 'slug', ignoreDuplicates: false })
      .select('id')
    if (error) console.error(`[tse] batch error (${uf}):`, error.message)
    else upserted += count ?? batch.length
  }
  return upserted
}

export async function syncTSEFederal(supabase: SupabaseClient): Promise<number> {
  const { data: position } = await supabase.from('positions').select('id').eq('slug', 'presidente').single()
  if (!position) throw new Error('Position "presidente" not found')
  const zipBuf = await getZip(2022)
  const files = unzipSync(zipBuf)
  const csvName = Object.keys(files).find(n => n.includes('_BR.csv'))
  if (!csvName) throw new Error('BR CSV not found in 2022 ZIP')
  const rows = parseCSV(files[csvName])
  const elected = rows.filter(r =>
    (r['DS_CARGO'] === 'PRESIDENTE' || r['DS_CARGO'] === 'PRESIDENTE DA REPÚBLICA') &&
    r['DS_SIT_TOT_TURNO']?.startsWith('ELEITO')
  )
  if (elected.length === 0) return 0
  const partyMap = await resolveParties(supabase, elected)
  const mandate = MANDATE['presidente']
  const records = elected.map(row => {
    const sqCandidato = row['SQ_CANDIDATO']?.trim()
    const name = (row['NM_CANDIDATO'] || row['NM_URNA_CANDIDATO'])?.trim()
    if (!name || !sqCandidato) return null
    return {
      name,
      slug: `${slugify(name)}-br-${sqCandidato.slice(-6)}`,
      photo_url: null,
      party_id: partyMap.get(row['SG_PARTIDO']?.trim()) ?? null,
      position_id: position.id,
      state_id: null, municipality_id: null,
      external_id: sqCandidato, source: 'tse',
      mandate_start: mandate.start, mandate_end: mandate.end,
    }
  }).filter(Boolean) as object[]
  const { error, count } = await supabase.from('politicians')
    .upsert(records, { onConflict: 'slug', ignoreDuplicates: false })
    .select('id')
  if (error) { console.error('[tse] federal error:', error.message); return 0 }
  return count ?? records.length
}

export const BRAZIL_UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA',
  'MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN',
  'RO','RR','RS','SC','SE','SP','TO',
]
