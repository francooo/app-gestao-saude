import type { Medication } from '@gestao/shared/api/health';
import { estoqueBaixo } from '@gestao/shared/lib/estoque';
import { hora, proximaDose, tituloDoMedicamento, vigenteHoje } from '@gestao/shared/lib/posologia';
import { guardarFotoParaLeitura } from '@gestao/shared/lib/rascunhoDeMedicamento';
import { isSameDay } from 'date-fns';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';

import { useAcompanhantes, useConsultasFuturas, usePlano, useRemediosDeHoje } from '@/api/consultas';
import { useMarcarDose } from '@/api/doses';
import { useAuth } from '@/auth/AuthProvider';
import maeBebe from '@/imagens/repag/mae-bebe-oval.webp';
import { escolherFotoDeDocumento } from '@/lib/foto';
import { usePessoaAtiva } from '@/lib/pessoaAtiva';
import { AppointmentCard } from '@/ui/AppointmentCard';
import { CartaoDeResumo } from '@/ui/CartaoDeResumo';
import { useDialogos } from '@/ui/Dialogo';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { MedicationCard } from '@/ui/MedicationCard';
import { Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import { AssistantCard, CartaoLerReceita } from './inicio/CartoesDeIA';
import { passosDaJornada } from './inicio/jornada';
import estilos from './Inicio.module.css';

/**
 * Tela inicial (mock 01 da repaginacao): como esta o cuidado da familia hoje.
 *
 * A pessoa vem do seletor do cabecalho (lib/pessoaAtiva): "Cuidado de Ana
 * Clara" mostra so o dela; "Todos", a familia inteira. Abaixo do mock ficam os
 * remedios de hoje com o botao de marcar dose — o mock nao os desenha, mas
 * marcar dose e a funcao central e nao pode sair da primeira tela.
 */
export function Inicio() {
  const { pessoaId, pessoa, titular } = usePessoaAtiva();
  const { user } = useAuth();
  const remedios = useRemediosDeHoje();
  const consultas = useConsultasFuturas();
  const acompanhantes = useAcompanhantes();
  /**
   * Os recursos de IA sao do plano. Sem ele continuam na tela (sao a vitrine
   * do que a assinatura traz), com selo, e levam a assinatura.
   */
  const { premium } = usePlano();
  const navigate = useNavigate();
  const { avisar } = useDialogos();
  const { marcar, emVoo } = useMarcarDose();

  /**
   * Escolhe a foto AQUI e so entao vai para a leitura. A foto viaja em memoria
   * (nunca na URL nem no armazenamento do navegador) e a tela de leitura ja
   * nasce lendo.
   */
  async function lerReceita(camera: boolean) {
    const escolha = await escolherFotoDeDocumento({ camera });
    if (!escolha.ok) {
      if (escolha.motivo === 'falha') {
        void avisar('Não consegui usar a foto', 'Tente de novo, ou escolha outra imagem.');
      }
      return;
    }
    guardarFotoParaLeitura(escolha.dataUri);
    navigate('/remedios/novo?fotoPronta=1');
  }

  const nomeDaPessoa = pessoa?.fullName.split(' ')[0] ?? null;
  // A saudacao e para quem esta usando o site: a conta, nao a pessoa filtrada.
  const saudado = (titular?.fullName ?? user?.fullName ?? '').split(' ')[0];
  /** "Medicamentos de hoje · Valentina" quando ha alguem selecionado. */
  const deQuem = (titulo: string) => (nomeDaPessoa ? `${titulo} · ${nomeDaPessoa}` : titulo);

  // O filtro por pessoa e em memoria: a familia inteira ja veio.
  const agora = remedios.data?.agora;
  const daPessoa = useMemo(
    () => (remedios.data?.remedios ?? []).filter((m) => (pessoaId ? m.profileId === pessoaId : true)),
    [remedios.data, pessoaId],
  );
  const deHoje = useMemo(() => (agora ? daPessoa.filter((m) => vigenteHoje(m, agora)) : []), [daPessoa, agora]);
  const proxima = useMemo(() => (agora ? proximaDoseDe(deHoje, agora) : null), [deHoje, agora]);
  const acabando = daPessoa.filter((m) => m.isActive && m.stock && estoqueBaixo(m, m.stock)).length;

  const consultasDaPessoa = (consultas.data ?? []).filter((c) => (pessoaId ? c.profileId === pessoaId : true));
  const proximaConsulta = consultasDaPessoa[0] ?? null;

  const jornada = agora
    ? passosDaJornada({
        remedios: remedios.data?.remedios ?? [],
        consultas: consultas.data ?? [],
        acompanhantes: acompanhantes.data?.caregivers ?? [],
        agora,
        pessoaId,
      })
    : null;

  return (
    <Pagina area="home" largura="larga">
      <ScreenHeader
        title={saudado ? `Olá, ${saudado}` : 'Olá'}
        subtitle="Veja como está o cuidado da sua família hoje."
        ilustracao={maeBebe}
      />

      <div className={estilos.resumos}>
        <CartaoDeResumo
          icone="mci:pill"
          rotulo="Próxima dose"
          valor={
            remedios.isPending
              ? '…'
              : proxima
                ? `${tituloDoMedicamento(proxima.remedio)} · ${agora ? quandoDose(proxima.quando, agora) : ''}`
                : 'Nenhuma dose pendente'
          }
          para={proxima ? `/remedios/${proxima.remedio.id}` : '/remedios'}
        />
        {/* Terracota so quando ha o que resolver; com tudo em ordem, verde. */}
        <CartaoDeResumo
          icone={acabando > 0 ? 'alert-triangle' : 'calendar'}
          tom={acabando > 0 ? 'atencao' : 'verde'}
          rotulo={acabando > 0 ? 'Estoque baixo' : 'Estoque'}
          valor={
            remedios.isPending
              ? '…'
              : acabando === 0
                ? 'Nenhum remédio acabando'
                : acabando === 1
                  ? '1 medicamento precisa de atenção'
                  : `${acabando} medicamentos precisam de atenção`
          }
          para="/remedios/estoque"
        />
        <CartaoDeResumo
          icone="calendar"
          rotulo="Próxima consulta"
          valor={
            consultas.isPending
              ? '…'
              : proximaConsulta
                ? `${proximaConsulta.professionalName ?? proximaConsulta.title ?? 'Consulta'} · ${diaDaConsulta(proximaConsulta.scheduledAt)}`
                : 'Nenhuma consulta agendada'
          }
          para={proximaConsulta?.professionalId ? `/medico/${proximaConsulta.professionalId}` : '/medicos'}
        />
      </div>

      <SurfaceCard className={estilos.jornada}>
        <h2 className={estilos.jornadaTitulo}>
          <Icone nome="clock" size={24} />
          {nomeDaPessoa ? `Próxima jornada de cuidado de ${nomeDaPessoa}` : 'Sua próxima jornada de cuidado'}
        </h2>
        {!jornada ? (
          <div className={estilos.esqueleto} role="status" aria-label="Carregando" />
        ) : (
          <ol className={estilos.passos}>
            {jornada.map((p) => {
              const conteudo = (
                <>
                  <span className={estilos.passoIcone} data-destaque={p.destaque ? '' : undefined} aria-hidden="true">
                    <Icone nome={p.icone} size={22} />
                  </span>
                  <span className={estilos.passoTextos}>
                    <span className={estilos.passoQuando}>{p.quando}</span>
                    <span className={estilos.passoTitulo}>{p.titulo}</span>
                    <span className={estilos.passoDetalhe}>{p.detalhe}</span>
                  </span>
                </>
              );
              return (
                <li key={p.chave} className={estilos.passo}>
                  {p.para && p.detalhe !== '—' ? (
                    <Link to={p.para} className={estilos.passoLink}>
                      {conteudo}
                    </Link>
                  ) : (
                    <div className={estilos.passoLink}>{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </SurfaceCard>

      <div className={estilos.bloco}>
        <CartaoLerReceita bloqueado={!premium} onEscolher={(camera) => void lerReceita(camera)} />
      </div>

      <div className={estilos.dia}>
        <section aria-label={deQuem('Medicamentos de hoje')}>
          <SectionHeader title={deQuem('Medicamentos de hoje')} verTodos="/remedios" />
          {remedios.isPending ? (
            <Esqueleto linhas={2} />
          ) : remedios.isError && !remedios.data ? (
            <p className={estilos.recado}>Não consegui carregar os remédios. Tente de novo em instantes.</p>
          ) : deHoje.length === 0 || !agora ? (
            <SurfaceCard className={estilos.vazio}>
              {nomeDaPessoa
                ? `${nomeDaPessoa} não tem remédio para hoje.`
                : 'Nenhum remédio para hoje. Abra Ver todos para cadastrar.'}
            </SurfaceCard>
          ) : (
            <div className={estilos.pilha}>
              {deHoje.slice(0, 4).map((m) => (
                <MedicationCard
                  key={m.id}
                  medicamento={m}
                  agora={agora}
                  // Com uma pessoa escolhida, repetir o nome dela em cada cartao
                  // e ruido — o titulo da secao ja diz de quem e.
                  mostrarPerfil={pessoaId === null}
                  enviando={emVoo.has(m.id)}
                  onMarcar={() => void marcar(m, agora)}
                />
              ))}
            </div>
          )}
        </section>

        <div className={estilos.lateral}>
          <section aria-label={deQuem('Próximas consultas')}>
            <SectionHeader title={deQuem('Próximas consultas')} verTodos="/medicos" />
            {consultas.isPending ? (
              <Esqueleto linhas={1} />
            ) : consultasDaPessoa.length === 0 ? (
              <p className={estilos.recado}>
                {nomeDaPessoa ? `Nenhuma consulta agendada para ${nomeDaPessoa}.` : 'Nenhuma consulta agendada.'}
              </p>
            ) : (
              <div className={estilos.pilha}>
                {consultasDaPessoa.slice(0, 2).map((c) => (
                  <AppointmentCard key={c.id} consulta={c} />
                ))}
              </div>
            )}
          </section>

          {/* Ladrilho NEUTRO: nao ter anotado nada hoje nao e tarefa pendente. */}
          <Link to="/sintomas" className={estilos.diario} aria-label="Diário de sintomas. Anote febre, dor, humor e sono.">
            <IconTile size={54} icone="activity" {...LADRILHO_NEUTRO} />
            <span className={estilos.diarioTextos}>
              <span className={estilos.diarioTitulo}>Diário de sintomas</span>
              <span className={estilos.diarioAjuda}>Anote febre, dor, humor e sono</span>
            </span>
            <Icone nome="chevron-right" size={22} color="var(--musgo)" />
          </Link>

          <Link
            to="/medicoes"
            className={estilos.diario}
            aria-label="Medições. Pressão, glicemia, peso e oxigenação, com gráfico."
          >
            <IconTile size={54} icone="heart" {...LADRILHO_NEUTRO} />
            <span className={estilos.diarioTextos}>
              <span className={estilos.diarioTitulo}>Medições</span>
              <span className={estilos.diarioAjuda}>Pressão, glicemia, peso e oxigenação</span>
            </span>
            <Icone nome="chevron-right" size={22} color="var(--musgo)" />
          </Link>
        </div>
      </div>

      <div className={estilos.assistente}>
        <AssistantCard bloqueado={!premium} />
      </div>
    </Pagina>
  );
}

/** A dose mais proxima entre os remedios de hoje, com o remedio dela. */
function proximaDoseDe(remedios: Medication[], agora: Date): { remedio: Medication; quando: Date } | null {
  let melhor: { remedio: Medication; quando: Date } | null = null;
  for (const remedio of remedios) {
    const quando = proximaDose(remedio, agora);
    if (quando && (!melhor || quando < melhor.quando)) melhor = { remedio, quando };
  }
  return melhor;
}

/** "às 14:00", ou "amanhã às 06:00" quando a proxima dose ja e do dia seguinte. */
function quandoDose(quando: Date, agora: Date): string {
  return isSameDay(quando, agora) ? hora(quando) : `amanhã, ${hora(quando)}`;
}

/** "23 de jun. · 14:30" */
function diaDaConsulta(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  return `${dia}, ${hora(d)}`;
}

/** Linhas claras no lugar dos cartoes, enquanto a primeira carga nao chega. */
function Esqueleto({ linhas }: { linhas: number }) {
  return (
    <div className={estilos.pilha} role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className={estilos.esqueleto} />
      ))}
    </div>
  );
}
