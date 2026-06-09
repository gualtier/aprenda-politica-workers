import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify, buildSlug, normalizeType, dedupeAuthors } from './normalize.mjs'

test('slugify remove acentos e baixa caixa', () => {
  assert.equal(slugify('João DA Silva-Côrtes'), 'joao-da-silva-cortes')
})

test('buildSlug monta tipo-numero-ano', () => {
  assert.equal(buildSlug({ type: 'PL', number: 1853, year: 2026 }), 'pl-1853-2026')
})

test('buildSlug sem numero usa external_id e fonte', () => {
  assert.equal(buildSlug({ type: 'PEC', year: 2023, source: 'senado', externalId: 'X9' }), 'pec-2023-senado-x9')
})

test('normalizeType maiusculiza e tira acento', () => {
  assert.equal(normalizeType('pl'), 'PL')
  assert.equal(normalizeType('Proposição de Emenda'), 'PROPOSICAO DE EMENDA')
})

test('dedupeAuthors junta por author_name preservando 1ª ordem', () => {
  const out = dedupeAuthors([
    { author_name: 'Ana', ordem: 1 },
    { author_name: 'Ana', ordem: 5 },
    { author_name: 'Bruno', ordem: 2 },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].author_name, 'Ana')
  assert.equal(out[0].ordem, 1)
})
