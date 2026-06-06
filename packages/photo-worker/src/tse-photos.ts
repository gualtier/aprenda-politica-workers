import { unzipSync } from 'fflate'
import { uploadPhoto, photoExists } from '@aprenda-politica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

function photoZipUrl(year: 2022 | 2024, uf: string): string {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/foto_cand/foto_cand${year}_${uf}_div.zip`
}

export async function processPhotosForState(
  supabase: SupabaseClient,
  uf: string,
  year: 2022 | 2024
): Promise<number> {
  const mandateStart = year === 2024 ? '2025-01-01' : '2023-01-01'
  const { data: politicians } = await supabase
    .from('politicians')
    .select('id, external_id, slug')
    .eq('state_id', (await supabase.from('states').select('id').eq('abbr', uf).single()).data?.id)
    .is('photo_url', null)
    .eq('mandate_start', mandateStart)
    .eq('source', 'tse')

  if (!politicians || politicians.length === 0) {
    console.log(`[photo-worker] ${uf} ${year}: no politicians without photos`)
    return 0
  }

  const url = photoZipUrl(year, uf)
  console.log(`[photo-worker] downloading ${url}...`)
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[photo-worker] ZIP ${url} not found (${res.status})`)
    return 0
  }
  const zipBuf = new Uint8Array(await res.arrayBuffer())
  const files = unzipSync(zipBuf)

  let updated = 0
  for (const pol of politicians) {
    const sq = pol.external_id
    if (!sq) continue

    const filename = `F${uf.toUpperCase()}${sq}_div.jpg`
    const imgData = files[filename]
    if (!imgData) continue

    try {
      const photoUrl = await uploadPhoto(uf, sq, imgData)
      await supabase.from('politicians').update({ photo_url: photoUrl }).eq('id', pol.id)
      updated++
    } catch (err: any) {
      console.warn(`[photo-worker] failed to upload ${sq}:`, err.message)
    }
  }

  console.log(`[photo-worker] ${uf} ${year}: ${updated}/${politicians.length} photos uploaded`)
  return updated
}
