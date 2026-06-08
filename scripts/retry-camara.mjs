import { Queue } from 'bullmq'
import IORedis from 'ioredis'
const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null })
const sync = new Queue('sync', { connection })
const ufs = process.argv.slice(2)
for (const uf of ufs) {
  await sync.add(`sync-camara-${uf}`, { type: 'sync-camara', uf }, { jobId: `sync-camara-${uf}` })
}
console.log(`re-enfileirados camara: ${ufs.join(', ')}`)
await sync.close(); await connection.quit()
