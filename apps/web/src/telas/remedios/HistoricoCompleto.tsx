import { useInfiniteQuery } from '@tanstack/react-query';
import { healthApi, type DoseDoHistorico } from '@gestao/shared/api/health';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { CHAVES } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { FilterChips } from '@/ui/FilterChips';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import {
  CHIPS_DE_PERIODO,
  LinhaDoHistorico,
  ResumoDoHistorico,
  desdeDoPeriodo,
  type Periodo,
} from './HistoricoDeDoses';
import estilos from './HistoricoCompleto.module.css';
import comuns from './remedios.module.css';

const POR_PAGINA = 30;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

type Grupo = { chave: string; titulo: string; doses: DoseDoHistorico[] };

/** Agrupa as doses (que ja vem da mais nova para a mais antiga) por mes. */
function porMes(doses: DoseDoHistorico[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const d of doses) {
    const iso = d.takenAt ?? d.scheduledFor;
    const data = iso ? new Date(iso) : null;
    const chave = data ? `${data.getFullYear()}-${data.getMonth()}` : 'sem-data';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.doses.push(d);
    else {
      grupos.push({
        chave,
        titulo: data ? `${MESES[data.getMonth()]} de ${data.getFullYear()}` : 'Sem data',
        doses: [d],
      });
    }
  }
  return grupos;
}

/**
 * O historico inteiro de um remedio, mes a mes, em paginas de 30 doses.
 *
 * No aplicativo a proxima pagina chega sozinha ao rolar. Aqui e um botao
 * "Carregar mais": numa pagina web, rolagem que nunca termina esconde o fim da
 * lista de quem navega pelo teclado.
 */
export function HistoricoCompleto() {
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const nome = params.get('nome');
  const inicial = params.get('periodo');
  const [periodo, setPeriodo] = useState<Periodo>(
    inicial === '30' || inicial === '7' ? inicial : 'tudo',
  );

  const consulta = useInfiniteQuery({
    queryKey: [...CHAVES.historico(id), 'completo', { periodo }],
    queryFn: ({ pageParam }) =>
      healthApi.historicoDoRemedio(id, {
        desde: desdeDoPeriodo(periodo),
        antes: pageParam,
        limite: POR_PAGINA,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.proximo ?? undefined,
    enabled: Boolean(id),
  });

  const paginas = consulta.data?.pages ?? [];
  const resumo = paginas[0]?.resumo;
  const grupos = porMes(paginas.flatMap((p) => p.doses));
  const agora = new Date();

  return (
    <Pagina area="medications">
      <ScreenHeader
        title={nome ? `Histórico de ${nome}` : 'Histórico de doses'}
        voltar={id ? `/remedios/${id}` : '/remedios'}
      />

      <div className={comuns.bloco}>
        <FilterChips
          rotulo="Período"
          chips={CHIPS_DE_PERIODO}
          selected={periodo === 'tudo' ? null : periodo}
          onSelect={(v) => setPeriodo((v ?? 'tudo') as Periodo)}
        />
      </div>

      {!id ? (
        <div className={comuns.bloco}>
          <Aviso icone="alert-circle" erro>
            Remédio não encontrado.
          </Aviso>
        </div>
      ) : consulta.isPending ? (
        <Carregando />
      ) : consulta.isError && paginas.length === 0 ? (
        <div className={comuns.bloco}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void consulta.refetch() }}
          >
            {mensagemDoErro(consulta.error)}
          </Aviso>
        </div>
      ) : (
        <>
          {resumo ? (
            <SurfaceCard className={`${comuns.cartao} ${comuns.bloco} ${estilos.resumo}`}>
              <ResumoDoHistorico resumo={resumo} periodo={periodo} />
            </SurfaceCard>
          ) : null}

          {grupos.length === 0 ? (
            <p className={estilos.vazio}>
              {periodo === 'tudo'
                ? 'Nenhuma dose registrada ainda.'
                : 'Nenhuma dose registrada neste período.'}
            </p>
          ) : (
            grupos.map((g) => (
              <section key={g.chave}>
                <h2 className={estilos.mes}>{g.titulo}</h2>
                <ul className={estilos.lista}>
                  {g.doses.map((d) => (
                    <LinhaDoHistorico key={d.id} dose={d} agora={agora} idAtual={id} />
                  ))}
                </ul>
              </section>
            ))
          )}

          {consulta.hasNextPage ? (
            <div className={estilos.mais}>
              <button
                type="button"
                className={botoes.contorno}
                disabled={consulta.isFetchingNextPage}
                onClick={() => void consulta.fetchNextPage()}
              >
                {consulta.isFetchingNextPage ? <span className={botoes.girando} /> : null}
                Carregar mais doses
              </button>
              {consulta.isFetchNextPageError ? (
                <p className={estilos.erro} role="alert">
                  Não consegui carregar mais doses.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Pagina>
  );
}
