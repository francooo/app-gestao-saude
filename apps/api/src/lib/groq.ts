/**
 * Chamada ao Groq, por fetch puro.
 *
 * Sem SDK, no mesmo padrao de email.ts (Resend) e geocoding.ts (MapTiler): o
 * corpo e JSON simples e apps/api tem so cinco dependencias de runtime, o que
 * vale preservar.
 *
 * O modelo foi escolhido pelo que a CONTA enxerga, e nao pelo catalogo: os
 * Llama aparecem na documentacao mas nao estao ativos aqui. Dos disponiveis
 * com contexto grande (gpt-oss-120b, gpt-oss-20b, qwen3.8-27b), o 120b e o
 * mais capaz — e a latencia medida foi de 0,5 a 0,6 s, entao nao ha motivo
 * para descer.
 *
 * Essa latencia tambem e o que dispensa streaming: o maxDuration de 15 s da
 * Vercel e folgado, e o cliente do aplicativo continua usando request() com
 * .json(), sem SSE e sem expo/fetch.
 */

const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';

export const MODELO = 'openai/gpt-oss-120b';

/**
 * Teto proprio, menor que o da Vercel.
 *
 * Estourando aqui, o erro e nosso e legivel; estourando la, vira um 504 cru
 * que o aplicativo nao sabe traduzir.
 */
const TIMEOUT_MS = 20_000;

export type MensagemGroq = { role: 'system' | 'user' | 'assistant'; content: string };

export type RespostaGroq =
  | { ok: true; texto: string; modelo: string }
  | { ok: false; motivo: 'indisponivel' | 'modelo' | 'falha' };

export async function perguntarAoGroq(mensagens: MensagemGroq[]): Promise<RespostaGroq> {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) {
    // Faltar a variavel e erro de implantacao, nao do usuario. Registrar alto:
    // sem isto o sintoma na tela ("nao consegui responder") nao aponta a causa.
    console.error('[assistente] GROQ_API_KEY ausente no ambiente');
    return { ok: false, motivo: 'indisponivel' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(URL_GROQ, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        messages: mensagens,
        // Baixa de proposito: o assistente le agenda, nao inventa prosa.
        temperature: 0.2,
        max_completion_tokens: 500,
        reasoning_effort: 'low',
      }),
      signal: controller.signal,
    });

    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      console.error('[assistente] groq respondeu', r.status, corpo.slice(0, 300));
      // 404 costuma ser modelo que saiu da conta — ja aconteceu com os Llama.
      return { ok: false, motivo: r.status === 404 ? 'modelo' : 'falha' };
    }

    const dados = (await r.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };

    const texto = dados.choices?.[0]?.message?.content?.trim();
    if (!texto) {
      console.error('[assistente] groq devolveu resposta vazia');
      return { ok: false, motivo: 'falha' };
    }

    return { ok: true, texto, modelo: dados.model ?? MODELO };
  } catch (erro) {
    // Nao registramos o corpo da pergunta: e dado de saude, e os logs da
    // Vercel ficam fora do Brasil. So o tipo do erro.
    console.error('[assistente] falha ao chamar o groq', {
      name: erro instanceof Error ? erro.name : 'unknown',
    });
    return { ok: false, motivo: 'falha' };
  } finally {
    clearTimeout(timer);
  }
}
