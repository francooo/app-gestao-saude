import { blocosDoPeriodo, juntarBlocos } from '@gestao/shared/lib/relatorio';

import { healthApi } from '@/api/health';

/**
 * Os dados do relatorio para o medico, no aplicativo.
 *
 * As mesmas chamadas da web (apps/web/src/api/relatorio.ts): remedios,
 * sintomas e medicoes em blocos de ate 31 dias, o teto da API, juntados por id. As
 * contas e o HTML do PDF ficam no shared (@gestao/shared/lib/relatorio).
 */
export async function carregarDadosDoRelatorio(perfilId: string, inicio: Date, fim: Date) {
  const blocos = blocosDoPeriodo(inicio, fim);
  const [ficha, remedios, sintomas, medicoes, consultas] = await Promise.all([
    healthApi.getProfile(perfilId),
    Promise.all(
      blocos.map((b) =>
        healthApi.listMedications({ from: b.de, to: b.ate, profileId: perfilId, includeInactive: true }),
      ),
    ),
    Promise.all(blocos.map((b) => healthApi.listSymptoms({ profileId: perfilId, from: b.de, to: b.ate }))),
    Promise.all(blocos.map((b) => healthApi.listMeasurements({ profileId: perfilId, from: b.de, to: b.ate }))),
    healthApi.listAppointments({ profileId: perfilId }),
  ]);

  const vistos = new Set<string>();
  const medidas = new Set<string>();
  return {
    perfil: ficha.profile,
    remedios: juntarBlocos(remedios),
    sintomas: sintomas.flat().filter((s) => !vistos.has(s.id) && vistos.add(s.id)),
    medicoes: medicoes.flat().filter((m) => !medidas.has(m.id) && medidas.add(m.id)),
    consultas,
  };
}

export type DadosDoRelatorio = Awaited<ReturnType<typeof carregarDadosDoRelatorio>>;
