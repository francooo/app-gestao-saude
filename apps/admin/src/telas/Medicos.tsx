import { CalendarCheck, ChevronRight, FileText, Stethoscope, Tags } from 'lucide-react';

import { useMedicos, type Medicos as Dados } from '../api/telas';
import { CabecalhoDaPagina } from '../layout/CabecalhoDaPagina';
import { data, iniciais, numero } from '../lib/formato';
import { useFiltros } from '../lib/useFiltros';
import {
  BarraDeFiltros,
  CampoDeBusca,
  Cartao,
  Carregando,
  ComAvatar,
  Erro,
  GradeDeKpis,
  Kpi,
  Paginacao,
  Pill,
  Selecao,
  Tabela,
  Vazio,
  type Coluna,
} from '../ui/componentes';
import estilos from './telas.module.css';

type Linha = Dados['lista']['itens'][number];

const COLUNAS: Coluna<Linha>[] = [
  {
    titulo: 'Médico',
    render: (m) => <ComAvatar nome={m.nome} iniciais={iniciais(m.nome.replace(/^Dra?\.?\s+/i, ''))} secundario={m.local ?? undefined} />,
  },
  { titulo: 'Especialidade', render: (m) => m.especialidade },
  { titulo: 'Conta', render: (m) => m.conta },
  { titulo: 'Consultas', render: (m) => numero(m.consultas), numerica: true },
  { titulo: 'Remédios receitados', render: (m) => numero(m.receitas), numerica: true },
  {
    titulo: 'Próxima consulta',
    render: (m) =>
      m.proxima_consulta ? (
        <Pill tom="sucesso">{data(m.proxima_consulta)}</Pill>
      ) : m.ultima_consulta ? (
        <span className={estilos.secundario}>Última: {data(m.ultima_consulta)}</span>
      ) : (
        <span className={estilos.secundario}>Sem consulta</span>
      ),
  },
];

export function Medicos() {
  const filtros = useFiltros(['especialidade'] as const);
  const consulta = useMedicos(filtros.consulta);
  const dados = consulta.data;
  const n = dados?.numeros;
  const especialidadeAtual = filtros.valores.especialidade;

  return (
    <>
      <CabecalhoDaPagina titulo="Médicos" subtitulo="Profissionais de saúde cadastrados pelas famílias" />

      <BarraDeFiltros>
        <CampoDeBusca rotulo="Buscar médico, especialidade ou local" valor={filtros.busca} onChange={filtros.setBusca} />
        <Selecao
          rotulo="Especialidade"
          valor={especialidadeAtual}
          opcoes={(dados?.especialidades ?? []).map((e) => ({ valor: e.nome, rotulo: e.nome }))}
          onChange={(v) => filtros.definir('especialidade', v)}
        />
      </BarraDeFiltros>

      {n && (
        <GradeDeKpis>
          <Kpi rotulo="Médicos cadastrados" valor={n.profissionais} Icone={Stethoscope} />
          <Kpi rotulo="Especialidades" valor={n.especialidades} Icone={Tags} tom="mostarda" />
          <Kpi rotulo="Consultas nos próximos 30 dias" valor={n.proximas_30d} Icone={CalendarCheck} tom="musgo" />
          <Kpi rotulo="Médicos com receita no app" valor={n.com_receita} Icone={FileText} tom="caramelo" />
        </GradeDeKpis>
      )}

      <div className={`${estilos.linha} ${estilos.listaELateral}`}>
        <Cartao titulo="Profissionais cadastrados">
          {consulta.isPending ? (
            <Carregando linhas={6} />
          ) : consulta.isError ? (
            <Erro onTentar={() => void consulta.refetch()} />
          ) : dados!.lista.total === 0 ? (
            <Vazio titulo="Nenhum médico encontrado" texto="Tente outra busca ou limpe o filtro." />
          ) : (
            <>
              <Tabela legenda="Médicos cadastrados pelas famílias" colunas={COLUNAS} itens={dados!.lista.itens} atualizando={consulta.isPlaceholderData} />
              <Paginacao {...dados!.lista} onChange={(p) => filtros.definir('pagina', p)} />
            </>
          )}
        </Cartao>

        <Cartao titulo="Especialidades" subtitulo="Toque para filtrar a lista">
          {dados && (
            <ul className={estilos.especialidades}>
              {dados.especialidades.map((e) => {
                const ativa = especialidadeAtual.toLowerCase() === e.nome.toLowerCase();
                return (
                  <li key={e.nome}>
                    <button
                      type="button"
                      aria-pressed={ativa}
                      onClick={() => filtros.definir('especialidade', ativa ? null : e.nome)}
                    >
                      <span className={estilos.atividadeIcone} aria-hidden>
                        <Stethoscope size={16} />
                      </span>
                      <span className={estilos.rankingNome}>{e.nome}</span>
                      <span className={estilos.rankingValor}>
                        {numero(e.profissionais)} {e.profissionais === 1 ? 'médico' : 'médicos'}
                      </span>
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
