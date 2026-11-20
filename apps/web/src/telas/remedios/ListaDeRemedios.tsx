import type { Medication } from '@gestao/shared/api/health';
import {
  estoqueBaixo,
  quantidadeDoEstoque,
  validadeCurta,
  validadeProxima,
} from '@gestao/shared/lib/estoque';
import {
  estadoHoje,
  formaVisual,
  posologia,
  slotsDoDia,
  tituloDoMedicamento,
  vigenteHoje,
} from '@gestao/shared/lib/posologia';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useListaDeRemedios } from '@/api/consultas';
import { mensagemDoErro, useMarcarDose } from '@/api/doses';
import maeBebe from '@/imagens/repag/mae-bebe-oval.webp';
import { usePessoaAtiva } from '@/lib/pessoaAtiva';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { CartaoDeResumo } from '@/ui/CartaoDeResumo';
import { DoseButton } from '@/ui/DoseButton';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_POR_FORMA } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { CampoDeBusca, SeloDeStatus } from '@/ui/Selo';

import estilos from './ListaDeRemedios.module.css';

type Props = {
  perfilId: string | null;
  /** Mantido por compatibilidade: a pessoa agora vem do cabecalho. */
  setPerfilId?: (id: string | null) => void;
};

type Status = 'ativos' | 'hoje' | 'baixo' | 'validade' | 'todos';

const STATUS: { valor: Status; rotulo: string }[] = [
  { valor: 'ativos', rotulo: 'Em uso' },
  { valor: 'hoje', rotulo: 'Doses de hoje' },
  { valor: 'baixo', rotulo: 'Estoque baixo' },
  { valor: 'validade', rotulo: 'Validade próxima' },
  { valor: 'todos', rotulo: 'Todos, com encerrados' },
];

/** Busca sem acento e sem caixa: "losartana" acha "Losartana". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Remédios e estoque (mock 02 da repaginacao): tres alertas no topo, a barra
 * de filtros com as duas acoes, e a tabela Medicamento / Membro / Quantidade
 * restante / Validade / Nivel. A pessoa vem do seletor do cabecalho.
 *
 * O botao de marcar a dose de hoje continua em cada linha: o mock nao o
 * desenha, mas marcar dose e a funcao central do sistema.
 */
export function ListaDeRemedios({ perfilId }: Props) {
  const lista = useListaDeRemedios(perfilId);
  const { membros } = usePessoaAtiva();
  const { marcar, emVoo } = useMarcarDose();

  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<Status>('ativos');

  const medicamentos = useMemo(() => lista.data?.remedios ?? [], [lista.data]);
  const agora = lista.data?.agora;

  const baixo = (m: Medication) => Boolean(m.isActive && m.stock && estoqueBaixo(m, m.stock));
  const vence = (m: Medication) => Boolean(m.isActive && m.stock && agora && validadeProxima(m.stock, agora));

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return medicamentos
      .filter((m) => {
        switch (status) {
          case 'todos':
            return true;
          case 'hoje':
            return agora != null && vigenteHoje(m, agora);
          case 'baixo':
            return baixo(m);
          case 'validade':
            return vence(m);
          default:
            return m.isActive;
        }
      })
      .filter((m) => (termo ? normalizar(tituloDoMedicamento(m)).includes(termo) : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicamentos, status, busca, agora]);

  const acabando = medicamentos.filter(baixo).length;
  const vencendo = medicamentos.filter(vence).length;
  const deHoje = agora ? medicamentos.filter((m) => vigenteHoje(m, agora) && m.scheduleType !== 'as_needed') : [];
  const dosesHoje = agora ? deHoje.reduce((t, m) => t + slotsDoDia(m, agora).length, 0) : 0;

  return (
    <Pagina area="medications" largura="larga">
      <ScreenHeader
        title="Remédios e estoque"
        subtitle="Mantenha os medicamentos da sua família sempre em dia."
        ilustracao={maeBebe}
      />

      {lista.isPending ? (
        <Carregando />
      ) : lista.isError && !lista.data ? (
        <div className={estilos.bloco}>
          <Aviso icone="alert-circle" erro acao={{ rotulo: 'Tentar de novo', onClick: () => void lista.refetch() }}>
            {mensagemDoErro(lista.error)}
          </Aviso>
        </div>
      ) : agora ? (
        <>
          <div className={estilos.alertas}>
            <CartaoDeResumo
              icone={acabando > 0 ? 'alert-triangle' : 'check-circle'}
              tom={acabando > 0 ? 'atencao' : 'verde'}
              rotulo="Estoque baixo"
              valor={
                acabando === 0
                  ? 'Nenhum remédio acabando'
                  : acabando === 1
                    ? '1 medicamento precisa de reposição'
                    : `${acabando} medicamentos precisam de reposição`
              }
              para="/remedios/estoque"
            />
            <CartaoDeResumo
              icone="clock"
              rotulo="Próximas doses"
              valor={
                dosesHoje === 0
                  ? 'Nenhuma dose prevista hoje'
                  : `${dosesHoje} ${dosesHoje === 1 ? 'dose' : 'doses'} hoje (${deHoje.length} ${deHoje.length === 1 ? 'medicamento' : 'medicamentos'})`
              }
              para="/remedios/historico"
            />
            <CartaoDeResumo
              icone="calendar"
              tom={vencendo > 0 ? 'atencao' : 'verde'}
              rotulo="Validade próxima"
              valor={
                vencendo === 0
                  ? 'Nenhum vence nos próximos 30 dias'
                  : vencendo === 1
                    ? '1 medicamento vence em 30 dias'
                    : `${vencendo} medicamentos vencem em 30 dias`
              }
              para="/remedios/estoque"
            />
          </div>

          <div className={estilos.ferramentas}>
            <label className={estilos.filtro}>
              <Icone nome="filter" size={20} />
              <span className={estilos.oculto}>Filtrar por status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUS.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
              <Icone nome="chevron-down" size={18} />
            </label>
            <div className={estilos.busca}>
              <CampoDeBusca
                valor={busca}
                onChange={setBusca}
                placeholder="Buscar medicamento"
                rotulo="Buscar medicamento pelo nome"
              />
            </div>
            <div className={estilos.acoes}>
              <Link to="/remedios/novo" className={`${botoes.contorno} ${estilos.botao}`}>
                <Icone nome="plus-circle" size={20} />
                Adicionar medicamento
              </Link>
              <Link to="/remedios/compra" className={`${botoes.ambar} ${estilos.botao}`}>
                <Icone nome="refresh-cw" size={20} />
                Registrar reposição
              </Link>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <div className={estilos.bloco}>
              <Aviso icone="plus-circle">
                {medicamentos.length === 0
                  ? 'Você ainda não cadastrou nenhum remédio.'
                  : busca.trim()
                    ? `Nenhum medicamento com "${busca.trim()}".`
                    : `Nenhum medicamento em "${STATUS.find((s) => s.valor === status)?.rotulo}".`}
              </Aviso>
            </div>
          ) : (
            <div className={estilos.tabela}>
              <div className={estilos.cabecalhoDaTabela} aria-hidden="true">
                <span>Medicamento</span>
                <span>Membro</span>
                <span>Quantidade restante</span>
                <span>Validade</span>
                <span>Nível</span>
                <span>Hoje</span>
              </div>
              <ul className={estilos.linhas}>
                {visiveis.map((m) => {
                  const titulo = tituloDoMedicamento(m);
                  const membro = membros.find((p) => p.id === m.profileId);
                  const estado = estadoHoje(m, agora);
                  const repetivel = m.scheduleType === 'as_needed';
                  const marcado = estado.tipo === 'tomado' && !repetivel;
                  const semAcao =
                    estado.tipo === 'inativo' || estado.tipo === 'encerrado' || estado.tipo === 'nao_comecou';
                  const e = m.stock ?? null;
                  return (
                    <li key={m.id} className={estilos.linha}>
                      <Link
                        to={`/remedios/${m.id}`}
                        className={estilos.cobertura}
                        aria-label={`${titulo}${m.profileName ? `, de ${m.profileName}` : ''}. Ver detalhes.`}
                      />
                      <div className={estilos.medicamento}>
                        <IconTile {...LADRILHO_POR_FORMA[formaVisual(m.form)]} size={52} />
                        <div className={estilos.nome}>
                          <p className={estilos.titulo}>{titulo}</p>
                          <p className={estilos.apoio}>{m.isActive ? posologia(m) : 'Encerrado'}</p>
                        </div>
                      </div>
                      <div className={estilos.membro}>
                        {membro ? (
                          <Avatar
                            nome={membro.fullName}
                            color={membro.avatarColor ?? undefined}
                            photo={membro.photo ?? undefined}
                            size={40}
                          />
                        ) : null}
                        <span>{(m.profileName ?? membro?.fullName ?? '').split(' ')[0]}</span>
                      </div>
                      <div className={estilos.dado}>
                        <Icone nome="mci:pill" size={20} />
                        {e ? (
                          <span>
                            {quantidadeDoEstoque(e.remaining, m.form)}
                            {e.lastPurchaseUnits > 0 ? (
                              <span className={estilos.apoio}> (de {e.lastPurchaseUnits})</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className={estilos.apoio}>Sem controle</span>
                        )}
                      </div>
                      <div className={estilos.dado}>
                        <Icone nome="calendar" size={20} />
                        <span>{e?.expiresOn ? validadeCurta(e.expiresOn) : <span className={estilos.apoio}>—</span>}</span>
                      </div>
                      <div className={estilos.nivel}>
                        {!e ? null : baixo(m) ? (
                          <SeloDeStatus tom="atencao">Baixo</SeloDeStatus>
                        ) : vence(m) ? (
                          <SeloDeStatus tom="atencao" icone="calendar">
                            Vence logo
                          </SeloDeStatus>
                        ) : (
                          <SeloDeStatus tom="sucesso">Adequado</SeloDeStatus>
                        )}
                      </div>
                      <div className={estilos.hoje}>
                        {vigenteHoje(m, agora) ? (
                          <DoseButton
                            checked={marcado}
                            repetivel={repetivel}
                            disabled={semAcao}
                            enviando={emVoo.has(m.id)}
                            label={marcado ? `Dose de ${titulo} já marcada` : `Marcar dose de ${titulo}`}
                            onClick={() => void marcar(m, agora)}
                          />
                        ) : null}
                        <Icone nome="chevron-right" size={22} className={estilos.seta} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* No aplicativo, aqui fica o interruptor dos lembretes do aparelho.
              O navegador nao agenda alarme: a web diz onde eles tocam. */}
          <p className={estilos.nota}>
            <Icone nome="bell" size={16} />
            Os lembretes das doses tocam no aplicativo do celular e, se você quiser, no WhatsApp do acompanhante.
          </p>
        </>
      ) : null}
    </Pagina>
  );
}
