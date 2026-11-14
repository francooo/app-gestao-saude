import { useQuery } from '@tanstack/react-query';
import { healthApi } from '@gestao/shared/api/health';
import { blocosDoPeriodo, juntarBlocos } from '@gestao/shared/lib/relatorio';

/**
 * Os dados do relatorio de uma pessoa num periodo.
 *
 * So chamadas que ja existem. Os remedios vem em blocos de ate 31 dias (o teto
 * da API), e as doses de cada bloco sao juntadas por remedio. Chave propria,
 * fora da raiz 'remedios': marcar uma dose em outra tela nao precisa mexer
 * nesta copia, que e uma foto do periodo para o papel.
 */
export function useDadosDoRelatorio(perfilId: string | null, inicio: Date, fim: Date, valido: boolean) {
  return useQuery({
    queryKey: ['relatorio', { perfilId, inicio: inicio.toISOString(), fim: fim.toISOString() }],
    enabled: Boolean(perfilId) && valido,
    // O relatorio e consultado, nao editado: nao precisa refazer a cada foco.
    staleTime: 60_000,
    queryFn: async () => {
      const id = perfilId!;
      const blocos = blocosDoPeriodo(inicio, fim);
      // Remedios e sintomas tem o mesmo teto de 31 dias no servidor.
      const [ficha, remedios, sintomas, consultas] = await Promise.all([
        healthApi.getProfile(id),
        Promise.all(
          blocos.map((b) =>
            healthApi.listMedications({ from: b.de, to: b.ate, profileId: id, includeInactive: true }),
          ),
        ),
        Promise.all(blocos.map((b) => healthApi.listSymptoms({ profileId: id, from: b.de, to: b.ate }))),
        healthApi.listAppointments({ profileId: id }),
      ]);
      const vistos = new Set<string>();
      return {
        perfil: ficha.profile,
        remedios: juntarBlocos(remedios),
        sintomas: sintomas.flat().filter((s) => !vistos.has(s.id) && vistos.add(s.id)),
        consultas,
      };
    },
  });
}
