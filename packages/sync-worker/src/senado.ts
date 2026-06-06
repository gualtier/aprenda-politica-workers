import { slugify } from '@aprenda-politica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

export function parseSenador(raw: any, positionId: number, stateId: number) {
  const p = raw.IdentificacaoParlamentar
  const m = raw.Mandato
  return {
    name: p.NomeParlamentar as string,
    slug: slugify(p.NomeParlamentar as string),
    photo_url: (p.UrlFotoParlamentar as string) || null,
    external_id: String(p.CodigoParlamentar),
    source: 'senado' as const,
    position_id: positionId,
    state_id: stateId,
    municipality_id: null as number | null,
    party_id: null as number | null,
    mandate_start: (m?.DataInicioMandato as string) || null,
    mandate_end: (m?.DataFimMandato as string) || null,
    _party_abbr: p.SiglaPartidoParlamentar as string,
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

export async function syncSenadores(supabase: SupabaseClient, stateAbbr: string): Promise<number> {
  const { data: position } = await supabase
    .from('positions').select('id').eq('slug', 'senador').single()
  if (!position) throw new Error('Position senador not found')

  const { data: state } = await supabase
    .from('states').select('id').eq('abbr', stateAbbr).single()
  if (!state) throw new Error(`State not found: ${stateAbbr}`)

  const res = await fetch(
    'https://legis.senado.leg.br/dadosabertos/senador/lista/atual',
    { headers: { Accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(`Senado API error: ${res.status}`)
  const json = await res.json()

  const allSenadores: any[] =
    json?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ?? []

  const stateSenadores = allSenadores.filter(
    (s: any) => s.IdentificacaoParlamentar?.UfParlamentar === stateAbbr
  )

  let count = 0
  for (const sen of stateSenadores) {
    const parsed = parseSenador(sen, position.id, state.id)
    const { _party_abbr, ...row } = parsed

    if (_party_abbr) {
      row.party_id = await upsertParty(supabase, _party_abbr)
    }

    await supabase.from('politicians').upsert(row, { onConflict: 'slug' })
    count++
  }

  return count
}
