import { vigenteHoje } from '@gestao/shared/lib/posologia';
import { guardarFotoParaLeitura } from '@gestao/shared/lib/rascunhoDeMedicamento';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  useConsultasFuturas,
  useMedicos,
  usePerfis,
  usePlano,
  useRemediosDeHoje,
} from '@/api/consultas';
import { FundoDeTela } from '@/layout/FundoDeTela';
import { escolherFotoDeDocumento } from '@/lib/foto';
import { AppointmentCard } from '@/ui/AppointmentCard';
import { useDialogos } from '@/ui/Dialogo';
import { DoctorCard } from '@/ui/DoctorCard';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { MedicationCard } from '@/ui/MedicationCard';
import { PontoDeAvisos } from '@/ui/PontoDeAvisos';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import { CabecalhoDaFamilia } from './inicio/CabecalhoDaFamilia';
import { AssistantCard, CartaoLerReceita } from './inicio/CartoesDeIA';
import estilos from './Inicio.module.css';

/**
 * Tela inicial: o resumo do dia da familia.
 *
 * O conteudo e o da Inicio do aplicativo. O que muda e a disposicao: no
 * celular e uma coluna so, na ordem do aplicativo; em tela larga, o que e do
 * dia (remedios, medicos) fica na coluna principal e os atalhos (IA, diario,
 * consultas) na lateral.
 */
export function Inicio() {
  /** Quem a tela esta mostrando. null = a familia inteira. */
  const [perfilId, setPerfilId] = useState<string | null>(null);

  const perfis = usePerfis();
  const remedios = useRemediosDeHoje();
  const consultas = useConsultasFuturas();
  const medicos = useMedicos(perfilId);
  /**
   * Os dois cartoes de IA sao recursos do plano. Sem ele continuam na tela
   * (sao a vitrine do que a assinatura traz), com selo, e levam a assinatura.
   */
  const { premium } = usePlano();
  const navigate = useNavigate();
  const { avisar } = useDialogos();

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
  const selecionado = listaDePerfis.find((p) => p.id === perfilId) ?? null;
  const primeiroNome = selecionado?.fullName.split(' ')[0] ?? null;
  /** "Medicamentos de hoje · Valentina" quando ha alguem selecionado. */
  const deQuem = (titulo: string) => (primeiroNome ? `${titulo} · ${primeiroNome}` : titulo);

  // O filtro por pessoa e em memoria para remedios e consultas: a familia
  // inteira ja veio, e trocar de pessoa nao precisa de outra viagem.
  const agora = remedios.data?.agora;
  const deHoje = useMemo(() => {
    if (!remedios.data) return [];
    const { remedios: todos, agora: referencia } = remedios.data;
    return todos
      .filter((m) => (perfilId ? m.profileId === perfilId : true))
      .filter((m) => vigenteHoje(m, referencia))
      .slice(0, 3);
  }, [remedios.data, perfilId]);

  // Tres de cada, como no aplicativo: a lista completa e assunto de outra tela.
  const consultasVisiveis = (consultas.data ?? [])
    .filter((c) => (perfilId ? c.profileId === perfilId : true))
    .slice(0, 3);
  const medicosVisiveis = (medicos.data ?? []).slice(0, 3);

  return (
    <>
      <FundoDeTela area="home" arranjo="home" />

      <main className={estilos.tela}>
        <div className={estilos.topo}>
          <CabecalhoDaFamilia
            membros={listaDePerfis.map((p) => ({
              id: p.id,
              nome: p.fullName,
              cor: p.avatarColor,
              foto: p.photo,
            }))}
            selecionadoId={perfilId}
            // Clicar de novo em quem ja esta selecionado volta para a familia.
            onSelecionar={(id) => setPerfilId((atual) => (atual === id ? null : id))}
            carregando={perfis.isPending}
            erro={perfis.isError}
          />

          {/* O sino flutua sobre a faixa ilustrada. Em tela larga ele ja esta
              no menu lateral, e este some. */}
          <Link to="/notificacoes" className={estilos.sino} aria-label="Avisos">
            <Icone nome="bell" size={20} />
            <PontoDeAvisos />
          </Link>
        </div>

        <div className={estilos.colunas}>
          <div className={estilos.principal}>
            <section className={estilos.remedios} aria-label={deQuem('Medicamentos de hoje')}>
              <SectionHeader title={deQuem('Medicamentos de hoje')} verTodos="/remedios" />
              {remedios.isPending ? (
                <Esqueleto linhas={2} />
              ) : remedios.isError && !remedios.data ? (
                <Recado>Não consegui carregar os remédios. Tente de novo em instantes.</Recado>
              ) : deHoje.length === 0 || !agora ? (
                <SurfaceCard className={estilos.vazio}>
                  {primeiroNome
                    ? `${primeiroNome} não tem remédio para hoje.`
                    : 'Nenhum remédio para hoje. Abra Ver todos para cadastrar.'}
                </SurfaceCard>
              ) : (
                <div className={estilos.pilha}>
                  {deHoje.map((m) => (
                    <MedicationCard
                      key={m.id}
                      medicamento={m}
                      agora={agora}
                      // Com uma pessoa selecionada, repetir o nome dela em cada
                      // cartao e ruido — o titulo da secao ja diz de quem e.
                      mostrarPerfil={perfilId === null}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className={estilos.medicos} aria-label={deQuem('Médicos')}>
              <SectionHeader title={deQuem('Médicos')} verTodos="/medicos" />
              {medicos.isPending ? (
                <Esqueleto linhas={2} />
              ) : medicosVisiveis.length === 0 ? (
                <Recado>
                  {primeiroNome
                    ? `Nenhum médico de ${primeiroNome}.`
                    : 'Nenhum médico cadastrado.'}
                </Recado>
              ) : (
                <div className={estilos.pilha}>
                  {medicosVisiveis.map((md) => (
                    <DoctorCard key={md.id} doctor={md} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className={estilos.lateral}>
            <div className={estilos.lerReceita}>
              <CartaoLerReceita bloqueado={!premium} onEscolher={(camera) => void lerReceita(camera)} />
            </div>

            <div className={estilos.assistente}>
              <AssistantCard bloqueado={!premium} />
            </div>

            {/* Ladrilho NEUTRO, nunca ambar: nao ter registrado nada hoje nao e
                tarefa pendente, e ambar significa isso em todo o aplicativo. */}
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

            <section className={estilos.consultas} aria-label={deQuem('Próximas consultas')}>
              <SectionHeader title={deQuem('Próximas consultas')} verTodos="/medicos" />
              {consultas.isPending ? (
                <Esqueleto linhas={1} />
              ) : consultasVisiveis.length === 0 ? (
                <Recado>
                  {primeiroNome
                    ? `Nenhuma consulta agendada para ${primeiroNome}.`
                    : 'Nenhuma consulta agendada.'}
                </Recado>
              ) : (
                <div className={estilos.pilha}>
                  {consultasVisiveis.map((c) => (
                    <AppointmentCard key={c.id} consulta={c} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function Recado({ children }: { children: string }) {
  return <p className={estilos.recado}>{children}</p>;
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
