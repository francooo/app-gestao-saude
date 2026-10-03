/**
 * Chamada ao Claude (Anthropic), por fetch puro — leitura de FOTO (receita/caixa).
 *
 * Mesma filosofia do groq.ts: sem SDK, UMA chamada só, e devolve o resultado no
 * MESMO formato (`RespostaGroq`) para a rota ler-foto não precisar saber qual
 * provedor respondeu. O ASSISTENTE continua no Groq; só a VISÃO veio para cá, por
 * dois motivos que importam numa foto de receita (paciente, CRM, diagnóstico): o
 * OCR é melhor e a API da Anthropic NÃO treina com os dados.
 *
 * A saída estruturada vem por TOOL USE: o modelo é obrigado (tool_choice) a
 * chamar uma ferramenta cujo `input_schema` é o esquema do cadastro, e devolve
 * os dados já no formato certo, no `input` da ferramenta. É mais confiável que
 * pedir "responda em JSON" em prosa.
 */
import type { RespostaGroq } from './groq';

const URL_CLAUDE = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

/** Sonnet atual. Constante para trocar por Haiku 4.5 se o custo pesar. */
export const MODELO_DE_VISAO_CLAUDE = 'claude-sonnet-5-5';

/** Teto de saída: o JSON do cadastro é pequeno; cabe folgado em 900. */
const TETO_DE_SAIDA = 900;

const NOME_DA_FERRAMENTA = 'registrar_leitura';

type Entrada = {
  /** Vai como `system`. */
  prompt: string;
  /** O texto que acompanha a imagem na mensagem do usuário. */
  instrucao: string;
  /** Data URI JPEG vindo do app (`data:image/jpeg;base64,...`). */
  fotoDataUri: string;
  /** Orçamento desta chamada, em ms. */
  timeoutMs: number;
  /** JSON Schema do cadastro — vira o `input_schema` da ferramenta. */
  inputSchema: unknown;
};

export async function lerFotoComClaude(entrada: Entrada): Promise<RespostaGroq> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    // Faltar a variável é erro de implantação, não do usuário. Registrar alto.
    console.error('[claude] ANTHROPIC_API_KEY ausente no ambiente');
    return { ok: false, motivo: 'indisponivel' };
  }

  // A Anthropic quer o base64 CRU + o media_type à parte; o data URI do app traz
  // o prefixo `data:image/jpeg;base64,` que precisa sair.
  const base64 = entrada.fotoDataUri.replace(/^data:[^;]+;base64,/, '');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), entrada.timeoutMs);

  try {
    const r = await fetch(URL_CLAUDE, {
      method: 'POST',
      headers: {
        'x-api-key': chave,
        'anthropic-version': VERSAO_API,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO_DE_VISAO_CLAUDE,
        max_tokens: TETO_DE_SAIDA,
        // Baixa de propósito: em saúde, variar número é perigoso.
        temperature: 0.2,
        system: entrada.prompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
              },
              { type: 'text', text: entrada.instrucao },
            ],
          },
        ],
        tools: [
          {
            name: NOME_DA_FERRAMENTA,
            description: 'Registra os medicamentos e dados lidos da foto.',
            input_schema: entrada.inputSchema,
          },
        ],
        // Obriga a chamar a ferramenta: a resposta vem como tool_use, não prosa.
        tool_choice: { type: 'tool', name: NOME_DA_FERRAMENTA },
      }),
      signal: controller.signal,
    });

    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      console.error('[claude] respondeu', r.status, corpo.slice(0, 300));
      // 429 (rate limit) e 529 (overloaded) são "tente de novo em instantes".
      if (r.status === 429 || r.status === 529) return { ok: false, motivo: 'limite' };
      // Chave inválida/sem crédito é erro de implantação, não do usuário.
      if (r.status === 401 || r.status === 403) return { ok: false, motivo: 'indisponivel' };
      return { ok: false, motivo: 'falha' };
    }

    const dados = (await r.json()) as {
      model?: string;
      stop_reason?: string;
      content?: { type: string; input?: unknown }[];
    };

    const bloco = (dados.content ?? []).find((b) => b.type === 'tool_use');
    if (!bloco || bloco.input === undefined) {
      console.error('[claude] resposta sem bloco tool_use', { stop: dados.stop_reason });
      return { ok: false, motivo: 'falha' };
    }

    return {
      ok: true,
      // O mapeador a jusante faz JSON.parse do `content`; entregamos o input da
      // ferramenta serializado para reaproveitar extrairJson/mapearLeitura.
      mensagem: { role: 'assistant', content: JSON.stringify(bloco.input) },
      // 'max_tokens' significa JSON possivelmente cortado — ler-foto trata
      // 'length' como falha, que é o que queremos aqui.
      motivoDeParada: dados.stop_reason === 'max_tokens' ? 'length' : (dados.stop_reason ?? 'stop'),
      modelo: dados.model ?? MODELO_DE_VISAO_CLAUDE,
      buscou: false,
    };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === 'AbortError';
    // Não registramos o corpo: é dado de saúde. Só o tipo do erro.
    console.error('[claude] falha ao chamar', {
      name: erro instanceof Error ? erro.name : 'unknown',
    });
    return { ok: false, motivo: abortou ? 'tempo' : 'falha' };
  } finally {
    clearTimeout(timer);
  }
}
