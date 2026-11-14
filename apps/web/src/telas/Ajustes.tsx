import type { Professional, Profile } from '@gestao/shared/api/health';
import { resumoDoPlano } from '@gestao/shared/lib/plano';
import { useState } from 'react';
import { Link } from 'react-router';

import { usePerfis, usePlano, useTodosOsMedicos } from '@/api/consultas';
import { useAuth } from '@/auth/AuthProvider';
import { SettingsGroup, SettingsRow } from '@/ui/Ajustes';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { useDialogos } from '@/ui/Dialogo';
import { Icone } from '@/ui/Icone';
import { IconTile } from '@/ui/IconTile';
import { Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Ajustes.module.css';

/**
 * Paleta das linhas. A rotacao verde-ambar-terracota e cadencia visual, nao
 * semantica: o ambar aqui e cor de categoria, e o sinal de "tem coisa para
 * fazer" continua reservado aos botoes.
 */
const VERDE = { fundo: 'var(--cor-pill-tablet)', traco: 'var(--cor-section-title)' } as const;
const AMBAR = { fundo: 'var(--cor-tile-sun)', traco: 'var(--cor-surface)' } as const;
const TERRACOTA = { fundo: 'var(--cor-terracotta)', traco: 'var(--cor-surface)' } as const;

export function Ajustes() {
  const { user, signOut } = useAuth();
  const { confirmar } = useDialogos();
  const { plano } = usePlano();
  const perfis = usePerfis();
  const medicos = useTodosOsMedicos();
  const [saindo, setSaindo] = useState(false);

  const lista = perfis.data ?? [];
  const titular = lista.find((p) => p.isAccountHolder) ?? lista[0] ?? null;
  const dadosPessoais = titular ? `/membro/${titular.id}?origem=ajustes` : undefined;

  async function sair() {
    // Confirmar algo que nao destroi nada tem motivo: num computador da
    // familia, sair sem querer tranca os horarios de remedio de todo mundo ate
    // alguem lembrar a senha.
    const confirmou = await confirmar(
      'Sair da conta?',
      'Você vai precisar entrar de novo com seu e-mail e senha.',
      'Sair',
    );
    if (!confirmou) return;
    setSaindo(true);
    await signOut();
  }

  return (
    <Pagina area="settings" largura="larga">
      <ScreenHeader title="Ajustes" subtitle="Sua conta, a família e as preferências" />

      <div className={estilos.colunas}>
        <div className={estilos.coluna}>
          <CartaoDoTitular
            titular={titular}
            carregando={perfis.isPending}
            editar={dadosPessoais}
          />

          <section className={estilos.secao}>
            {/* Segunda linha so onde ela carrega ESTADO (o e-mail, quantas pessoas). */}
            <SectionHeader title="Minha conta" />
            <SettingsGroup>
              <SettingsRow
                marcador={<IconTile icone="user" {...VERDE} />}
                rotulo="Dados pessoais"
                para={dadosPessoais}
                desabilitado={!titular}
              />
              <SettingsRow
                marcador={<IconTile icone="mail" {...AMBAR} />}
                rotulo="E-mail e senha"
                valor={user?.email}
                reservarValor
                para="/conta/acesso"
              />
              <SettingsRow
                marcador={<IconTile icone="users" {...TERRACOTA} />}
                rotulo="Membros da família"
                valor={textoDeMembros(lista)}
                reservarValor
                para="/conta/familia"
              />
              <SettingsRow
                marcador={<IconTile icone="mci:star-four-points" {...VERDE} />}
                rotulo="Assinatura"
                valor={resumoDoPlano(plano)}
                reservarValor
                para="/conta/assinatura"
              />
            </SettingsGroup>
          </section>
        </div>

        <div className={estilos.coluna}>
          <section className={estilos.secaoDoTopo}>
            <SectionHeader title="Profissionais vinculados" />
            <Profissionais
              medicos={medicos.data ?? []}
              carregando={medicos.isPending}
              erro={medicos.isError}
            />
          </section>

          <section className={estilos.secao}>
            <SectionHeader title="Preferências" />
            <SettingsGroup>
              <SettingsRow
                marcador={<IconTile icone="file-text" {...AMBAR} />}
                rotulo="Relatório para o médico"
                valor="Remédios, doses e sintomas em PDF"
                para="/relatorio"
              />
              <SettingsRow
                marcador={<IconTile icone="mci:whatsapp" {...VERDE} />}
                rotulo="Lembretes por WhatsApp"
                para="/conta/whatsapp"
              />
              <SettingsRow
                marcador={<IconTile icone="mci:shield-check-outline" {...TERRACOTA} />}
                rotulo="Privacidade e segurança"
                para="/conta/privacidade"
              />
            </SettingsGroup>

            {/* No aplicativo esta secao tem os interruptores de notificacao do
                aparelho. O navegador nao agenda alarme: em vez de interruptores
                que nao fariam nada, a tela diz onde os lembretes tocam. */}
            <p className={estilos.nota}>
              <Icone nome="bell" size={16} />
              <span>
                Os lembretes de dose e de consulta tocam no aplicativo do celular. Aqui no site, o
                que precisa de atenção aparece em <Link to="/notificacoes">Avisos</Link>.
              </span>
            </p>
          </section>
        </div>
      </div>

      {/* Sair e contornado verde, largura contida, por ULTIMO: nao e linha com
          seta (as setas desta tela tem destino) nem ambar (que e pendencia). */}
      <button
        type="button"
        className={`${botoes.contorno} ${estilos.sair}`}
        onClick={() => void sair()}
        disabled={saindo}
      >
        {saindo ? (
          <span className={botoes.girando} aria-label="Saindo" />
        ) : (
          <>
            <Icone nome="log-out" size={18} />
            Sair
          </>
        )}
      </button>
    </Pagina>
  );
}

function CartaoDoTitular({
  titular,
  carregando,
  editar,
}: {
  titular: Profile | null;
  carregando: boolean;
  editar: string | undefined;
}) {
  if (carregando && !titular) {
    return (
      <SurfaceCard className={estilos.titular}>
        <span className={estilos.esqueletoAvatar} />
        <span className={estilos.titularTextos}>
          <span className={estilos.esqueletoBarra} style={{ width: 150 }} />
          <span className={estilos.esqueletoBarra} style={{ width: 90, height: 12, marginTop: 8 }} />
        </span>
      </SurfaceCard>
    );
  }

  // O cartao le do PERFIL titular, e nao da conta: a foto so existe no perfil,
  // e nome de um lugar com foto de outro acabaria divergindo.
  const nome = titular?.fullName ?? 'Minha conta';

  return (
    <SurfaceCard className={estilos.titular}>
      <Avatar
        nome={nome}
        photo={titular?.photo}
        color={titular?.avatarColor ?? undefined}
        size={64}
      />
      <div className={estilos.titularTextos}>
        <p className={estilos.titularNome}>{nome}</p>
        <p className={estilos.titularPapel}>
          {titular ? 'Conta principal' : 'Não consegui carregar seus dados'}
        </p>
      </div>
      {editar ? (
        <Link to={editar} className={estilos.editar} aria-label="Editar meus dados pessoais">
          <Icone nome="edit" size={20} />
        </Link>
      ) : null}
    </SurfaceCard>
  );
}

function Profissionais({
  medicos,
  carregando,
  erro,
}: {
  medicos: Professional[];
  carregando: boolean;
  erro: boolean;
}) {
  if (carregando && medicos.length === 0) {
    return (
      <div className={estilos.medicos}>
        {[0, 1].map((i) => (
          <SurfaceCard key={i} className={estilos.medico}>
            <span className={estilos.esqueletoAvatar} style={{ width: 52, height: 52 }} />
            <span className={estilos.esqueletoBarra} style={{ flex: 1, marginLeft: 12 }} />
          </SurfaceCard>
        ))}
      </div>
    );
  }

  // O vazio ocupa espaco AQUI porque ele mesmo oferece a acao que o preenche.
  if (medicos.length === 0 && !erro) {
    return (
      <SurfaceCard className={estilos.vazio}>
        <IconTile icone="user-plus" size={54} {...VERDE} />
        <p className={estilos.vazioTitulo}>Nenhum médico cadastrado</p>
        <p className={estilos.vazioAjuda}>
          Cadastre quem acompanha a família para agendar consultas e vincular receitas.
        </p>
        <Link to="/medico/novo" className={`${botoes.verde} ${botoes.largo} ${estilos.vazioBotao}`}>
          <Icone nome="plus" size={18} />
          Cadastrar médico
        </Link>
      </SurfaceCard>
    );
  }

  return (
    <>
      {medicos.length > 0 ? (
        <div className={estilos.medicos}>
          {medicos.slice(0, 2).map((m) => (
            <Link
              key={m.id}
              to={`/medico/${m.id}`}
              className={estilos.medico}
              aria-label={`${m.name}, ${m.specialty ?? 'sem especialidade'}`}
            >
              <Avatar nome={m.name} photo={m.photo} size={52} />
              <span className={estilos.medicoTextos}>
                <span className={estilos.medicoNome}>{m.name}</span>
                {m.specialty ? (
                  <span className={estilos.medicoEspecialidade}>{m.specialty}</span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <SurfaceCard className={estilos.vazio}>
          <Icone nome="alert-circle" size={22} color="var(--cor-text-error)" />
          <p className={estilos.vazioAjuda}>Não consegui carregar os médicos agora.</p>
        </SurfaceCard>
      )}

      {/* A linha permanece mesmo com a lista falhando: gerenciar nao depende de listar. */}
      <SettingsGroup className={estilos.gerenciar}>
        <SettingsRow
          marcador={<IconTile icone="user-plus" {...VERDE} />}
          rotulo="Gerenciar médicos"
          valor={medicos.length > 0 ? `${medicos.length} cadastrados` : undefined}
          reservarValor
          para="/medicos"
        />
      </SettingsGroup>
    </>
  );
}

function textoDeMembros(perfis: Profile[]): string | undefined {
  if (perfis.length === 0) return undefined;
  return perfis.length === 1 ? 'Só você' : `${perfis.length} pessoas`;
}
