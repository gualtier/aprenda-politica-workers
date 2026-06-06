import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, revalidateQueue, type SyncJob, createServiceClient } from '@aprenda-politica/shared'
import { syncTSEState, syncTSEFederal } from './tse.js'
import { syncDeputadosFederais } from './camara.js'
import { syncSenadores } from './senado.js'

const worker = new Worker<SyncJob>('sync', async (job) => {
  const supabase = createServiceClient()
  const { type } = job.data

  if (type === 'sync-tse-state') {
    const { uf } = job.data as { type: 'sync-tse-state'; uf: string }
    await syncTSEState(supabase, uf, ['GOVERNADOR', 'DEPUTADO ESTADUAL', 'PREFEITO', 'VEREADOR'])
    await revalidateQueue.add('revalidate-after-sync', { paths: [`/${uf.toLowerCase()}`, '/politicos'] })

  } else if (type === 'sync-federal') {
    await syncTSEFederal(supabase)
    await revalidateQueue.add('revalidate-federal', { paths: ['/'] })

  } else if (type === 'sync-camara') {
    const { uf } = job.data as { type: 'sync-camara'; uf: string }
    await syncDeputadosFederais(supabase, uf)

  } else if (type === 'sync-senado') {
    const { uf } = job.data as { type: 'sync-senado'; uf: string }
    await syncSenadores(supabase, uf)
  }
}, {
  connection,
  concurrency: 2,
})

worker.on('completed', job => console.log(`[sync-worker] ✓ ${job.id} (${job.data.type})`))
worker.on('failed', (job, err) => console.error(`[sync-worker] ✗ ${job?.id}:`, err.message))

console.log('[sync-worker] listening on queue "sync"')
