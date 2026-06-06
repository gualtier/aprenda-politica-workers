import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export const connection = new IORedis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
})

// ── Job type definitions ───────────────────────────────────────────────────────

export type SyncJob =
  | { type: 'sync-tse-state'; uf: string }
  | { type: 'sync-federal' }
  | { type: 'sync-camara'; uf: string }
  | { type: 'sync-senado'; uf: string }

export type PhotoJob = {
  uf: string
  year: 2022 | 2024
}

export type RevalidateJob = {
  paths: string[]
}

export type NewsJob = {
  municipalitySlug: string
}

// ── Queue instances ────────────────────────────────────────────────────────────

export const syncQueue      = new Queue<SyncJob>('sync',       { connection })
export const photosQueue    = new Queue<PhotoJob>('photos',    { connection })
export const revalidateQueue = new Queue<RevalidateJob>('revalidate', { connection })
export const newsQueue      = new Queue<NewsJob>('news',       { connection })
