/**
 * O laco do agente.
 *
 * Pergunta ao modelo; se ele pedir ferramenta, executa contra o banco, devolve
 * o resultado e pergunta de novo. Para quando ele responde em texto.
 *
 * TRES FREIOS, e cada um existe por um motivo diferente:
 *
 * - TETO DE RODADAS. Um modelo confuso pede ferramenta indefinidamente. Sem
 *   teto isso nao termina sozinho: termina quando a Vercel corta a funcao, e
 *   ai a pessoa ve erro de rede depois de um minuto olhando tres pontinhos.
 *
 * - ORCAMENTO DE TEMPO. O teto de rodadas nao segura latencia: uma unica
 *   rodada com busca pode levar 15 s sozinha. O laco carrega um prazo final e
 *   passa o que SOBRA dele para cada chamada, em vez de dar 45 s a todas.
 *
 * - ULTIMA RODADA SEM FERRAMENTA. Chegando ao teto, a chamada final vai sem
 *   `tools`, o que obriga o modelo a escrever texto. E o que evita o pior
 *   desfecho possivel: gastar quatro rodadas e nao ter nada para mostrar.
 */

import { executarFerramenta, FERRAMENTAS } from './assistente-ferramentas';
import {
  BUSCA_NA_INTERNET,
  perguntarAoGroq,
  type MensagemGroq,
  type RespostaGroq,
} from './groq';

/** Chamadas ao modelo, contando a ultima. */
const MAXIMO_DE_RODADAS = 4;

/**
 * Prazo total do laco.
 *
 * Fica ABAIXO do maxDuration de 60 s da rota: estourando aqui, o erro e nosso
 * e chega legivel ao aplicativo; estourando la, vira um 504 cru que o cliente
 * nao sabe traduzir.
 */
const PRAZO_TOTAL_MS = 45_000;

/** Menos que isto nao da para uma rodada util — melhor encerrar com o que ha. */
const SOBRA_MINIMA_MS = 4_000;

/** Quanto de argumento entra no rastro. O resto seria volume sem ganho. */
const ARGUMENTO_NO_RASTRO = 300;

export type RastroDeFerramenta = { nome: string; argumentos: string };

export type Rastro = {
  rodadas: number;
  ferramentas: RastroDeFerramenta[];
  buscou: boolean;
  /** Parou por teto de rodadas ou de tempo, e nao porque terminou de pensar. */
  truncado: boolean;
};

export type ResultadoDoLaco =
  | { ok: true; texto: string; modelo: string; rastro: Rastro }
  | { ok: false; motivo: 'indisponivel' | 'modelo' | 'falha' | 'tempo' | 'limite' };

export async function rodarLaco(opcoes: {
  mensagens: MensagemGroq[];
  userId: string;
  /** Falso quando o teto diario de buscas ja foi atingido. */
  podeBuscar: boolean;
}): Promise<ResultadoDoLaco> {
  const fim = Date.now() + PRAZO_TOTAL_MS;
  const mensagens = [...opcoes.mensagens];

  const disponiveis = opcoes.podeBuscar ? [...FERRAMENTAS, BUSCA_NA_INTERNET] : [...FERRAMENTAS];

  const rastro: Rastro = { rodadas: 0, ferramentas: [], buscou: false, truncado: false };
  let modelo = '';
  let ultimaFalha: RespostaGroq & { ok: false } = { ok: false, motivo: 'falha' };

  for (let rodada = 1; rodada <= MAXIMO_DE_RODADAS; rodada += 1) {
    const sobra = fim - Date.now();
    if (sobra < SOBRA_MINIMA_MS) {
      rastro.truncado = true;
      // Acabou o tempo no meio das ferramentas. E 'tempo', nao 'falha': a
      // mensagem que a pessoa le muda — vale reformular a pergunta, nao repetir.
      ultimaFalha = { ok: false, motivo: 'tempo' };
      break;
    }

    // Na ultima rodada as ferramentas somem: e o que obriga o texto a sair.
    const ultima = rodada === MAXIMO_DE_RODADAS;
    if (ultima) rastro.truncado = true;

    const resposta = await perguntarAoGroq(mensagens, {
      ferramentas: ultima ? [] : disponiveis,
      timeoutMs: sobra,
    });

    rastro.rodadas = rodada;

    if (!resposta.ok) {
      ultimaFalha = resposta;
      break;
    }

    modelo = resposta.modelo;
    if (resposta.buscou) rastro.buscou = true;

    const pedidos = resposta.mensagem.tool_calls ?? [];
    const texto = resposta.mensagem.content?.trim();

    // Sem pedido de ferramenta, acabou: o que veio e a resposta.
    if (pedidos.length === 0) {
      if (texto) {
        // Truncado so continua verdadeiro se paramos antes do modelo terminar.
        if (!ultima) rastro.truncado = false;
        return { ok: true, texto, modelo, rastro };
      }
      // Texto vazio sem pedido de ferramenta e resposta perdida de verdade.
      break;
    }

    // A mensagem do assistente com os pedidos precisa entrar no historico
    // ANTES dos resultados: a API recusa um `tool` que nao responda a um
    // `tool_calls` imediatamente anterior.
    mensagens.push(resposta.mensagem);

    const resultados = await Promise.all(
      pedidos.map(async (pedido) => {
        rastro.ferramentas.push({
          nome: pedido.function.name,
          argumentos: pedido.function.arguments.slice(0, ARGUMENTO_NO_RASTRO),
        });

        return {
          role: 'tool' as const,
          tool_call_id: pedido.id,
          content: await executarFerramenta(
            pedido.function.name,
            pedido.function.arguments,
            opcoes.userId,
          ),
        };
      }),
    );

    mensagens.push(...resultados);
  }

  return ultimaFalha;
}
