import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null })
const sync = new Queue('sync', { connection })

const args = process.argv.slice(2)
const ufs = args.filter(a => a !== '--no-federal' && a !== '--camara-senado')
const withFederal = !args.includes('--no-federal')
const withCamaraSenado = args.includes('--camara-senado')

if (withFederal) {
  await sync.add('sync-federal', { type: 'sync-federal' }, { jobId: 'sync-federal' })
  console.log('enfileirado: sync-federal')
}
for (const uf of ufs) {
  await sync.add(`sync-tse-${uf}`, { type: 'sync-tse-state', uf }, { jobId: `sync-tse-${uf}` })
  console.log(`enfileirado: sync-tse-${uf}`)
  if (withCamaraSenado) {
    await sync.add(`sync-camara-${uf}`, { type: 'sync-camara', uf }, { jobId: `sync-camara-${uf}` })
    await sync.add(`sync-senado-${uf}`, { type: 'sync-senado', uf }, { jobId: `sync-senado-${uf}` })
    console.log(`enfileirado: camara+senado ${uf}`)
  }
}
await sync.close()
await connection.quit()
console.log('pronto.')
