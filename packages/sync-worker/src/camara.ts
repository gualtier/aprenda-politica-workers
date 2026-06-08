import { slugify } from '@aprenda-politica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

const CAMARA_API = 'https://dadosabertos.camara.leg.br/api/v2'
const CURRENT_LEGISLATURE = 57

/** Fetch com retry + backoff exponencial — a API da Câmara dá 504/timeout com frequência. */
async function fetchCamara(url: string, attempts = 5): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 30_000)
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return res
      // 5xx/429 são transitórios → retry; 4xx (exceto 429) é definitivo
      if (res.status < 500 && res.status !== 429) throw new Error(`Camara API error: ${res.status}`)
      lastErr = new Error(`Camara API error: ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * 2 ** i)) // 1s,2s,4s,8s
  }
  throw lastErr instanceof Error ? lastErr : new Error('Camara API: falha após retries')
}

export function parseCamaraDeputado(
  raw: { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string },
  positionId: number,
  stateId: number
) {
  return {
    name: raw.nome,
    slug: slugify(raw.nome),
    photo_url: raw.urlFoto || null,
    external_id: String(raw.id),
    source: 'camara' as const,
    position_id: positionId,
    state_id: stateId,
    municipality_id: null as number | null,
    party_id: null as number | null,
    mandate_start: '2023-02-01',
    mandate_end: '2027-01-31',
    _party_abbr: raw.siglaPartido,
  }
}

async function upsertParty(supabase: SupabaseClient, abbr: string): Promise<number | null> {
  await supabase.from('parties').upsert(
    { name: abbr, abbr, color_hex: '#888888' },
    { onConflict: 'abbr', ignoreDuplicates: true }
  )
  const { data } = await supabase.from('parties').select('id').eq('abbr', abbr).single()
  return data?.id ?? null
}

export async function syncDeputadosFederais(supabase: SupabaseClient, stateAbbr: string): Promise<number> {
  const { data: position } = await supabase
    .from('positions').select('id').eq('slug', 'deputado-federal').single()
  if (!position) throw new Error('Position deputado-federal not found')

  const { data: state } = await supabase
    .from('states').select('id').eq('abbr', stateAbbr).single()
  if (!state) throw new Error(`State not found: ${stateAbbr}`)

  let page = 1
  let total = 0

  while (true) {
    const url = `${CAMARA_API}/deputados?idLegislatura=${CURRENT_LEGISLATURE}&siglaUf=${stateAbbr}&itens=100&pagina=${page}&ordem=ASC&ordenarPor=nome`
    const res = await fetchCamara(url)
    const { dados } = await res.json()
    if (!dados || dados.length === 0) break

    for (const dep of dados) {
      const parsed = parseCamaraDeputado(dep, position.id, state.id)
      const { _party_abbr, ...row } = parsed

      if (_party_abbr) {
        row.party_id = await upsertParty(supabase, _party_abbr)
      }

      await supabase.from('politicians').upsert(row, { onConflict: 'slug' })
    }

    total += dados.length
    if (dados.length < 100) break
    page++
  }

  return total
}
