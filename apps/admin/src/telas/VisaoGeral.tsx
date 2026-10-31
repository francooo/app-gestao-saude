import { Camera, CreditCard, Pill as IconePill, Stethoscope, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useVisaoGeral, type VisaoGeral as Dados } from '../api/telas';
import { CabecalhoDaPagina } from '../layout/CabecalhoDaPagina';
import { haQuanto, mesCurto, numero } from '../lib/formato';
import { Cartao, Carregando, Erro, GradeDeKpis, Kpi, ListaDeBarras, Vazio } from '../ui/componentes';
import estilos from './telas.module.css';

const COR_MUSGO = '#3F5A45';
const COR_CARAMELO = '#C9854B';
const COR_GRADE = '#DDE8D8';

export function VisaoGeral() {
  const consulta = useVisaoGeral();

  return (
    <>
      <CabecalhoDaPagina titulo="Visão geral" subtitulo="Acompanhe o crescimento e o uso do Família Saúde" />
      {consulta.isPending ? (
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      ) : consulta.isError ? (
        <Cartao>
          <Erro onTentar={() => void consulta.refetch()} />
        </Cartao>
      ) : (
        <Conteudo dados={consulta.data} />
      )}
    </>
  );
}

function Conteudo({ dados }: { dados: Dados }) {
  const { numeros } = dados;
  const semPlano = Math.max(0, numeros.contas - numeros.assinantes - numeros.em_teste);

  return (
    <>
      <GradeDeKpis>
        <Kpi
          rotulo="Contas com acesso (30 dias)"
          valor={numeros.contas_ativas_30d}
          detalhe={`de ${numero(numeros.contas)} contas`}
          Icone={Users}
        />
        <Kpi rotulo="Assinantes" valor={numeros.assinantes} detalhe={`${numero(numeros.em_teste)} em teste`} Icone={CreditCard} tom="mostarda" />
        <Kpi rotulo="Medicamentos ativos" valor={numeros.medicamentos_ativos} detalhe={`${numero(numeros.perfis)} pessoas cuidadas`} Icone={IconePill} tom="musgo" />
        <Kpi rotulo="Médicos cadastrados" valor={numeros.profissionais} Icone={Stethoscope} tom="caramelo" />
      </GradeDeKpis>

      <div className={`${estilos.linha} ${estilos.principalELateral}`}>
        <Cartao
          titulo="Uso ao longo do tempo"
          subtitulo="Contas que usaram o app e novos cadastros, por mês"
          acoes={
            <div className={estilos.legenda}>
              <span>
                <i style={{ background: COR_MUSGO }} />
                Contas com acesso
              </span>
              <span>
                <i style={{ background: COR_CARAMELO }} />
                Novos cadastros
              </span>
            </div>
          }
        >
          <div className={estilos.grafico}>
            <ResponsiveContainer>
              <AreaChart data={dados.meses.map((m) => ({ ...m, rotulo: mesCurto(m.mes) }))} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="preenchimentoMusgo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR_MUSGO} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COR_MUSGO} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COR_GRADE} vertical={false} />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: '#718074', fontSize: 13 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#718074', fontSize: 13 }} />
                <Tooltip
                  formatter={(valor, nome) => [numero(Number(valor)), nome === 'ativas' ? 'Contas com acesso' : 'Novos cadastros']}
                  labelStyle={{ color: '#304637', fontWeight: 700 }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #B7C9AD' }}
                />
                <Area type="monotone" dataKey="ativas" stroke={COR_MUSGO} strokeWidth={2.5} fill="url(#preenchimentoMusgo)" />
                <Area type="monotone" dataKey="novas" stroke={COR_CARAMELO} strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Cartao>

        <Cartao titulo="Planos das contas" subtitulo="Situação atual">
          <ListaDeBarras
            itens={[
              { rotulo: 'Assinantes', valor: numeros.assinantes, detalhe: numero(numeros.assinantes) },
              { rotulo: 'Em período de teste', valor: numeros.em_teste, detalhe: numero(numeros.em_teste) },
              { rotulo: 'Sem plano', valor: semPlano, detalhe: numero(semPlano) },
            ]}
          />
        </Cartao>
      </div>

      <div className={`${estilos.linha} ${estilos.tercos}`}>
        <Cartao titulo="Medicamentos mais cadastrados">
          {dados.medicamentos.length === 0 ? (
            <Vazio titulo="Nenhum medicamento ainda" texto="Quando as famílias cadastrarem remédios, o ranking aparece aqui." />
          ) : (
            <Ranking
              itens={dados.medicamentos.map((m) => ({
                nome: m.nome,
                valor: `${numero(m.cadastros)} ${m.cadastros === 1 ? 'cadastro' : 'cadastros'}`,
              }))}
            />
          )}
        </Cartao>

        <Cartao titulo="Especialidades mais cadastradas">
          {dados.especialidades.length === 0 ? (
            <Vazio titulo="Nenhum médico ainda" texto="As especialidades aparecem quando as famílias cadastrarem médicos." />
          ) : (
            <Ranking
              itens={dados.especialidades.map((e) => ({
                nome: e.nome,
                valor: `${numero(e.profissionais)} ${e.profissionais === 1 ? 'médico' : 'médicos'}`,
              }))}
            />
          )}
        </Cartao>

        <Cartao titulo="Atividade recente">
          {dados.atividade.length === 0 ? (
            <Vazio titulo="Nada por aqui ainda" texto="Cadastros, remédios e leituras de receita aparecem aqui." />
          ) : (
            <ul className={estilos.atividade}>
              {dados.atividade.map((a, i) => {
                const { Icone, texto } = descreverAtividade(a);
                return (
                  <li key={`${a.tipo}-${a.quando}-${i}`}>
                    <span className={estilos.atividadeIcone} aria-hidden>
                      <Icone size={16} />
                    </span>
                    <span className={estilos.atividadeTexto}>
                      <strong>{a.quem}</strong>
                      {texto}
                      <span>{haQuanto(a.quando)}</span>
                    </span>
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

function Ranking({ itens }: { itens: { nome: string; valor: string }[] }) {
  return (
    <ol className={estilos.ranking}>
      {itens.map((item, i) => (
        <li key={item.nome}>
          <span className={estilos.posicao}>{i + 1}</span>
          <span className={estilos.rankingNome}>{item.nome}</span>
          <span className={estilos.rankingValor}>{item.valor}</span>
        </li>
      ))}
    </ol>
  );
}

const LEITURAS: Record<string, string> = {
  'receita:lida': 'leu uma receita com a IA',
  'caixa:lida': 'leu uma caixa de remédio com a IA',
  'receita:falha': 'tentou ler uma receita (falhou)',
  'caixa:falha': 'tentou ler uma caixa (falhou)',
  'receita:vazia': 'enviou uma foto de receita sem remédios',
  'caixa:vazia': 'enviou uma foto de caixa sem remédio',
};

function descreverAtividade(a: Dados['atividade'][number]): { Icone: LucideIcon; texto: string } {
  switch (a.tipo) {
    case 'cadastro':
      return { Icone: UserPlus, texto: 'criou uma conta' };
    case 'leitura':
      return { Icone: Camera, texto: LEITURAS[a.detalhe ?? ''] ?? 'usou a leitura por foto' };
    case 'medicamento':
      return { Icone: IconePill, texto: `cadastrou ${a.detalhe ?? 'um medicamento'}` };
    case 'consulta':
      return { Icone: Stethoscope, texto: a.detalhe ? `agendou consulta: ${a.detalhe}` : 'agendou uma consulta' };
  }
}
