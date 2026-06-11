import { Queue } from 'bullmq'
import IORedis from 'ioredis'
const connection = new IORedis({ host: '127.0.0.1', port: 16399, maxRetriesPerRequest: null })
const q = new Queue('photos', { connection })
const c = await q.getJobCounts('waiting','active','completed','failed')
console.log(JSON.stringify(c))
const act = await q.getActive(0,2)
if (act[0]) console.log('processando:', act[0].id)
await q.close(); await connection.quit()
