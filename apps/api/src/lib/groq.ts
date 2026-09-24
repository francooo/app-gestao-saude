/**
 * Chamada ao Groq, por fetch puro.
 *
 * Sem SDK, no mesmo padrao de email.ts (Resend) e geocoding.ts (MapTiler): o
 * corpo e JSON simples e apps/api tem so cinco dependencias de runtime, o que
 * vale preservar.
 *
 * O modelo foi escolhido pelo que a CONTA enxerga, e nao pelo catalogo: os
 * Llama aparecem na documentacao mas nao estao ativos aqui, e os `compound`
 * (que ja trazem busca embutida) respondem 404. Dos disponiveis com contexto
 * grande, o gpt-oss-120b e o mais capaz — e e ele quem aceita `browser_search`
 * como ferramenta de servidor, que e o que da internet ao assistente.
 *
 * ESTE ARQUIVO NAO DECIDE NADA. Ele faz UMA chamada e devolve o que voltou,
 * inteiro. Quem repete, executa ferramenta e desiste e o laco em
 * assistente-laco.ts. A divisao importa porque a resposta agora tem duas
 * formas possiveis — texto final ou pedido de ferramenta — e confundir as duas
 * foi exatamente o defeito da versao anterior, que lia so `content` e tratava
 * todo pedido de ferramenta como resposta vazia.
 */

const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';

export const MODELO = 'openai/gpt-oss-120b';

/**
 * Teto de saida por rodada.
 *
 * Subiu de 500 porque agora a resposta pode vir depois de ler paginas da
 * internet, e cortar no meio de uma explicacao de bula e pior que gastar mais
 * um pouco. Continua sendo teto, nao alvo: pergunta simples segue custando
 * algumas centenas de tokens.
 */
const TETO_DE_SAIDA = 1200;

/** A busca do proprio Groq, executada no servidor deles. */
export const BUSCA_NA_INTERNET = { type: 'browser_search' } as const;

export type ChamadaDeFerramenta = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type MensagemGroq =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaDeFerramenta[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type MensagemDoAssistente = {
  role: 'assistant';
  content: string | null;
  tool_calls?: ChamadaDeFerramenta[];
};

export type RespostaGroq =
  | {
      ok: true;
      mensagem: MensagemDoAssistente;
      /** 'stop' = respondeu; 'tool_calls' = quer uma ferramenta; 'length' = cortou. */
      motivoDeParada: string;
      modelo: string;
      /** O modelo usou a busca do Groq nesta rodada. */
      buscou: boolean;
    }
  | { ok: false; motivo: 'indisponivel' | 'modelo' | 'falha' | 'tempo' };

type Opcoes = {
  /** Declaracoes de ferramenta. Lista vazia = proibido pedir ferramenta. */
  ferramentas?: readonly unknown[];
  /** Orcamento desta rodada, em ms. Quem controla e o laco. */
  timeoutMs: number;
};

export async function perguntarAoGroq(
  mensagens: MensagemGroq[],
  opcoes: Opcoes,
): Promise<RespostaGroq> {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) {
    // Faltar a variavel e erro de implantacao, nao do usuario. Registrar alto:
    // sem isto o sintoma na tela ("nao consegui responder") nao aponta a causa.
    console.error('[assistente] GROQ_API_KEY ausente no ambiente');
    return { ok: false, motivo: 'indisponivel' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs);

  const ferramentas = opcoes.ferramentas ?? [];

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
        // Baixa de proposito: em saude, variar a redacao nao agrega e variar o
        // numero e perigoso.
        temperature: 0.2,
        max_completion_tokens: TETO_DE_SAIDA,
        reasoning_effort: 'low',
        // Lista vazia sai do corpo: mandar `tools: []` e um erro 400 na API, e
        // a ultima rodada do laco chama justamente assim, sem ferramenta.
        ...(ferramentas.length > 0 ? { tools: ferramentas, tool_choice: 'auto' } : {}),
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
      choices?: {
        finish_reason?: string;
        message?: {
          content?: string | null;
          tool_calls?: ChamadaDeFerramenta[];
          /** O que o Groq executou do lado dele — hoje, so a busca. */
          executed_tools?: { type?: string }[];
        };
      }[];
    };

    const escolha = dados.choices?.[0];
    const mensagem = escolha?.message;

    if (!mensagem) {
      console.error('[assistente] groq devolveu resposta sem choices');
      return { ok: false, motivo: 'falha' };
    }

    /**
     * `content` vazio NAO e mais erro.
     *
     * Quando o modelo pede uma ferramenta, `content` vem nulo e a informacao
     * toda esta em `tool_calls` — era esse o caso que a versao anterior
     * classificava como "resposta vazia" e transformava em 502. Quem decide se
     * faltou texto e o laco, que sabe se ainda ha rodada pela frente.
     */
    return {
      ok: true,
      mensagem: {
        role: 'assistant',
        content: mensagem.content ?? null,
        ...(mensagem.tool_calls?.length ? { tool_calls: mensagem.tool_calls } : {}),
      },
      motivoDeParada: escolha.finish_reason ?? 'stop',
      modelo: dados.model ?? MODELO,
      buscou: (mensagem.executed_tools ?? []).length > 0,
    };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === 'AbortError';
    // Nao registramos o corpo da pergunta: e dado de saude, e os logs da
    // Vercel ficam fora do Brasil. So o tipo do erro.
    console.error('[assistente] falha ao chamar o groq', {
      name: erro instanceof Error ? erro.name : 'unknown',
    });
    return { ok: false, motivo: abortou ? 'tempo' : 'falha' };
  } finally {
    clearTimeout(timer);
  }
}
