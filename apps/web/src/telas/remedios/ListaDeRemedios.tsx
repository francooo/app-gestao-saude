import { estoqueBaixo } from '@gestao/shared/lib/estoque';
import { hora, resumoDoDia, tituloDoMedicamento, vigenteHoje } from '@gestao/shared/lib/posologia';
import { isSameDay } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useListaDeRemedios, usePerfis, usePlano } from '@/api/consultas';
import { mensagemDoErro, useMarcarDose } from '@/api/doses';
import ramo from '@/imagens/folhas/ramo-canto.png';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { CartaoDeResumo } from '@/ui/CartaoDeResumo';
import { FilterChips } from '@/ui/FilterChips';
import { Icone } from '@/ui/Icone';
import { MedicationRow } from '@/ui/MedicationCard';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { CampoDeBusca } from '@/ui/Selo';

import estilos from './remedios.module.css';

type Props = {
  perfilId: string | null;
  setPerfilId: (id: string | null) => void;
};

type Recorte = 'ativos' | 'hoje' | 'todos';

const RECORTES = [
  { value: 'ativos', label: 'Em uso' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'todos', label: 'Todos, com encerrados' },
];

/** Busca sem acento e sem caixa: "losartana" acha "Losartana". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Meus medicamentos: a lista da familia em linhas largas, com o filtro de
 * pessoa, a busca, o cadastro por foto e os tres indicadores — a tela de
 * referencia da web. O botao de marcar dose continua em cada linha.
 */
export function ListaDeRemedios({ perfilId, setPerfilId }: Props) {
  const perfis = usePerfis();
  const lista = useListaDeRemedios(perfilId);
  const { premium } = usePlano();
  const { marcar, emVoo } = useMarcarDose();

  const [busca, setBusca] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('ativos');

  const medicamentos = useMemo(() => lista.data?.remedios ?? [], [lista.data]);
  const agora = lista.data?.agora;

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return medicamentos
      .filter((m) =>
        recorte === 'todos'
          ? true
          : recorte === 'hoje'
            ? agora != null && vigenteHoje(m, agora)
            : m.isActive,
      )
      .filter((m) => (termo ? normalizar(tituloDoMedicamento(m)).includes(termo) : true));
  }, [medicamentos, recorte, busca, agora]);

  const ativos = medicamentos.filter((m) => m.isActive).length;
  const acabando = medicamentos.filter(
    (m) => m.isActive && m.stock && estoqueBaixo(m, m.stock),
  ).length;
  const proxima = useMemo(
    () => (agora ? resumoDoDia(medicamentos, agora).proxima : null),
    [medicamentos, agora],
  );

  return (
    <Pagina area="medications" largura="larga">
      <ScreenHeader
        title="Meus medicamentos"
        subtitle="Acompanhe os medicamentos de toda a família"
      />

      <div className={estilos.ferramentas}>
        <div className={estilos.ferramentaPessoa}>
          <ProfileSelector
            profiles={perfis.data ?? []}
            selectedId={perfilId}
            onSelect={setPerfilId}
            tituloDoPainel="Ver remédios de"
          />
        </div>
        <CampoDeBusca
          valor={busca}
          onChange={setBusca}
          placeholder="Buscar medicamento"
          rotulo="Buscar medicamento pelo nome"
        />
        <Link to="/remedios/novo" className={`${botoes.ambar} ${estilos.adicionar}`}>
          <Icone nome="plus" size={22} />
          Adicionar medicamento
        </Link>
      </div>

      {/* Cadastro por foto. Sem o plano continua aqui (e a vitrine do recurso),
          com o selo, e leva a assinatura. */}
      <Link
        to={premium ? '/remedios/novo' : '/conta/assinatura'}
        className={estilos.porFoto}
        aria-label={
          premium
            ? 'Cadastrar por foto. Fotografe a receita ou a caixinha.'
            : 'Cadastrar por foto. Faz parte da assinatura.'
        }
      >
        <span className={estilos.porFotoIcone} aria-hidden="true">
          <Icone nome="camera" size={34} />
        </span>
        <span className={estilos.porFotoTextos}>
          <span className={estilos.porFotoTitulo}>
            Cadastrar por foto
            {premium ? null : (
              <span className={estilos.seloAssinatura}>
                <Icone nome="lock" size={12} />
                Assinatura
              </span>
            )}
          </span>
          <span className={estilos.porFotoTexto}>
            Fotografe a receita ou a caixinha e deixe a IA preencher as informações.
          </span>
        </span>
        <img src={ramo} alt="" className={estilos.porFotoRamo} />
        <Icone nome="chevron-right" size={24} className={estilos.porFotoSeta} />
      </Link>

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
      ) : agora ? (
        <>
          <div className={estilos.indicadores}>
            <CartaoDeResumo
              formato="indicador"
              icone="mci:pill"
              rotulo="Medicamentos ativos"
              valor={String(ativos)}
            />
            <CartaoDeResumo
              formato="indicador"
              icone={acabando > 0 ? 'alert-circle' : 'sun'}
              tom="atencao"
              rotulo="Estoque baixo"
              valor={
                acabando === 0 ? 'Nenhum' : acabando === 1 ? '1 alerta' : `${acabando} alertas`
              }
              para="/remedios/estoque"
            />
            <CartaoDeResumo
              formato="indicador"
              icone="clock"
              tom="escuro"
              rotulo="Próxima dose"
              valor={proxima ? hora(proxima.quando) : '—'}
              apoio={
                proxima
                  ? `${tituloDoMedicamento(proxima.medicamento)}${isSameDay(proxima.quando, agora) ? '' : ' · amanhã'}`
                  : 'Nada agendado'
              }
            />
          </div>

          <section className={estilos.secao} aria-labelledby="lista-titulo">
            <div className={estilos.listaTopo}>
              <h2 id="lista-titulo" className={estilos.listaTitulo}>
                Meus medicamentos
              </h2>
              <FilterChips
                chips={RECORTES}
                selected={recorte}
                onSelect={(v) => setRecorte((v ?? 'ativos') as Recorte)}
                rotulo="Quais medicamentos mostrar"
              />
            </div>

            {visiveis.length === 0 ? (
              <Aviso icone="plus-circle">
                {medicamentos.length === 0
                  ? 'Você ainda não cadastrou nenhum remédio.'
                  : busca.trim()
                    ? `Nenhum medicamento com "${busca.trim()}".`
                    : recorte === 'hoje'
                      ? 'Nenhum remédio previsto para hoje.'
                      : 'Nenhum medicamento em uso.'}
              </Aviso>
            ) : (
              <div className={estilos.pilha}>
                {visiveis.map((m) => (
                  <MedicationRow
                    key={m.id}
                    medicamento={m}
                    agora={agora}
                    mostrarPerfil
                    enviando={emVoo.has(m.id)}
                    onMarcar={() => void marcar(m, agora)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* No aplicativo, aqui fica o interruptor dos lembretes do aparelho.
              O navegador nao agenda alarme: a web diz onde eles tocam. */}
          <p className={estilos.notaLembretes}>
            <Icone nome="bell" size={16} />
            Os lembretes das doses tocam no aplicativo do celular.
          </p>
        </>
      ) : null}
    </Pagina>
  );
}
