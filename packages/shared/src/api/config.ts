/**
 * Prazos das requisicoes, iguais em todas as plataformas.
 *
 * As razoes de cada numero estao comentadas em apps/mobile/src/config.ts, de
 * onde vieram. O resumo da cadeia, que e o que nao pode ser quebrado:
 *
 *   trabalho no servidor  <  maxDuration da Vercel (60 s)  <  prazo do cliente
 *
 * Se o cliente desistir antes do servidor, a pessoa ve erro para algo que foi
 * gravado e reenvia.
 */

/** Requisicoes que passarem disso sao abortadas — a rede pode travar sem erro. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Perguntas ao assistente: ele busca e consulta em rodadas. */
export const ASSISTANT_TIMEOUT_MS = 75_000;

/** Envio da foto da receita ou da caixa junto do medicamento. */
export const ANEXO_TIMEOUT_MS = 45_000;

/** Leitura de receita ou de caixa por foto: subida mais inferencia do modelo. */
export const LEITURA_TIMEOUT_MS = 90_000;
