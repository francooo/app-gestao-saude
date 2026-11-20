import { useQueryClient } from '@tanstack/react-query';
import {
  acompanhantesApi,
  ANTECEDENCIAS,
  PERMISSOES,
  type Acompanhante,
  type Antecedencia,
  type Permissao,
} from '@gestao/shared/api/acompanhantes';
import { primeiroNome, rotuloDoAviso, textoDaDose } from '@gestao/shared/lib/mensagensWhatsapp';
import { hora, proximaDose, tituloDoMedicamento } from '@gestao/shared/lib/posologia';
import { telefoneParaExibir } from '@gestao/shared/lib/telefone';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { CHAVES, useAcompanhantes, useRemediosDeHoje } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import mulherCelular from '@/imagens/repag/mulher-celular.webp';
import { usePessoaAtiva } from '@/lib/pessoaAtiva';
import { Interruptor, SettingsGroup, SettingsRow } from '@/ui/Ajustes';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './conta.module.css';
import zap from './Whatsapp.module.css';

/** O que a tela deixa mudar sem abrir o cadastro: o rascunho do "Salvar lembrete". */
type Avisos = Pick<Acompanhante, Permissao | 'active'> & { doseLeadMinutes: number };

function avisosDe(c: Acompanhante): Avisos {
  return {
    active: c.active,
    notifyDose: c.notifyDose,
    notifyLate: c.notifyLate,
    notifyLowStock: c.notifyLowStock,
    notifyTaken: c.notifyTaken,
    notifyAppointment: c.notifyAppointment,
    doseLeadMinutes: c.doseLeadMinutes,
  };
}

/** Icone de cada permissao — o mesmo nas duas telas de acompanhante. */
export const ICONE_DO_AVISO: Record<Permissao, string> = {
  notifyDose: 'clock',
  notifyLate: 'mci:pill',
  notifyLowStock: 'alert-triangle',
  notifyTaken: 'check-circle',
  notifyAppointment: 'calendar',
};

const ROTULO_DA_ANTECEDENCIA: Record<Antecedencia, string> = {
  0: 'No horário da dose',
  15: '15 minutos antes',
  30: '30 minutos antes',
  60: '1 hora antes',
};

/**
 * "(51) 9****-1234": o telefone do acompanhante aparece mascarado (regra de
 * seguranca do design system). O numero inteiro fica no cadastro.
 */
export function telefoneMascarado(digitos: string): string {
  const exibido = telefoneParaExibir(digitos);
  const m = exibido.match(/^\((\d{2})\)\s*(\d)(\d+)-(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}${'*'.repeat(m[3]!.length)}-${m[4]}` : exibido;
}

/** A bolha de previa de uma mensagem de WhatsApp. */
export function PreviaDeMensagem({ texto }: { texto: string }) {
  return (
    <div className={estilos.previa} role="group" aria-label="Prévia da mensagem">
      <span className={estilos.previaIcone} aria-hidden="true">
        <Icone nome="mci:whatsapp" size={22} />
      </span>
      <p className={estilos.previaBolha}>{texto}</p>
    </div>
  );
}

/**
 * Lembretes WhatsApp (mock 08 da repaginacao): quem recebe, de quem, o que,
 * com quanta antecedencia, a previa e a lista de lembretes ativos.
 *
 * As escolhas sao POR ACOMPANHANTE, nao da conta — a avo pode querer so o
 * horario da dose e a baba tambem o estoque. Com mais de um, os chips no topo
 * escolhem de quem sao as preferencias.
 */
export function Whatsapp() {
  const queryClient = useQueryClient();
  const consulta = useAcompanhantes();
  const remedios = useRemediosDeHoje();
  const { membros } = usePessoaAtiva();
  const lista = useMemo(() => consulta.data?.caregivers ?? [], [consulta.data]);
  const configurado = consulta.data?.whatsappConfigurado ?? true;

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Avisos | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  // Mantem quem estava escolhido se ainda existir; se foi removido, cai no
  // primeiro. O rascunho so recomeca do servidor quando a pessoa muda.
  const selecionado = lista.find((c) => c.id === selecionadoId) ?? lista[0] ?? null;
  const idAtual = selecionado?.id ?? null;
  useEffect(() => {
    setSelecionadoId(idAtual);
    const alvo = consulta.data?.caregivers.find((c) => c.id === idAtual);
    setRascunho(alvo ? avisosDe(alvo) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAtual]);

  const mudou =
    selecionado !== null &&
    rascunho !== null &&
    (Object.keys(rascunho) as (keyof Avisos)[]).some((k) => rascunho[k] !== selecionado[k]);

  function mudar<K extends keyof Avisos>(k: K, v: Avisos[K]) {
    setRascunho((r) => (r ? { ...r, [k]: v } : r));
    setResultado(null);
  }

  async function salvar() {
    if (!selecionado || !rascunho) return;
    setSalvando(true);
    setResultado(null);
    try {
      const { doseLeadMinutes, ...resto } = rascunho;
      const salvo = await acompanhantesApi.atualizar(selecionado.id, {
        ...resto,
        doseLeadMinutes: doseLeadMinutes as Antecedencia,
      });
      setRascunho(avisosDe(salvo));
      await queryClient.invalidateQueries({ queryKey: CHAVES.acompanhantes });
      setResultado({ ok: true, texto: 'Lembrete salvo.' });
    } catch (e) {
      setResultado({ ok: false, texto: mensagemDoErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  // Lembretes ativos: cada acompanhante ativo x cada remedio em uso de quem ele acompanha.
  const agora = remedios.data?.agora;
  const ativos = useMemo(() => {
    if (!agora) return [];
    const linhas: { chave: string; paciente: string; remedio: string; hora: string; c: Acompanhante }[] = [];
    for (const c of lista) {
      if (!c.notifyDose) continue;
      for (const m of remedios.data?.remedios ?? []) {
        if (m.profileId !== c.profileId || !m.isActive) continue;
        const q = proximaDose(m, agora);
        if (!q) continue;
        linhas.push({ chave: `${c.id}-${m.id}`, paciente: c.patientName, remedio: tituloDoMedicamento(m), hora: hora(q), c });
      }
    }
    return linhas;
  }, [lista, remedios.data, agora]);

  const lead = (rascunho?.doseLeadMinutes ?? 0) as Antecedencia;
  const paciente = selecionado ? membros.find((p) => p.id === selecionado.profileId) : null;

  return (
    <Pagina area="settings" largura="larga">
      <ScreenHeader
        title="Lembretes WhatsApp"
        subtitle="Conte com o seu acompanhante para lembrar quem você ama, no momento certo."
        ilustracao={mulherCelular}
        voltar="/ajustes"
        contexto={false}
      />

      {/* Discreto de proposito: nao e erro de quem usa, e nada impede de ja
          cadastrar e escolher. So nao promete uma mensagem que nao vai sair. */}
      {!configurado ? (
        <p className={estilos.naoConfigurado} role="status">
          <Icone nome="info" size={16} />
          O envio por WhatsApp ainda não foi ativado no servidor. Você já pode cadastrar e escolher os avisos; as
          mensagens começam quando ele for ativado.
        </p>
      ) : null}

      {consulta.isPending ? (
        <SurfaceCard className={estilos.bloco}>
          <div className={estilos.esqueletoLinha} style={{ padding: 0 }}>
            <span className={estilos.esqueletoAvatar} />
            <span>
              <span className={estilos.esqueletoBarra} style={{ width: 150 }} />
            </span>
          </div>
        </SurfaceCard>
      ) : consulta.isError && lista.length === 0 ? (
        <div className={estilos.bloco}>
          <Aviso icone="alert-circle" erro acao={{ rotulo: 'Tentar de novo', onClick: () => void consulta.refetch() }}>
            {mensagemDoErro(consulta.error)}
          </Aviso>
        </div>
      ) : lista.length === 0 ? (
        // Vazio leva ao cadastro: sem acompanhante, nada desta tela funciona.
        <SurfaceCard className={estilos.vazio}>
          <IconTile icone="mci:account-group" size={54} {...LADRILHO_NEUTRO} />
          <p className={estilos.titulo}>Ninguém recebe os avisos ainda</p>
          <p className={estilos.ajuda}>
            Cadastre alguém de confiança para receber os lembretes dos medicamentos pelo WhatsApp.
          </p>
          <Link to="/conta/acompanhante" className={`${botoes.ambar} ${botoes.largo} ${estilos.vazioBotao}`}>
            Cadastrar acompanhante
          </Link>
        </SurfaceCard>
      ) : selecionado && rascunho ? (
        <>
          <div className={zap.grade}>
            <SurfaceCard className={zap.principal}>
              <div className={zap.duas}>
                {/* Acompanhante: o escolhido, com o interruptor de envio. */}
                <section aria-label="Acompanhante">
                  <h2 className={zap.rotulo}>
                    <Icone nome="user" size={20} /> Acompanhante
                  </h2>
                  {lista.length > 1 ? (
                    <div className={zap.chips} role="group" aria-label="Escolher acompanhante">
                      {lista.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={zap.chip}
                          aria-pressed={c.id === idAtual}
                          onClick={() => {
                            setSelecionadoId(c.id);
                            setResultado(null);
                          }}
                        >
                          {primeiroNome(c.fullName)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className={zap.acompanhante}>
                    <Avatar nome={selecionado.fullName} size={64} />
                    <div className={zap.acompanhanteTextos}>
                      <p className={zap.nome}>
                        {selecionado.fullName}
                        {selecionado.invitedAt ? (
                          <Icone nome="mci:check-decagram" size={18} color="var(--musgo)" />
                        ) : null}
                      </p>
                      <p className={zap.apoio}>
                        {selecionado.relationship ? maiuscula(selecionado.relationship) : 'Acompanhante'}
                      </p>
                      <p className={zap.apoio}>{telefoneMascarado(selecionado.phone)}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rascunho.active}
                      aria-label={`Mensagens para ${primeiroNome(selecionado.fullName)}`}
                      className={zap.interruptor}
                      onClick={() => mudar('active', !rascunho.active)}
                    >
                      <Interruptor ligado={rascunho.active} />
                    </button>
                    <Link
                      to={`/conta/acompanhante?id=${selecionado.id}`}
                      className={zap.editar}
                      aria-label={`Editar ${selecionado.fullName}`}
                    >
                      <Icone nome="chevron-right" size={22} />
                    </Link>
                  </div>
                </section>

                {/* De quem: o acompanhante e de UMA pessoa da familia. */}
                <section aria-label="De quem são os lembretes">
                  <h2 className={zap.rotulo}>
                    <Icone nome="user" size={20} /> Lembretes de
                  </h2>
                  <div className={zap.membro}>
                    {paciente ? (
                      <Avatar
                        nome={paciente.fullName}
                        color={paciente.avatarColor ?? undefined}
                        photo={paciente.photo ?? undefined}
                        size={40}
                      />
                    ) : null}
                    <span>{selecionado.patientName}</span>
                  </div>
                  <p className={zap.apoio}>
                    Para acompanhar outra pessoa, <Link to="/conta/acompanhante">cadastre outro acompanhante</Link>.
                  </p>
                </section>
              </div>

              <div className={zap.tres}>
                <SettingsGroup>
                  <h2 className={`${zap.rotulo} ${zap.rotuloNoGrupo}`}>
                    <Icone nome="bell" size={20} /> Tipo de lembrete
                  </h2>
                  {PERMISSOES.map((k) => (
                    <SettingsRow
                      key={k}
                      marcador={<IconTile icone={ICONE_DO_AVISO[k]} {...LADRILHO_NEUTRO} />}
                      rotulo={rotuloDoAviso(k)}
                      ligado={rascunho.active && rascunho[k]}
                      onChange={(v) => mudar(k, v)}
                      desabilitado={!rascunho.active || salvando}
                      motivoDesabilitado={!rascunho.active ? 'Ative as mensagens para usar' : undefined}
                    />
                  ))}
                </SettingsGroup>

                <div>
                  <label className={zap.rotulo} htmlFor="antecedencia">
                    <Icone nome="calendar" size={20} /> Antecedência
                  </label>
                  <div className={zap.select}>
                    <Icone nome="clock" size={20} />
                    <select
                      id="antecedencia"
                      value={lead}
                      disabled={!rascunho.active || !rascunho.notifyDose || salvando}
                      onChange={(e) => mudar('doseLeadMinutes', Number(e.target.value))}
                    >
                      {ANTECEDENCIAS.map((a) => (
                        <option key={a} value={a}>
                          {ROTULO_DA_ANTECEDENCIA[a]}
                        </option>
                      ))}
                    </select>
                    <Icone nome="chevron-down" size={18} />
                  </div>
                  <p className={zap.apoio}>
                    Vale para o lembrete do horário dos medicamentos. As consultas usam a antecedência escolhida em
                    cada consulta.
                  </p>

                  <p className={`${zap.rotulo} ${zap.rotuloSeguinte}`}>
                    <Icone nome="message-square" size={20} /> Receber no WhatsApp
                  </p>
                  <p className={zap.apoio}>
                    {rascunho.active
                      ? `${primeiroNome(selecionado.fullName)} recebe o lembrete por mensagem no WhatsApp.`
                      : 'As mensagens estão pausadas. Ligue o interruptor do acompanhante para voltar a enviar.'}
                  </p>
                </div>
              </div>

              {resultado ? (
                <p className={estilos.resultado} data-erro={resultado.ok ? undefined : ''} role={resultado.ok ? 'status' : 'alert'}>
                  {resultado.texto}
                </p>
              ) : null}

              <PrimaryButton
                title="Salvar lembrete"
                tom="terracota"
                onClick={() => void salvar()}
                loading={salvando}
                disabled={!mudou}
                className={zap.salvar}
              />
            </SurfaceCard>

            <SurfaceCard className={zap.lateral}>
              <h2 className={zap.previaTitulo}>Prévia da mensagem</h2>
              {/* Remedio e hora de exemplo; o nome e o de verdade, porque e ele que
                  vai aparecer na tela de bloqueio de quem recebe. */}
              <PreviaDeMensagem
                texto={textoDaDose({ paciente: selecionado.patientName, remedio: 'Amoxicilina 500 mg', hora: '14:00' })}
              />
              <p className={zap.apoio}>
                Exemplo. {lead > 0 ? `Chega às ${chegada(14, 0, lead)}, ${ROTULO_DA_ANTECEDENCIA[lead].toLowerCase()} da dose.` : 'Chega no horário da dose.'}
              </p>
            </SurfaceCard>
          </div>

          <SurfaceCard className={zap.ativos}>
            <h2 className={zap.ativosTitulo}>
              <Icone nome="sprout" size={22} /> Lembretes ativos
              <Icone nome="heart" size={18} />
            </h2>
            <p className={zap.apoio}>Seus lembretes programados e em andamento.</p>
            {ativos.length === 0 ? (
              <p className={zap.vazio}>Nenhum lembrete de dose programado para os acompanhantes.</p>
            ) : (
              <ul className={zap.lista}>
                {ativos.map((l) => (
                  <li key={l.chave} className={zap.linha}>
                    <span className={zap.linhaIcone} aria-hidden="true">
                      <Icone nome="mci:pill" size={22} />
                    </span>
                    <span className={zap.coluna}>
                      <span className={zap.forte}>{primeiroNome(l.paciente)}</span>
                      <span className={zap.apoio}>
                        {l.remedio} · {l.hora}
                      </span>
                    </span>
                    <span className={zap.coluna}>
                      <span className={zap.apoio}>Antecedência</span>
                      <span className={zap.forte}>
                        {ROTULO_DA_ANTECEDENCIA[(l.c.doseLeadMinutes ?? 0) as Antecedencia]}
                      </span>
                    </span>
                    <span className={zap.coluna}>
                      <span className={zap.apoio}>Enviado para</span>
                      <span className={zap.forte}>{primeiroNome(l.c.fullName)} (acompanhante)</span>
                    </span>
                    <span className={zap.status} data-ativo={l.c.active ? '' : undefined}>
                      <span aria-hidden="true">●</span> {l.c.active ? 'Ativo' : 'Pausado'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SurfaceCard>

          <div className={zap.cadastrar}>
            <Link to="/conta/acompanhante" className={botoes.contorno}>
              <Icone nome="user-plus" size={18} />
              Cadastrar outro acompanhante
            </Link>
          </div>
        </>
      ) : null}
    </Pagina>
  );
}

function chegada(h: number, m: number, antes: number): string {
  const total = h * 60 + m - antes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
