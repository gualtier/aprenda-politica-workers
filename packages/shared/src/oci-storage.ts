import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

function getClient(): S3Client {
  const namespace = process.env.OCI_NAMESPACE
  const region    = process.env.OCI_REGION ?? 'sa-saopaulo-1'
  if (!namespace) throw new Error('OCI_NAMESPACE is required')

  return new S3Client({
    region,
    endpoint: `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com`,
    credentials: {
      accessKeyId:     process.env.OCI_ACCESS_KEY_ID!,
      secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  })
}

const BUCKET = () => process.env.OCI_BUCKET ?? 'politician-photos'

export function getPhotoUrl(uf: string, sqCandidato: string): string {
  const base = process.env.PHOTOS_BASE_URL ?? ''
  return `${base}/${uf.toLowerCase()}/${sqCandidato}.jpg`
}

export async function uploadPhoto(
  uf: string,
  sqCandidato: string,
  imageBuffer: Uint8Array
): Promise<string> {
  const key = `${uf.toLowerCase()}/${sqCandidato}.jpg`
  const cmd = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/jpeg',
    ACL: 'public-read',
  })
  // Retry com backoff — OCI pode dar erro transitório (propagação de chave nova, throttling)
  let lastErr: unknown
  for (let i = 0; i < 4; i++) {
    try {
      await getClient().send(cmd)
      return getPhotoUrl(uf, sqCandidato)
    } catch (e) {
      lastErr = e
      await new Promise(r => setTimeout(r, 500 * 2 ** i)) // 0.5s,1s,2s,4s
    }
  }
  throw lastErr
}

export async function photoExists(uf: string, sqCandidato: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({
      Bucket: BUCKET(),
      Key: `${uf.toLowerCase()}/${sqCandidato}.jpg`,
    }))
    return true
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw error
  }
}
