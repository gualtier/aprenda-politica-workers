import { Queue } from 'bullmq'
import IORedis from 'ioredis'
const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null })
const q = new Queue('sync', { connection })
const counts = await q.getJobCounts('waiting','active','completed','failed','delayed')
console.log('counts:', JSON.stringify(counts))
const waiting = await q.getWaiting(0, 5)
const active = await q.getActive(0, 5)
console.log('amostra waiting jobIds:', waiting.map(j => j.id).join(', '))
console.log('amostra active jobIds:', active.map(j => j.id).join(', '))
await q.close(); await connection.quit()
