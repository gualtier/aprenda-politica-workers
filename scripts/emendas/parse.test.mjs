import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBRL, parseLocalidade, tipoGrupo } from './parse.mjs'

test('parseBRL converte "10.000,00" → 10000', () => {
  assert.equal(parseBRL('10.000,00'), 10000)
  assert.equal(parseBRL('1.234.567,89'), 1234567.89)
  assert.equal(parseBRL('0,00'), 0)
  assert.equal(parseBRL(''), 0)
})

test('parseLocalidade separa município e UF', () => {
  assert.deepEqual(parseLocalidade('LONDRINA - PR'), { municipio: 'LONDRINA', uf: 'PR' })
  assert.deepEqual(parseLocalidade('PR'), { municipio: null, uf: 'PR' })
  assert.deepEqual(parseLocalidade('NACIONAL'), { municipio: null, uf: null })
  assert.deepEqual(parseLocalidade(''), { municipio: null, uf: null })
  assert.deepEqual(parseLocalidade('SÃO PAULO (UF)'), { municipio: null, uf: 'SP' })
  assert.deepEqual(parseLocalidade('MINAS GERAIS (UF)'), { municipio: null, uf: 'MG' })
  assert.deepEqual(parseLocalidade('DISTRITO FEDERAL (UF)'), { municipio: null, uf: 'DF' })
})

test('tipoGrupo classifica o tipoEmenda', () => {
  assert.equal(tipoGrupo('Emenda Individual - Transferências com Finalidade Definida'), 'individual')
  assert.equal(tipoGrupo('Emenda de Bancada Estadual'), 'bancada')
  assert.equal(tipoGrupo('Emenda de Comissão'), 'comissao')
  assert.equal(tipoGrupo('Emenda de Relator-Geral'), 'relator')
  assert.equal(tipoGrupo('Outra coisa'), 'outro')
})
