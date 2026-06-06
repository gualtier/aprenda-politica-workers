import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, type NewsJob } from '@aprenda-politica/shared'

const worker = new Worker<NewsJob>('news', async (job) => {
  console.log(`[news-worker] job received (stub): ${job.data.municipalitySlug}`)
}, {
  connection,
  concurrency: 3,
})

worker.on('failed', (job, err) => console.error(`[news-worker] ✗ ${job?.id}:`, err.message))
console.log('[news-worker] listening on queue "news" (stub)')
