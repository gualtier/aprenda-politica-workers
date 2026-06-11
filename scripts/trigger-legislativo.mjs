import { Queue } from 'bullmq'
import IORedis from 'ioredis'
const connection = new IORedis({ host: '127.0.0.1', port: 16399, maxRetriesPerRequest: null })
const sync = new Queue('sync', { connection })
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
for (const uf of UFS) {
  await sync.add(`sync-camara-${uf}`, { type: 'sync-camara', uf }, { jobId: `sync-camara-${uf}` })
  await sync.add(`sync-senado-${uf}`, { type: 'sync-senado', uf }, { jobId: `sync-senado-${uf}` })
}
console.log(`enfileirados camara+senado p/ ${UFS.length} UFs (${UFS.length*2} jobs)`)
await sync.close(); await connection.quit()
