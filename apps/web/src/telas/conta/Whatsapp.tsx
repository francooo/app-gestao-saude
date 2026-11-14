import { useQueryClient } from '@tanstack/react-query';
import {
  acompanhantesApi,
  PERMISSOES,
  type Acompanhante,
  type Permissao,
} from '@gestao/shared/api/acompanhantes';
import { primeiroNome, rotuloDoAviso, textoDaDose } from '@gestao/shared/lib/mensagensWhatsapp';
import { telefoneParaExibir } from '@gestao/shared/lib/telefone';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { CHAVES, useAcompanhantes } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { Interruptor, SettingsGroup, SettingsRow } from '@/ui/Ajustes';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { FilterChips } from '@/ui/FilterChips';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './conta.module.css';

/** O que a tela deixa mudar sem abrir o cadastro: o rascunho do "Salvar avisos". */
type Avisos = Pick<Acompanhante, Permissao | 'active'>;

function avisosDe(c: Acompanhante): Avisos {
  return {
    active: c.active,
    notifyDose: c.notifyDose,
    notifyLate: c.notifyLate,
    notifyLowStock: c.notifyLowStock,
    notifyTaken: c.notifyTaken,
  };
}

/** Icone de cada permissao — o mesmo nas duas telas de acompanhante. */
export const ICONE_DO_AVISO: Record<Permissao, string> = {
  notifyDose: 'clock',
  notifyLate: 'mci:pill',
  notifyLowStock: 'alert-triangle',
  notifyTaken: 'check-circle',
};

/** A bolha de previa de uma mensagem de WhatsApp. */
export function PreviaDeMensagem({ texto }: { texto: string }) {
  return (
    <div className={estilos.previa} role="group" aria-label="Prévia da mensagem">
      <span className={estilos.previaIcone} aria-hidden="true">
        <Icone nome="mci:dots-horizontal" size={22} />
      </span>
      <p className={estilos.previaBolha}>{texto}</p>
    </div>
  );
}

/**
 * Lembretes por WhatsApp: quem recebe e o que recebe (/conta/whatsapp).
 *
 * As escolhas sao POR ACOMPANHANTE, nao da conta — a avo pode querer so o
 * horario da dose e a baba tambem o estoque. Com mais de um, os chips no topo
 * escolhem de quem sao o interruptor e as preferencias.
 */
export function Whatsapp() {
  const queryClient = useQueryClient();
  const consulta = useAcompanhantes();
  const lista = consulta.data?.caregivers ?? [];
  const configurado = consulta.data?.whatsappConfigurado ?? true;

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Avisos | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  // Mantem quem estava escolhido se ainda existir; se foi removido, cai no
  // primeiro. O rascunho so recomeca do servidor quando a pessoa muda — uma
  // nova busca nao passa por cima de interruptores ja mexidos.
  const selecionado = lista.find((c) => c.id === selecionadoId) ?? lista[0] ?? null;
  const idAtual = selecionado?.id ?? null;
  useEffect(() => {
    setSelecionadoId(idAtual);
    const alvo = consulta.data?.caregivers.find((c) => c.id === idAtual);
    setRascunho(alvo ? avisosDe(alvo) : null);
    // So ao trocar de pessoa (ou quando a lista chega pela primeira vez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAtual]);

  const mudou =
    selecionado !== null &&
    rascunho !== null &&
    (Object.keys(rascunho) as (keyof Avisos)[]).some((k) => rascunho[k] !== selecionado[k]);

  function escolher(id: string | null) {
    if (!id) return;
    setSelecionadoId(id);
    setResultado(null);
  }

  function mudar(k: keyof Avisos, v: boolean) {
    setRascunho((r) => (r ? { ...r, [k]: v } : r));
    setResultado(null);
  }

  async function salvar() {
    if (!selecionado || !rascunho) return;
    setSalvando(true);
    setResultado(null);
    try {
      const salvo = await acompanhantesApi.atualizar(selecionado.id, rascunho);
      setRascunho(avisosDe(salvo));
      await queryClient.invalidateQueries({ queryKey: CHAVES.acompanhantes });
      setResultado({ ok: true, texto: 'Avisos salvos.' });
    } catch (e) {
      setResultado({ ok: false, texto: mensagemDoErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina area="settings">
      <ScreenHeader title="Lembretes por WhatsApp" voltar="/ajustes" mostrarSino />

      <SurfaceCard className={estilos.apresentacao}>
        <span className={estilos.circulo}>
          <Icone nome="mci:whatsapp" size={34} />
        </span>
        <div className={estilos.linhaTextos}>
          <p className={estilos.titulo}>Receba lembretes dos medicamentos pelo WhatsApp</p>
          <p className={estilos.ajuda}>Uma mensagem será enviada no horário de cada dose.</p>
        </div>
      </SurfaceCard>

      {/* Discreto de proposito: nao e erro de quem usa, e nada impede de ja
          cadastrar e escolher. So nao promete uma mensagem que nao vai sair. */}
      {!configurado ? (
        <p className={estilos.naoConfigurado} role="status">
          <Icone nome="info" size={16} />
          O envio por WhatsApp ainda não foi ativado no servidor. Você já pode cadastrar e escolher
          os avisos; as mensagens começam quando ele for ativado.
        </p>
      ) : null}

      {consulta.isPending ? (
        <SurfaceCard className={estilos.bloco}>
          <div className={estilos.esqueletoLinha} style={{ padding: 0 }}>
            <span className={estilos.esqueletoAvatar} />
            <span>
              <span className={estilos.esqueletoBarra} style={{ width: 150 }} />
              <span
                className={estilos.esqueletoBarra}
                style={{ width: 100, height: 12, marginTop: 6 }}
              />
            </span>
          </div>
        </SurfaceCard>
      ) : consulta.isError && lista.length === 0 ? (
        <div className={estilos.bloco}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void consulta.refetch() }}
          >
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
          <Link
            to="/conta/acompanhante"
            className={`${botoes.ambar} ${botoes.largo} ${estilos.vazioBotao}`}
          >
            Cadastrar acompanhante
          </Link>
        </SurfaceCard>
      ) : (
        <>
          {/* So aparece com dois ou mais: o FilterChips some com um chip. */}
          <div className={estilos.bloco}>
            <FilterChips
              chips={lista.map((c) => ({
                value: c.id,
                label: `${primeiroNome(c.fullName)} · ${primeiroNome(c.patientName)}`,
              }))}
              selected={idAtual}
              onSelect={escolher}
              rotulo="Acompanhante"
            />
          </div>

          {selecionado && rascunho ? (
            <button
              type="button"
              role="switch"
              aria-checked={rascunho.active}
              aria-label={`Ativar mensagens para ${primeiroNome(selecionado.fullName)}`}
              className={estilos.ativar}
              onClick={() => mudar('active', !rascunho.active)}
            >
              Ativar mensagens
              <Interruptor ligado={rascunho.active} />
            </button>
          ) : null}

          <SurfaceCard className={estilos.bloco}>
            <h2 className={estilos.tituloDoCartao}>Quem vai receber?</h2>
            {lista.map((c) => (
              <Link
                key={c.id}
                to={`/conta/acompanhante?id=${c.id}`}
                className={estilos.pessoa}
                data-escolhida={c.id === idAtual && lista.length > 1 ? '' : undefined}
                aria-label={`${c.fullName}, acompanha ${primeiroNome(c.patientName)}. Editar`}
              >
                <Avatar nome={c.fullName} size={56} />
                <span className={estilos.pessoaTextos}>
                  <span className={estilos.pessoaNome}>
                    <span>{c.fullName}</span>
                    {/* O selo diz que o convite CHEGOU, nao so que existe o cadastro. */}
                    {c.invitedAt ? (
                      <Icone nome="mci:check-decagram" size={18} color="var(--cor-accent-green)" />
                    ) : null}
                  </span>
                  <span className={estilos.pessoaApoio}>
                    {[
                      c.relationship ? maiuscula(c.relationship) : 'Acompanhante',
                      `cuida de ${primeiroNome(c.patientName)}`,
                    ].join(' · ')}
                  </span>
                  <span className={estilos.pessoaApoio}>
                    <Icone nome="phone" size={14} />
                    {telefoneParaExibir(c.phone)}
                  </span>
                  {!c.active ? <span className={estilos.pausado}>Mensagens pausadas</span> : null}
                </span>
                <Icone nome="chevron-right" size={20} color="var(--cor-text-secondary)" />
              </Link>
            ))}

            <Link
              to="/conta/acompanhante"
              className={`${botoes.contorno} ${botoes.largo} ${estilos.cadastrar}`}
            >
              <Icone nome="user-plus" size={18} />
              Cadastrar acompanhante
            </Link>
          </SurfaceCard>

          {selecionado && rascunho ? (
            <>
              <SettingsGroup className={estilos.bloco}>
                <h2 className={`${estilos.tituloDoCartao} ${estilos.tituloComRecuo}`}>
                  Preferências de envio
                </h2>
                {PERMISSOES.map((k) => (
                  <SettingsRow
                    key={k}
                    marcador={<IconTile icone={ICONE_DO_AVISO[k]} {...LADRILHO_NEUTRO} />}
                    rotulo={rotuloDoAviso(k)}
                    ligado={rascunho.active && rascunho[k]}
                    onChange={(v) => mudar(k, v)}
                    desabilitado={!rascunho.active || salvando}
                    motivoDesabilitado={
                      !rascunho.active ? 'Ative as mensagens para usar' : undefined
                    }
                  />
                ))}
              </SettingsGroup>

              <SurfaceCard className={estilos.bloco}>
                <h2 className={estilos.tituloDoCartao}>Prévia da mensagem</h2>
                {/* Remedio e hora de exemplo; o nome e o de verdade, porque e
                    ele que vai aparecer na tela de bloqueio de quem recebe. */}
                <PreviaDeMensagem
                  texto={textoDaDose({
                    paciente: selecionado.patientName,
                    remedio: 'Amoxicilina 500 mg',
                    hora: '14:00',
                  })}
                />
                <p className={estilos.exemplo}>Exemplo. O remédio e o horário mudam a cada dose.</p>

                {resultado ? (
                  <p
                    className={estilos.resultado}
                    data-erro={resultado.ok ? undefined : ''}
                    role={resultado.ok ? 'status' : 'alert'}
                  >
                    {resultado.texto}
                  </p>
                ) : null}

                <PrimaryButton
                  title="Salvar avisos"
                  onClick={() => void salvar()}
                  loading={salvando}
                  disabled={!mudou}
                  className={estilos.botao}
                />
                <p className={estilos.rodape}>Você pode alterar essas escolhas quando quiser.</p>
              </SurfaceCard>
            </>
          ) : null}
        </>
      )}
    </Pagina>
  );
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
