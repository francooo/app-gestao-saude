import { estoqueBaixo } from '@gestao/shared/lib/estoque';
import {
  hora,
  resumoDoDia,
  tituloDoMedicamento,
  vigenteHoje,
} from '@gestao/shared/lib/posologia';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { useListaDeRemedios, usePerfis } from '@/api/consultas';
import { mensagemDoErro, useMarcarDose } from '@/api/doses';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_ATENCAO, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { MedicationCard } from '@/ui/MedicationCard';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SummaryTile } from '@/ui/SummaryTile';

import estilos from './remedios.module.css';

type Props = {
  perfilId: string | null;
  setPerfilId: (id: string | null) => void;
};

/**
 * A lista de Remedios: resumo do dia, atalho do estoque, os remedios de hoje
 * (ou todos) com o botao de marcar dose, e o cadastro de um novo.
 */
export function ListaDeRemedios({ perfilId, setPerfilId }: Props) {
  const perfis = usePerfis();
  const lista = useListaDeRemedios(perfilId);
  const { marcar, emVoo } = useMarcarDose();
  // Em tela larga a lista fica ao lado do detalhe: destaca o remedio aberto.
  const { id: aberto } = useParams();

  /** false = so os de hoje; true = todos, inclusive encerrados. */
  const [verTodos, setVerTodos] = useState(false);

  const medicamentos = useMemo(() => lista.data?.remedios ?? [], [lista.data]);
  const agora = lista.data?.agora;

  const visiveis = useMemo(
    () =>
      verTodos || !agora ? medicamentos : medicamentos.filter((m) => vigenteHoje(m, agora)),
    [medicamentos, verTodos, agora],
  );
  const resumo = useMemo(
    () => (agora ? resumoDoDia(medicamentos, agora) : null),
    [medicamentos, agora],
  );
  const acabando = useMemo(
    () => medicamentos.filter((m) => m.isActive && m.stock && estoqueBaixo(m, m.stock)).length,
    [medicamentos],
  );

  const proxima = resumo?.proxima;
  const detalheDaProxima = proxima
    ? [
        tituloDoMedicamento(proxima.medicamento),
        // Com a familia inteira na tela, diz de quem e a proxima dose.
        perfilId === null ? proxima.medicamento.profileName?.split(' ')[0] : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Nada agendado';

  return (
    <Pagina area="medications">
      <ScreenHeader title="Medicamentos" mostrarSino />

      <div className={estilos.bloco}>
        <ProfileSelector
          profiles={perfis.data ?? []}
          selectedId={perfilId}
          onSelect={setPerfilId}
          tituloDoPainel="Ver remédios de"
        />
      </div>

      {lista.isPending ? (
        <Carregando />
      ) : lista.isError && !lista.data ? (
        <div className={estilos.bloco}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void lista.refetch() }}
          >
            {mensagemDoErro(lista.error)}
          </Aviso>
        </div>
      ) : resumo && agora ? (
        <>
          <div className={estilos.resumo}>
            <SummaryTile
              icone="sun"
              corDoLadrilho="var(--cor-tile-sun)"
              rotulo="Hoje"
              valor={`${resumo.dosesTomadas} ${resumo.dosesTomadas === 1 ? 'dose' : 'doses'}`}
              detalhe={`de ${resumo.totalMedicamentos} ${resumo.totalMedicamentos === 1 ? 'medicamento' : 'medicamentos'}`}
            />
            <SummaryTile
              icone="clock"
              corDoLadrilho="var(--cor-tile-clock)"
              rotulo="Próxima dose"
              valor={proxima ? hora(proxima.quando) : '—'}
              detalhe={detalheDaProxima}
            />
          </div>

          {/* Atalho para o Estoque. Ambar so quando ha remedio acabando: em
              todo o aplicativo, ambar e "tem coisa para fazer". */}
          <Link
            to="/remedios/estoque"
            className={`${estilos.atalho} ${estilos.bloco}`}
            aria-label={`Estoque. ${textoDoEstoque(acabando)}`}
          >
            <IconTile
              {...(acabando > 0 ? LADRILHO_ATENCAO : LADRILHO_NEUTRO)}
              icone="mci:store-plus-outline"
            />
            <span className={estilos.atalhoTextos}>
              <span className={estilos.atalhoTitulo}>Estoque</span>
              <span className={estilos.atalhoDescricao}>{textoDoEstoque(acabando)}</span>
            </span>
            <Icone nome="chevron-right" size={22} color="var(--cor-section-title)" />
          </Link>

          <section className={estilos.secao}>
            <SectionHeader
              title={verTodos ? 'Todos os medicamentos' : 'Medicamentos de hoje'}
              icon="leaf"
              onVerTodos={medicamentos.length > 0 ? () => setVerTodos((v) => !v) : undefined}
              verTodosLabel={verTodos ? 'Só hoje' : 'Ver todos'}
            />

            {visiveis.length === 0 ? (
              <Aviso icone="plus-circle">
                {medicamentos.length === 0
                  ? 'Você ainda não cadastrou nenhum remédio.'
                  : 'Nenhum remédio previsto para hoje. Abra Ver todos.'}
              </Aviso>
            ) : (
              <div className={estilos.pilha}>
                {visiveis.map((m) => (
                  <MedicationCard
                    key={m.id}
                    medicamento={m}
                    agora={agora}
                    mostrarPerfil={perfilId === null}
                    enviando={emVoo.has(m.id)}
                    onMarcar={() => void marcar(m, agora)}
                    atual={m.id === aberto}
                  />
                ))}
              </div>
            )}
          </section>

          <Link
            to="/remedios/novo"
            className={`${botoes.ambar} ${botoes.largo} ${estilos.secao}`}
          >
            <Icone nome="plus" size={20} />
            Adicionar medicamento
          </Link>

          {/* No aplicativo, aqui fica o interruptor dos lembretes do aparelho.
              O navegador nao agenda alarme: a web diz onde eles tocam. */}
          <div className={`${estilos.atalho} ${estilos.secao}`}>
            <IconTile {...LADRILHO_NEUTRO} icone="bell" />
            <span className={estilos.atalhoTextos}>
              <span className={estilos.atalhoTitulo}>Lembretes</span>
              <span className={estilos.atalhoDescricao}>
                Os avisos das doses tocam no aplicativo do celular
              </span>
            </span>
          </div>
        </>
      ) : null}
    </Pagina>
  );
}

function textoDoEstoque(acabando: number): string {
  if (acabando === 0) return 'Caixas compradas e o que sobra';
  return acabando === 1 ? '1 remédio acabando' : `${acabando} remédios acabando`;
}
