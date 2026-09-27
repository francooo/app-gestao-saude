/**
 * Chamada ao Groq, por fetch puro.
 *
 * Sem SDK, no mesmo padrao de email.ts (Resend) e geocoding.ts (MapTiler): o
 * corpo e JSON simples e apps/api tem so cinco dependencias de runtime, o que
 * vale preservar.
 *
 * SAO DOIS MODELOS, com papeis que nao se misturam, e ambos foram escolhidos
 * pelo que a CONTA enxerga e nao pelo catalogo: os Llama aparecem na
 * documentacao mas nao estao ativos aqui, e os `compound` respondem 404.
 *
 * - MODELO (gpt-oss-120b) responde o assistente. Dos disponiveis com contexto
 *   grande e o mais capaz, e e ele quem aceita `browser_search` como
 *   ferramenta de servidor, que e o que da internet ao assistente.
 *   E TEXTO PURO: mandar `content` em array devolve 400 "messages[0].content
 *   must be a string". Isso foi MEDIDO, nao suposto.
 *
 * - MODELO_DE_VISAO (qwen3.8-27b) le as fotos de receita e de caixa. E o
 *   UNICO multimodal que esta conta enxerga hoje, e nao ha segundo para cair
 *   em cima se ele sair, como os Llama sairam.
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

/** Le imagem. Ver o cabecalho: nao ha alternativa nesta conta. */
export const MODELO_DE_VISAO = 'qwen/qwen3.8-27b';

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

/** Conteudo multimodal. So a mensagem do usuario aceita esta forma. */
export type ParteDeConteudo =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * `system` e `user` NAO compartilham mais o mesmo membro da uniao, e isso nao
 * e arrumacao: so `user` aceita array. E o 400 medido do gpt-oss-120b
 * codificado no tipo, de modo que mandar imagem num `system` nao compile.
 */
export type MensagemGroq =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ParteDeConteudo[] }
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
  | { ok: false; motivo: 'indisponivel' | 'modelo' | 'falha' | 'tempo' | 'limite' };

type Opcoes = {
  /** Declaracoes de ferramenta. Lista vazia = proibido pedir ferramenta. */
  ferramentas?: readonly unknown[];
  /** Orcamento desta rodada, em ms. Quem controla e o laco. */
  timeoutMs: number;
  /**
   * Os quatro abaixo sao opcionais, e o default reproduz o corpo de antes
   * BYTE A BYTE. E o que permite mexer neste arquivo sem mudar em nada o
   * comportamento do assistente, que ja funciona.
   */
  modelo?: string;
  tetoDeSaida?: number;
  /** `null` REMOVE o campo do corpo: nem todo modelo aceita reasoning_effort. */
  esforco?: 'low' | 'medium' | 'high' | null;
  /** response_format, para quem precisa de JSON e nao de prosa. */
  formatoDeResposta?: unknown;
};

export async function perguntarAoGroq(
  mensagens: MensagemGroq[],
  opcoes: Opcoes,
): Promise<RespostaGroq> {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) {
    // Faltar a variavel e erro de implantacao, nao do usuario. Registrar alto:
    // sem isto o sintoma na tela ("nao consegui responder") nao aponta a causa.
    console.error('[groq] GROQ_API_KEY ausente no ambiente');
    return { ok: false, motivo: 'indisponivel' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs);

  const ferramentas = opcoes.ferramentas ?? [];
  const esforco = opcoes.esforco === undefined ? 'low' : opcoes.esforco;

  try {
    const r = await fetch(URL_GROQ, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opcoes.modelo ?? MODELO,
        messages: mensagens,
        // Baixa de proposito: em saude, variar a redacao nao agrega e variar o
        // numero e perigoso.
        temperature: 0.2,
        max_completion_tokens: opcoes.tetoDeSaida ?? TETO_DE_SAIDA,
        // `esforco: null` tira o campo; ausente mantem o 'low' de sempre.
        ...(esforco === null ? {} : { reasoning_effort: esforco }),
        ...(opcoes.formatoDeResposta ? { response_format: opcoes.formatoDeResposta } : {}),
        // Lista vazia sai do corpo: mandar `tools: []` e um erro 400 na API, e
        // a ultima rodada do laco chama justamente assim, sem ferramenta.
        ...(ferramentas.length > 0 ? { tools: ferramentas, tool_choice: 'auto' } : {}),
      }),
      signal: controller.signal,
    });

    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      // Prefixo `[groq]` e nao `[assistente]`: este arquivo agora tambem serve
      // a leitura de foto, e o prefixo antigo mandaria quem investiga procurar
      // no lugar errado.
      console.error('[groq] respondeu', r.status, corpo.slice(0, 300), {
        // Quanto falta do minuto. E a informacao que explica o 429.
        resetTokens: r.headers.get('x-ratelimit-reset-tokens'),
        restamTokens: r.headers.get('x-ratelimit-remaining-tokens'),
      });

      /**
       * 429 e um caso a parte, e nesta conta e o erro MAIS PROVAVEL de todos.
       *
       * OS NUMEROS, MEDIDOS contra a API e nao estimados. Sao DOIS baldes, e
       * ambos sao POR MODELO — o assistente e a leitura de foto nao disputam:
       *   x-ratelimit-limit-tokens: 8000  (total por minuto)
       *   ITPM: Limit 7000                (so a ENTRADA, e e este que estoura)
       *
       * Uma pergunta com busca gasta de 5 000 a 40 000: uma unica busca pode
       * estourar o minuto sozinha. Uma foto consome ~850 de entrada reais, mas
       * o limitador COBRA ~2 300 por ela — cabem cerca de tres por minuto.
       *
       * Nao ha retentativa aqui de proposito, e a medicao reforcou: o
       * `x-ratelimit-reset-tokens` pediu de 17 a 20 s, e `retry-after` nem vem
       * no cabecalho. Esperar isso estouraria o prazo da rota e trocaria um
       * erro claro por um tempo esgotado. Melhor dizer a verdade rapido e
       * deixar a retentativa com a pessoa, num botao.
       */
      if (r.status === 429) return { ok: false, motivo: 'limite' };

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
      console.error('[groq] devolveu resposta sem choices');
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
    console.error('[groq] falha ao chamar', {
      name: erro instanceof Error ? erro.name : 'unknown',
    });
    return { ok: false, motivo: abortou ? 'tempo' : 'falha' };
  } finally {
    clearTimeout(timer);
  }
}
