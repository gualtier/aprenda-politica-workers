import { camaraAdapter } from './adapters/camara.mjs'
import { senadoAdapter } from './adapters/senado.mjs'
// ales entra nas tasks seguintes
export const registry = { camara: camaraAdapter, senado: senadoAdapter }
