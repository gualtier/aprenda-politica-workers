import { Queue } from 'bullmq'
import IORedis from 'ioredis'
const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null })
const photos = new Queue('photos', { connection })
const args = process.argv.slice(2) // pares UF:ANO ou só UF (faz 2024 e 2022)
for (const a of args) {
  const [uf, year] = a.includes(':') ? a.split(':') : [a, null]
  const years = year ? [Number(year)] : [2024, 2022]
  for (const y of years) {
    await photos.add(`photos-${y}-${uf}`, { uf, year: y }, { jobId: `photos-${y}-${uf}` })
    console.log(`enfileirado: photos ${uf} ${y}`)
  }
}
await photos.close(); await connection.quit()
