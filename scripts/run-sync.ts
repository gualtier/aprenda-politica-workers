/**
 * Sync nacional em processo único (sem BullMQ/Redis) — feito para rodar no
 * GitHub Actions agendado. Reusa as funções dos workers (com os fixes:
 * retry da Câmara, match de município por slug, resiliência do DF).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      VERCEL_REVALIDATE_URL, REVALIDATE_SECRET (opcionais p/ revalidar)
 *      UFS=AC,SP (opcional — default: todas as 27)
 */
import { createServiceClient } from '@aprenda-politica/shared'
import { syncTSEState, syncTSEFederal } from '../packages/sync-worker/src/tse.js'
import { syncDeputadosFederais } from '../packages/sync-worker/src/camara.js'
import { syncSenadores } from '../packages/sync-worker/src/senado.js'

const ALL_UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]
const UFS = process.env.UFS ? process.env.UFS.split(',').map(s => s.trim().toUpperCase()) : ALL_UFS
const CARGOS = ['GOVERNADOR', 'DEPUTADO ESTADUAL', 'PREFEITO', 'VEREADOR'] as const

async function step(label: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn()
    console.log(`✓ ${label}${typeof r === 'number' ? ` (${r})` : ''}`)
  } catch (e) {
    console.error(`✗ ${label}: ${(e as Error).message}`)
  }
}

async function main() {
  const supabase = createServiceClient()
  console.log(`[run-sync] iniciando — ${UFS.length} UF(s)`)

  await step('federal (TSE)', () => syncTSEFederal(supabase))

  for (const uf of UFS) {
    await step(`TSE ${uf}`, () => syncTSEState(supabase, uf, [...CARGOS]))
  }

  for (const uf of UFS) {
    await step(`Câmara ${uf}`, () => syncDeputadosFederais(supabase, uf))
    await step(`Senado ${uf}`, () => syncSenadores(supabase, uf))
  }

  // Revalida o cache do Vercel
  const url = process.env.VERCEL_REVALIDATE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (url && secret) {
    await step('revalidate Vercel', async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify({ paths: ['/', '/politicos', '/estados'] }),
      })
      if (!res.ok) throw new Error(`revalidate HTTP ${res.status}`)
    })
  }

  console.log('[run-sync] concluído')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1) })
