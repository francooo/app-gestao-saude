import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR, posologiaTextoSchema } from '../../contracts';
import { requireAuth } from '../../lib/auth';
import { perguntarAoGroq } from '../../lib/groq';
import { fail, json, parseBody, requireMethod, withErrorHandling } from '../../lib/http';
import { extrairJson } from '../../lib/leitura-de-foto';
import {
  ESQUEMA_POSOLOGIA,
  PROMPT_POSOLOGIA,
  proporPosologia,
} from '../../lib/posologia-proposta';

/**
 * "Descreva como tomar": converte uma frase livre em posologia.
 *
 * SO PROPOE, NAO GRAVA. Devolve os campos para o formulario preencher com o
 * selo "da IA", e quem salva e a pessoa, depois de conferir — o mesmo contrato
 * da leitura de foto, pelo mesmo motivo: o modelo erra calado.
 *
 * Mora sob /api/assistant por falta de vaga (12/12 funcoes na Vercel), nao
 * porque seja o assistente. Usa o modelo de TEXTO do Groq; o de visao nao e
 * necessario.
 *
 * SEM TETO DIARIO PROPRIO, por enquanto, e de proposito: contar exigiria uma
 * tabela nova so para isto. Protegem a rota o login, o limite de 500
 * caracteres e o proprio rate-limit do Groq (429 → POSOLOGY_BUSY). Se o uso
 * crescer, o teto entra junto com uma tabela de auditoria.
 */

/** Uma chamada so, sem laco: volta em segundos ou esta travada. */
const PRAZO_MS = 20_000;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const body = parseBody(res, posologiaTextoSchema, req.body);
  if (!body) return;

  const resposta = await perguntarAoGroq(
    [
      { role: 'system', content: PROMPT_POSOLOGIA },
      {
        role: 'user',
        content: body.forma ? `Forma do remédio: ${body.forma}.\n\n${body.texto}` : body.texto,
      },
    ],
    { timeoutMs: PRAZO_MS, tetoDeSaida: 500, formatoDeResposta: ESQUEMA_POSOLOGIA },
  );

  if (!resposta.ok) {
    if (resposta.motivo === 'limite' || resposta.motivo === 'tempo') {
      return fail(res, 503, API_ERROR.POSOLOGY_BUSY);
    }
    return fail(res, 502, API_ERROR.POSOLOGY_FAILED);
  }
  if (resposta.motivoDeParada === 'length') return fail(res, 502, API_ERROR.POSOLOGY_FAILED);

  const bruto = extrairJson(resposta.mensagem.content ?? '') as Record<string, unknown> | null;
  if (!bruto || typeof bruto !== 'object') return fail(res, 502, API_ERROR.POSOLOGY_FAILED);

  const posologia = proporPosologia(bruto);
  const dose = numero(bruto.dose_por_vez, 9999);
  const dias = inteiro(bruto.duracao_dias, 1, 365);
  const orientacoes =
    typeof bruto.orientacoes === 'string' && bruto.orientacoes.trim()
      ? bruto.orientacoes.trim().slice(0, 1000)
      : null;

  // Nada aproveitavel: melhor dizer "nao entendi" do que preencher vazio e
  // parecer que funcionou.
  if (!posologia.scheduleType && dose == null && dias == null) {
    return fail(res, 422, API_ERROR.POSOLOGY_FAILED);
  }

  return json(res, 200, {
    proposta: {
      ...posologia,
      doseAmount: dose,
      // O servidor nao converte dias em data: so o aparelho sabe que dia e hoje.
      durationDays: dias,
      instructions: orientacoes,
    },
  });
});

function inteiro(v: unknown, minimo: number, maximo: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= minimo && n <= maximo ? n : null;
}

function numero(v: unknown, maximo: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > maximo) return null;
  return v;
}
