import { Queue } from 'bullmq'
import IORedis from 'ioredis'
const connection = new IORedis({ host: '127.0.0.1', port: 16399, maxRetriesPerRequest: null })
for (const name of ['sync', 'photos', 'revalidate', 'news']) {
  const q = new Queue(name, { connection })
  await q.obliterate({ force: true })
  console.log(`fila '${name}' limpa`)
  await q.close()
}
await connection.quit()
