import 'dotenv/config'
import express from 'express'
import basicAuth from 'express-basic-auth'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { ExpressAdapter } from '@bull-board/express'
import { Worker } from 'bullmq'
import {
  connection, syncQueue, photosQueue, revalidateQueue, newsQueue,
  type RevalidateJob,
} from '@aprenda-politica/shared'
import { startCronJobs } from './cron.js'

const revalidateWorker = new Worker<RevalidateJob>('revalidate', async (job) => {
  const url = process.env.VERCEL_REVALIDATE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!url || !secret) return

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
    body: JSON.stringify({ paths: job.data.paths }),
  })
  if (!res.ok) console.warn(`[revalidate] Vercel responded ${res.status}`)
  else console.log(`[revalidate] ✓ ${job.data.paths.join(', ')}`)
}, { connection, concurrency: 5 })

revalidateWorker.on('failed', (job, err) => console.error('[revalidate] ✗', err.message))

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/')

createBullBoard({
  queues: [
    new BullMQAdapter(syncQueue),
    new BullMQAdapter(photosQueue),
    new BullMQAdapter(revalidateQueue),
    new BullMQAdapter(newsQueue),
  ],
  serverAdapter,
})

const app = express()

app.use(
  '/',
  basicAuth({
    users: { [process.env.BULL_BOARD_USER ?? 'admin']: process.env.BULL_BOARD_PASSWORD ?? 'admin' },
    challenge: true,
  }),
  serverAdapter.getRouter()
)

app.listen(3001, '0.0.0.0', () => {
  console.log('[bull-board] running on http://localhost:3001')
})

startCronJobs()
