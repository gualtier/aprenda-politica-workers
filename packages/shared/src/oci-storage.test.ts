import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPhotoUrl } from './oci-storage.js'

beforeEach(() => {
  process.env.PHOTOS_BASE_URL = 'https://fotos.aprendapolitica.com.br'
})

afterEach(() => {
  delete process.env.PHOTOS_BASE_URL
})

describe('getPhotoUrl', () => {
  it('generates correct URL for a politician', () => {
    const url = getPhotoUrl('ES', '80002264925')
    expect(url).toBe('https://fotos.aprendapolitica.com.br/es/80002264925.jpg')
  })

  it('lowercases the UF', () => {
    const url = getPhotoUrl('SP', '12345678')
    expect(url).toBe('https://fotos.aprendapolitica.com.br/sp/12345678.jpg')
  })
})
