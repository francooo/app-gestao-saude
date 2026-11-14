import { useQuery } from '@tanstack/react-query';
import {
  healthApi,
  type DoseDoHistorico,
  type HistoricoDeDoses as Historico,
} from '@gestao/shared/api/health';
import { hora } from '@gestao/shared/lib/posologia';
import { isSameDay, isYesterday } from 'date-fns';
import { useState } from 'react';
import { Link } from 'react-router';

import { CHAVES } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { Carregando } from '@/ui/Carregando';
import { FilterChips } from '@/ui/FilterChips';
import { Icone } from '@/ui/Icone';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './HistoricoDeDoses.module.css';

export type Periodo = 'tudo' | '30' | '7';

export const CHIPS_DE_PERIODO = [
  { value: null, label: 'Tudo' },
  { value: '30', label: '30 dias' },
  { value: '7', label: '7 dias' },
];

/** O inicio do periodo, a meia-noite local de (hoje - N + 1). */
export function desdeDoPeriodo(p: Periodo): string | undefined {
  if (p === 'tudo') return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (Number(p) - 1));
  return d.toISOString();
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dataPorExtenso(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function diaDaDose(d: Date, agora: Date): string {
  if (isSameDay(d, agora)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === agora.getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${d.getFullYear()}`;
}

function vezes(n: number): string {
  if (n === 0) return 'Nenhuma dose tomada';
  return n === 1 ? 'Tomou 1 vez' : `Tomou ${n} vezes`;
}

export function ResumoDoHistorico({
  resumo,
  periodo,
}: {
  resumo: Historico['resumo'];
  periodo: Periodo;
}) {
  const detalhes: string[] = [];
  if (resumo.puladas > 0) {
    detalhes.push(resumo.puladas === 1 ? '1 pulada' : `${resumo.puladas} puladas`);
  }
  if (resumo.primeira && periodo === 'tudo') {
    detalhes.push(`desde ${dataPorExtenso(new Date(resumo.primeira))}`);
  }
  if (periodo !== 'tudo') detalhes.push(`nos últimos ${periodo} dias`);
  if (resumo.tratamentos > 1) detalhes.push(`somando ${resumo.tratamentos} tratamentos`);

  return (
    <div className={estilos.resumo}>
      <span className={estilos.resumoIcone} aria-hidden="true">
        <Icone nome="check-circle" size={22} />
      </span>
      <div className={estilos.textos}>
        <p className={estilos.resumoTitulo}>{vezes(resumo.tomadas)}</p>
        {detalhes.length ? <p className={estilos.ajuda}>{detalhes.join(' · ')}</p> : null}
      </div>
    </div>
  );
}

export function LinhaDoHistorico({
  dose,
  agora,
  idAtual,
}: {
  dose: DoseDoHistorico;
  agora: Date;
  /** O cadastro aberto: dose de outro cadastro e de um "tratamento anterior". */
  idAtual: string;
}) {
  const pulada = dose.status === 'pulada';
  const instante = dose.takenAt ?? dose.scheduledFor;
  const data = instante ? new Date(instante) : null;
  const texto = data ? `${diaDaDose(data, agora)} às ${hora(data)}` : 'Sem data';
  const extra = [
    pulada ? 'pulada' : null,
    dose.medicationId !== idAtual ? 'tratamento anterior' : null,
  ].filter(Boolean);

  return (
    <li className={estilos.dose}>
      <span className={estilos.doseMarca} data-pulada={pulada ? '' : undefined} aria-hidden="true">
        <Icone nome={pulada ? 'minus' : 'check'} size={14} />
      </span>
      <div className={estilos.textos}>
        <p className={estilos.doseTexto}>
          {texto}
          {pulada ? null : <span className="so-leitor-de-tela">, tomada</span>}
        </p>
        {extra.length ? <p className={estilos.ajuda}>{extra.join(' · ')}</p> : null}
      </div>
    </li>
  );
}

/** Quantas doses a secao do detalhe mostra antes de oferecer o historico completo. */
const NA_SECAO = 8;

/**
 * Secao "Historico de doses" do detalhe: a contagem do periodo e as ultimas
 * doses. A contagem vem do servidor; marcar ou desfazer uma dose invalida a
 * consulta (a chave comeca pela do remedio), e ela acompanha o botao de dose.
 */
export function HistoricoDeDoses({ medicationId, nome }: { medicationId: string; nome: string }) {
  const [periodo, setPeriodo] = useState<Periodo>('tudo');

  const consulta = useQuery({
    queryKey: [...CHAVES.historico(medicationId), { periodo, limite: NA_SECAO }],
    queryFn: () =>
      healthApi.historicoDoRemedio(medicationId, {
        desde: desdeDoPeriodo(periodo),
        limite: NA_SECAO,
      }),
    placeholderData: (anterior) => anterior,
  });

  const dados = consulta.data;
  const agora = new Date();
  const completo = `/remedios/historico?id=${medicationId}&periodo=${periodo}&nome=${encodeURIComponent(nome)}`;

  return (
    <section className={estilos.secao}>
      <SectionHeader
        title="Histórico de doses"
        verTodos={dados?.proximo ? completo : undefined}
        verTodosLabel="Ver tudo"
      />
      <div className={estilos.chips}>
        <FilterChips
          rotulo="Período"
          chips={CHIPS_DE_PERIODO}
          selected={periodo === 'tudo' ? null : periodo}
          onSelect={(v) => setPeriodo((v ?? 'tudo') as Periodo)}
        />
      </div>

      <SurfaceCard className={estilos.cartao}>
        {consulta.isError && !dados ? (
          <button type="button" className={estilos.erro} onClick={() => void consulta.refetch()}>
            {mensagemDoErro(consulta.error)} Clique para tentar de novo.
          </button>
        ) : !dados ? (
          <Carregando />
        ) : (
          <>
            <ResumoDoHistorico resumo={dados.resumo} periodo={periodo} />
            {dados.doses.length === 0 ? (
              <p className={`${estilos.ajuda} ${estilos.vazio}`}>
                {periodo === 'tudo'
                  ? 'Nenhuma dose registrada ainda.'
                  : 'Nenhuma dose neste período.'}
              </p>
            ) : (
              <ul className={estilos.lista}>
                {dados.doses.map((d) => (
                  <LinhaDoHistorico key={d.id} dose={d} agora={agora} idAtual={medicationId} />
                ))}
              </ul>
            )}
            {dados.proximo ? (
              <Link to={completo} className={estilos.verTudo}>
                Ver histórico completo
                <Icone nome="chevron-right" size={16} />
              </Link>
            ) : null}
          </>
        )}
      </SurfaceCard>
    </section>
  );
}
