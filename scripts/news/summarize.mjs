import Anthropic from '@anthropic-ai/sdk'

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

const cleanFallback = (title, snippet) => {
  const s = (snippet || '').trim()
  if (s.length >= 40) return s.slice(0, 280)
  return (title || '').trim().slice(0, 280)
}

/**
 * Resumo neutro de 2-3 frases, ANCORADO só no título+snippet (não inventa fatos).
 * Falha de API/sem chave -> fallback pro snippet limpo (degradação graciosa).
 */
export async function summarize(title, snippet) {
  if (!client) return cleanFallback(title, snippet)
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      system:
        'Você resume notícias cívicas brasileiras em pt-BR. Escreva 2 a 3 frases neutras e factuais, ' +
        'usando SOMENTE as informações do título e do trecho fornecidos. NUNCA invente nomes, números, ' +
        'datas ou fatos que não estejam no texto. Sem opinião, sem adjetivos de juízo. Retorne só o resumo.',
      messages: [{
        role: 'user',
        content: `Título: ${title}\nTrecho: ${snippet || '(sem trecho)'}\n\nResumo:`,
      }],
    })
    const text = msg.content?.find(c => c.type === 'text')?.text?.trim()
    return text && text.length >= 20 ? text : cleanFallback(title, snippet)
  } catch {
    return cleanFallback(title, snippet)
  }
}
