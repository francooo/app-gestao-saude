import type { Medication } from '@gestao/shared/api/health';
import { estoqueBaixo } from '@gestao/shared/lib/estoque';
import { hora, proximaDose, tituloDoMedicamento, vigenteHoje } from '@gestao/shared/lib/posologia';
import { guardarFotoParaLeitura } from '@gestao/shared/lib/rascunhoDeMedicamento';
import { isSameDay } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useConsultasFuturas, usePerfis, usePlano, useRemediosDeHoje } from '@/api/consultas';
import { useMarcarDose } from '@/api/doses';
import { useAuth } from '@/auth/AuthProvider';
import ilustracao from '@/imagens/inicio-mae-bebe.jpg';
import { FundoDeTela } from '@/layout/FundoDeTela';
import { escolherFotoDeDocumento } from '@/lib/foto';
import { AppointmentCard } from '@/ui/AppointmentCard';
import { Avatar } from '@/ui/Avatar';
import { CartaoDeResumo } from '@/ui/CartaoDeResumo';
import { useDialogos } from '@/ui/Dialogo';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { MedicationCard } from '@/ui/MedicationCard';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { Sino } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import { AssistantCard, CartaoLerReceita } from './inicio/CartoesDeIA';
import estilos from './Inicio.module.css';

/**
 * Tela inicial: como esta o cuidado da familia hoje.
 *
 * Segue a tela de referencia da web — saudacao, tres resumos, leitura de
 * receita, assistente e a familia. Abaixo disso ficam os remedios de hoje com
 * o botao de marcar dose: a referencia nao os desenha, mas marcar dose e a
 * funcao central e nao pode sair da primeira tela.
 */
export function Inicio() {
  /** Quem a tela esta mostrando. null = a familia inteira. */
  const [perfilId, setPerfilId] = useState<string | null>(null);

  const { user } = useAuth();
  const perfis = usePerfis();
  const remedios = useRemediosDeHoje();
  const consultas = useConsultasFuturas();
  /**
   * Os dois cartoes de IA sao recursos do plano. Sem ele continuam na tela
   * (sao a vitrine do que a assinatura traz), com selo, e levam a assinatura.
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

  const listaDePerfis = perfis.data ?? [];
  const titular = listaDePerfis.find((p) => p.isAccountHolder) ?? null;
  const selecionado = listaDePerfis.find((p) => p.id === perfilId) ?? null;
  const nomeDoSelecionado = selecionado?.fullName.split(' ')[0] ?? null;
  // A saudacao e para quem esta usando o site: a conta, nao a pessoa filtrada.
  const saudado = (titular?.fullName ?? user?.fullName ?? '').split(' ')[0];
  /** "Medicamentos de hoje · Valentina" quando ha alguem selecionado. */
  const deQuem = (titulo: string) =>
    nomeDoSelecionado ? `${titulo} · ${nomeDoSelecionado}` : titulo;

  // O filtro por pessoa e em memoria: a familia inteira ja veio, e trocar de
  // pessoa nao precisa de outra viagem ao servidor.
  const agora = remedios.data?.agora;
  const daPessoa = useMemo(
    () => (remedios.data?.remedios ?? []).filter((m) => (perfilId ? m.profileId === perfilId : true)),
    [remedios.data, perfilId],
  );
  const deHoje = useMemo(
    () => (agora ? daPessoa.filter((m) => vigenteHoje(m, agora)) : []),
    [daPessoa, agora],
  );
  const proxima = useMemo(() => (agora ? proximaDoseDe(deHoje, agora) : null), [deHoje, agora]);
  const acabando = daPessoa.filter((m) => m.isActive && m.stock && estoqueBaixo(m, m.stock)).length;

  const consultasDaPessoa = (consultas.data ?? []).filter((c) =>
    perfilId ? c.profileId === perfilId : true,
  );
  const proximaConsulta = consultasDaPessoa[0] ?? null;

  return (
    <>
      <FundoDeTela area="home" arranjo="home" />

      <main className={estilos.tela}>
        {/* A mae com o bebe, no canto de cima: enfeite, por tras do cabecalho. */}
        <img src={ilustracao} alt="" className={estilos.ilustracao} />

        <header className={estilos.topo}>
          <div className={estilos.saudacao}>
            <h1 className={estilos.ola}>
              {saudado ? `Olá, ${saudado}` : 'Olá'}
              <Icone nome="mci:heart" size={34} color="var(--mustard-400)" className={estilos.coracao} />
            </h1>
            <p className={estilos.apoio}>Veja como está o cuidado da sua família hoje.</p>
          </div>

          <div className={estilos.seletor}>
            <ProfileSelector
              profiles={listaDePerfis}
              selectedId={perfilId}
              onSelect={setPerfilId}
              tituloDoPainel="Ver o cuidado de"
            />
          </div>

          <Sino className={estilos.sino} />
        </header>

        <div className={estilos.resumos}>
          <CartaoDeResumo
            icone="mci:pill"
            rotulo="Próxima dose"
            valor={
              remedios.isPending
                ? '…'
                : proxima
                  ? tituloDoMedicamento(proxima.remedio)
                  : 'Nenhuma dose pendente'
            }
            apoio={proxima && agora ? quandoDose(proxima.quando, agora) : undefined}
            para={proxima ? `/remedios/${proxima.remedio.id}` : '/remedios'}
          />
          {/* Mostarda so quando ha o que resolver; com tudo em ordem, verde. */}
          <CartaoDeResumo
            icone={acabando > 0 ? 'alert-circle' : 'check-circle'}
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
                  ? (proximaConsulta.professionalName ?? proximaConsulta.title ?? 'Consulta')
                  : 'Nenhuma consulta agendada'
            }
            apoio={proximaConsulta ? diaDaConsulta(proximaConsulta.scheduledAt) : undefined}
            para={
              proximaConsulta?.professionalId
                ? `/medico/${proximaConsulta.professionalId}`
                : '/medicos'
            }
          />
        </div>

        <div className={estilos.destaques}>
          <CartaoLerReceita bloqueado={!premium} onEscolher={(camera) => void lerReceita(camera)} />
          <AssistantCard bloqueado={!premium} />
        </div>

        <SurfaceCard className={estilos.familia}>
          <div className={estilos.familiaTopo}>
            <h2 className={estilos.familiaTitulo}>
              <Icone nome="users" size={28} />
              Minha família
            </h2>
            <Link to="/membro/novo" className={estilos.adicionar}>
              <Icone nome="plus-circle" size={20} />
              Adicionar membro
            </Link>
          </div>

          {perfis.isPending ? (
            <div className={estilos.membros} role="status" aria-label="Carregando">
              <div className={estilos.esqueleto} />
              <div className={estilos.esqueleto} />
            </div>
          ) : perfis.isError && listaDePerfis.length === 0 ? (
            // Lista vazia por falha NAO e "familia vazia": toda conta tem o titular.
            <p className={estilos.recado}>Não consegui carregar as pessoas da sua família.</p>
          ) : (
            <ul className={estilos.membros}>
              {listaDePerfis.map((p) => (
                <li key={p.id}>
                  <Link to={`/membro/${p.id}`} className={estilos.membro}>
                    <Avatar
                      nome={p.fullName}
                      photo={p.photo}
                      color={p.avatarColor ?? undefined}
                      size={64}
                    />
                    <span className={estilos.membroTextos}>
                      <span className={estilos.membroNome}>{p.fullName}</span>
                      {p.isAccountHolder ? <span className={estilos.voce}>Você</span> : null}
                    </span>
                    <Icone nome="chevron-right" size={22} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <div className={estilos.dia}>
          <section aria-label={deQuem('Medicamentos de hoje')}>
            <SectionHeader title={deQuem('Medicamentos de hoje')} verTodos="/remedios" />
            {remedios.isPending ? (
              <Esqueleto linhas={2} />
            ) : remedios.isError && !remedios.data ? (
              <p className={estilos.recado}>
                Não consegui carregar os remédios. Tente de novo em instantes.
              </p>
            ) : deHoje.length === 0 || !agora ? (
              <SurfaceCard className={estilos.vazio}>
                {nomeDoSelecionado
                  ? `${nomeDoSelecionado} não tem remédio para hoje.`
                  : 'Nenhum remédio para hoje. Abra Ver todos para cadastrar.'}
              </SurfaceCard>
            ) : (
              <div className={estilos.pilha}>
                {deHoje.slice(0, 4).map((m) => (
                  <MedicationCard
                    key={m.id}
                    medicamento={m}
                    agora={agora}
                    // Com uma pessoa selecionada, repetir o nome dela em cada
                    // cartao e ruido — o titulo da secao ja diz de quem e.
                    mostrarPerfil={perfilId === null}
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
                  {nomeDoSelecionado
                    ? `Nenhuma consulta agendada para ${nomeDoSelecionado}.`
                    : 'Nenhuma consulta agendada.'}
                </p>
              ) : (
                <div className={estilos.pilha}>
                  {consultasDaPessoa.slice(0, 2).map((c) => (
                    <AppointmentCard key={c.id} consulta={c} />
                  ))}
                </div>
              )}
            </section>

            {/* Ladrilho NEUTRO, nunca mostarda: nao ter anotado nada hoje nao e
                tarefa pendente. */}
            <Link
              to="/sintomas"
              className={estilos.diario}
              aria-label="Diário de sintomas. Anote febre, dor, humor e sono."
            >
              <IconTile size={54} icone="activity" {...LADRILHO_NEUTRO} />
              <span className={estilos.diarioTextos}>
                <span className={estilos.diarioTitulo}>Diário de sintomas</span>
                <span className={estilos.diarioAjuda}>Anote febre, dor, humor e sono</span>
              </span>
              <Icone nome="chevron-right" size={22} color="var(--cor-accent-green)" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

/** A dose mais proxima entre os remedios de hoje, com o remedio dela. */
function proximaDoseDe(
  remedios: Medication[],
  agora: Date,
): { remedio: Medication; quando: Date } | null {
  let melhor: { remedio: Medication; quando: Date } | null = null;
  for (const remedio of remedios) {
    const quando = proximaDose(remedio, agora);
    if (quando && (!melhor || quando < melhor.quando)) melhor = { remedio, quando };
  }
  return melhor;
}

/** "às 14:00", ou "amanhã às 06:00" quando a proxima dose ja e do dia seguinte. */
function quandoDose(quando: Date, agora: Date): string {
  return isSameDay(quando, agora) ? `às ${hora(quando)}` : `amanhã às ${hora(quando)}`;
}

/** "23 de jun. · 14:30" */
function diaDaConsulta(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  return `${dia} · ${hora(d)}`;
}

/** Linhas cinzentas no lugar dos cartoes, enquanto a primeira carga nao chega. */
function Esqueleto({ linhas }: { linhas: number }) {
  return (
    <div className={estilos.pilha} role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className={estilos.esqueleto} />
      ))}
    </div>
  );
}
