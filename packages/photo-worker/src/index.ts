import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, type PhotoJob, createServiceClient } from '@aprenda-politica/shared'
import { processPhotosForState } from './tse-photos.js'

const worker = new Worker<PhotoJob>('photos', async (job) => {
  const supabase = createServiceClient()
  const { uf, year } = job.data
  await processPhotosForState(supabase, uf, year)
}, {
  connection,
  concurrency: 1,
})

worker.on('completed', job => console.log(`[photo-worker] ✓ ${job.id} ${job.data.uf}/${job.data.year}`))
worker.on('failed', (job, err) => console.error(`[photo-worker] ✗ ${job?.id}:`, err.message))

console.log('[photo-worker] listening on queue "photos"')
