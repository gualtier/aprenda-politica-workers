import cron from 'node-cron'
import { syncQueue, photosQueue } from '@aprenda-politica/shared'

export const BRAZIL_UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA',
  'MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN',
  'RO','RR','RS','SC','SE','SP','TO',
]

export function startCronJobs() {
  // Sync TSE nacional — domingos 02h00 BRT (05h00 UTC)
  cron.schedule('0 5 * * 0', async () => {
    console.log('[scheduler] Enqueueing TSE national sync...')
    await syncQueue.add('sync-federal', { type: 'sync-federal' }, { jobId: 'sync-federal' })
    for (const uf of BRAZIL_UFS) {
      await syncQueue.add(`sync-tse-${uf}`, { type: 'sync-tse-state', uf }, { jobId: `sync-tse-${uf}` })
    }
    console.log(`[scheduler] Enqueued ${BRAZIL_UFS.length + 1} sync jobs`)
  })

  // Sync Câmara + Senado — domingos 02h30 BRT (05h30 UTC)
  cron.schedule('30 5 * * 0', async () => {
    console.log('[scheduler] Enqueueing Câmara + Senado sync...')
    for (const uf of BRAZIL_UFS) {
      await syncQueue.add(`sync-camara-${uf}`, { type: 'sync-camara', uf }, { jobId: `sync-camara-${uf}` })
      await syncQueue.add(`sync-senado-${uf}`, { type: 'sync-senado', uf }, { jobId: `sync-senado-${uf}` })
    }
  })

  // Fotos — domingos 04h00 BRT (07h00 UTC)
  cron.schedule('0 7 * * 0', async () => {
    console.log('[scheduler] Enqueueing photo processing...')
    for (const uf of BRAZIL_UFS) {
      await photosQueue.add(`photos-2024-${uf}`, { uf, year: 2024 }, { jobId: `photos-2024-${uf}` })
      await photosQueue.add(`photos-2022-${uf}`, { uf, year: 2022 }, { jobId: `photos-2022-${uf}` })
    }
  })

  console.log('[scheduler] Cron jobs started (TSE Sun 02h, Câmara/Senado Sun 02h30, Photos Sun 04h BRT)')
}
