import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR, resumoDoRelatorioSchema } from '../../contracts';
import { requireAuth } from '../../lib/auth';
import { perguntarAoGroq } from '../../lib/groq';
import { fail, json, parseBody, requireMethod, withErrorHandling } from '../../lib/http';
import { exigirPremium } from '../../lib/plano';

/**
 * O resumo do relatorio para o medico.
 *
 * O relatorio em si e GRATIS e e montado no aparelho; esta rota so escreve o
 * paragrafo do topo, e e o que a assinatura acrescenta. Recebe o texto ja
 * montado (`dadosParaResumo`, no shared) — primeiro nome, idade e os numeros
 * do periodo, sem foto nem contato.
 *
 * NAO GRAVA NADA, e nao diagnostica: o texto de sistema manda descrever o que
 * os registros mostram, sem sugerir causa, remedio ou dose. Quem le e o
 * medico, que tem os numeros logo abaixo para conferir.
 *
 * Sem teto diario proprio, como a posologia (ver aquele handler): protegem a
 * rota o login, a assinatura, o tamanho maximo da entrada e o rate-limit do
 * Groq. Mora sob /api/assistant por falta de vaga (12/12 funcoes).
 */

const PRAZO_MS = 25_000;

const PROMPT = `Você escreve o parágrafo de abertura de um relatório de saúde que uma família vai levar ao médico.

Recebe os registros de um período: remédios com doses previstas, tomadas e puladas, sintomas anotados e consultas.

Regras:
- Escreva em português do Brasil, em até 5 frases curtas, em texto corrido, sem listas, sem títulos e sem markdown.
- Descreva só o que os registros mostram: adesão aos remédios (cite os números e os remédios com mais doses sem registro), sintomas mais frequentes ou mais fortes, e mudanças ao longo do período.
- NÃO faça diagnóstico, NÃO sugira causa, NÃO recomende remédio, dose ou conduta, e NÃO diga se algo é grave.
- Doses "sem registro" significam que ninguém anotou no aplicativo; não afirme que a pessoa deixou de tomar.
- Se houver poucos dados, diga isso em uma frase.
- Use o primeiro nome da pessoa.`;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;
  // Recurso de IA: so com assinatura ou teste gratis vigente (lib/plano.ts).
  if (!(await exigirPremium(res, auth.userId))) return;

  const body = parseBody(res, resumoDoRelatorioSchema, req.body);
  if (!body) return;

  const resposta = await perguntarAoGroq(
    [
      { role: 'system', content: PROMPT },
      { role: 'user', content: body.dados },
    ],
    { timeoutMs: PRAZO_MS, tetoDeSaida: 600 },
  );

  if (!resposta.ok) {
    if (resposta.motivo === 'limite' || resposta.motivo === 'tempo') {
      return fail(res, 503, API_ERROR.REPORT_SUMMARY_BUSY);
    }
    return fail(res, 502, API_ERROR.REPORT_SUMMARY_FAILED);
  }

  const resumo = limpar(resposta.mensagem.content ?? '');
  if (resumo.length < 20) return fail(res, 502, API_ERROR.REPORT_SUMMARY_FAILED);

  return json(res, 200, { resumo });
});

/** Tira o markdown que o modelo insistir em usar e corta o excesso. */
function limpar(texto: string): string {
  return texto
    .replace(/\*\*|__|`|^#+\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1500);
}
