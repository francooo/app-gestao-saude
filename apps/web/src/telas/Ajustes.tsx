import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '@gestao/shared/api/client';
import { contaApi } from '@gestao/shared/api/conta';
import { healthApi, type Profile } from '@gestao/shared/api/health';
import { resumoDoPlano } from '@gestao/shared/lib/plano';
import { formatarTelefone, telefoneParaExibir } from '@gestao/shared/lib/telefone';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { CHAVES, usePerfis, usePlano } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Ajustes.module.css';

/**
 * Ajustes da conta (mock 06 da repaginacao): o menu de secoes a esquerda e o
 * painel "Perfil e dados pessoais" a direita.
 *
 * As outras secoes ja tem tela propria (e-mail e senha, WhatsApp, privacidade,
 * assinatura, familia); o menu leva ate elas. So o perfil mora aqui, porque e
 * curto: nome, e-mail (so leitura — trocar pede a senha) e telefone.
 */
export function Ajustes() {
  const { user, signOut } = useAuth();
  const { confirmar } = useDialogos();
  const { plano } = usePlano();
  const perfis = usePerfis();
  const [saindo, setSaindo] = useState(false);

  const lista = perfis.data ?? [];
  const titular = lista.find((p) => p.isAccountHolder) ?? lista[0] ?? null;

  async function sair() {
    const confirmou = await confirmar('Sair da conta?', 'Você vai precisar entrar de novo com seu e-mail e senha.', 'Sair');
    if (!confirmou) return;
    setSaindo(true);
    await signOut();
  }

  const MENU = [
    { para: null, icone: 'user', rotulo: 'Perfil e dados pessoais' },
    { para: '/conta/whatsapp', icone: 'bell', rotulo: 'Notificações e WhatsApp' },
    { para: '/conta/acesso', icone: 'mail', rotulo: 'E-mail e senha', valor: user?.email },
    { para: '/conta/privacidade', icone: 'lock', rotulo: 'Privacidade e segurança' },
    { para: '/conta/assinatura', icone: 'mci:star-four-points', rotulo: 'Assinatura', valor: resumoDoPlano(plano) },
    { para: '/conta/familia', icone: 'users', rotulo: 'Membros da família', valor: textoDeMembros(lista) },
    { para: '/relatorio', icone: 'file-text', rotulo: 'Relatório para o médico' },
  ];

  return (
    <Pagina area="settings" largura="larga">
      <ScreenHeader
        title="Ajustes da conta"
        subtitle="Gerencie seus dados, preferências e a segurança da sua conta."
        contexto={false}
      />

      <div className={estilos.colunas}>
        <SurfaceCard className={estilos.menu}>
          <nav aria-label="Seções dos ajustes">
            <ul className={estilos.menuLista}>
              {MENU.map((item) => (
                <li key={item.rotulo}>
                  {item.para ? (
                    <Link to={item.para} className={estilos.menuItem}>
                      <Icone nome={item.icone} size={24} />
                      <span className={estilos.menuTextos}>
                        <span>{item.rotulo}</span>
                        {item.valor ? <span className={estilos.menuValor}>{item.valor}</span> : null}
                      </span>
                      <Icone nome="chevron-right" size={20} />
                    </Link>
                  ) : (
                    <span className={estilos.menuItem} aria-current="page">
                      <Icone nome={item.icone} size={24} />
                      <span className={estilos.menuTextos}>
                        <span>{item.rotulo}</span>
                      </span>
                      <Icone nome="chevron-right" size={20} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </SurfaceCard>

        <SurfaceCard className={estilos.painel}>
          <PerfilDaConta titular={titular} />
          <div className={estilos.rodape}>
            <button
              type="button"
              className={`${botoes.contorno} ${estilos.sair}`}
              onClick={() => void sair()}
              disabled={saindo}
            >
              {saindo ? <span className={botoes.girando} aria-label="Saindo" /> : <Icone nome="log-out" size={20} />}
              Sair da conta
            </button>
          </div>
        </SurfaceCard>
      </div>
    </Pagina>
  );
}

/** O painel de perfil: foto do titular, nome, e-mail e telefone. */
function PerfilDaConta({ titular }: { titular: Profile | null }) {
  const queryClient = useQueryClient();
  const conta = useQuery({ queryKey: CHAVES.conta, queryFn: () => contaApi.perfil(), staleTime: 5 * 60_000 });
  const u = conta.data?.user;

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [preenchido, setPreenchido] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  // Preenche UMA vez: uma nova busca nao passa por cima da digitacao.
  useEffect(() => {
    if (preenchido || !u) return;
    setPreenchido(true);
    setNome(titular?.fullName ?? u.fullName ?? '');
    setTelefone(u.phone ? telefoneParaExibir(u.phone) : '');
  }, [u, titular, preenchido]);

  const nomeAtual = titular?.fullName ?? u?.fullName ?? '';
  const telefoneAtual = u?.phone ? telefoneParaExibir(u.phone) : '';
  const mudou = preenchido && (nome.trim() !== nomeAtual || telefone.trim() !== telefoneAtual);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErros({});
    setResultado(null);
    if (nome.trim().length < 2) {
      setErros({ fullName: 'Informe o nome' });
      return;
    }
    setSalvando(true);
    try {
      // O nome vale para a conta E para a ficha do titular: e o mesmo nome em
      // todo o site (saudacao, seletor de membros, relatorio).
      await contaApi.atualizarPerfil({ fullName: nome.trim(), phone: telefone.trim() || null });
      if (titular && nome.trim() !== titular.fullName) {
        await healthApi.updateProfile(titular.id, { fullName: nome.trim() });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVES.conta }),
        queryClient.invalidateQueries({ queryKey: CHAVES.perfis }),
      ]);
      setPreenchido(false);
      setResultado({ ok: true, texto: 'Alterações salvas.' });
    } catch (erro) {
      if (erro instanceof ApiRequestError && erro.fields) setErros(erro.fields);
      setResultado({ ok: false, texto: mensagemDoErro(erro) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={(e) => void salvar(e)} noValidate>
      <div className={estilos.perfilTopo}>
        <div className={estilos.foto}>
          <Avatar
            nome={nomeAtual || 'Você'}
            color={titular?.avatarColor ?? undefined}
            photo={titular?.photo ?? undefined}
            size={128}
          />
          {titular ? (
            <Link
              to={`/membro/${titular.id}?origem=ajustes`}
              className={estilos.trocarFoto}
              aria-label="Trocar a foto e os dados de saúde do titular"
              title="Trocar foto"
            >
              <Icone nome="edit-2" size={18} />
            </Link>
          ) : null}
        </div>
        <div>
          <h2 className={estilos.perfilTitulo}>Perfil e dados pessoais</h2>
          <p className={estilos.perfilTexto}>
            Mantenha suas informações sempre atualizadas para uma melhor experiência no Família Saúde.
          </p>
        </div>
      </div>

      <div className={estilos.campos}>
        <FormField
          label="Nome"
          value={nome}
          onChangeText={(v) => {
            setNome(v);
            setErros((e) => ({ ...e, fullName: '' }));
            setResultado(null);
          }}
          error={erros.fullName || undefined}
          maxLength={120}
          readOnly={salvando}
          autoComplete="name"
          className={estilos.campoInteiro}
        />
        <div className={estilos.campoComLink}>
          <FormField label="E-mail" value={u?.email ?? ''} onChangeText={() => undefined} readOnly hint="Para trocar, confirme sua senha." />
          <Link to="/conta/acesso" className={estilos.linkDoCampo}>
            Alterar e-mail
          </Link>
        </div>
        <FormField
          label="Telefone"
          value={telefone}
          onChangeText={(v) => {
            setTelefone(formatarTelefone(v));
            setErros((e) => ({ ...e, phone: '' }));
            setResultado(null);
          }}
          placeholder="(11) 98765-4321"
          type="tel"
          inputMode="tel"
          maxLength={16}
          error={erros.phone || undefined}
          hint="Opcional. Para contato; não é usado para entrar."
          readOnly={salvando}
          autoComplete="tel"
        />
      </div>

      {resultado ? (
        <p className={estilos.resultado} data-erro={resultado.ok ? undefined : ''} role={resultado.ok ? 'status' : 'alert'}>
          {resultado.texto}
        </p>
      ) : null}

      <PrimaryButton title="Salvar alterações" tom="terracota" type="submit" loading={salvando} disabled={!mudou} className={estilos.salvar} />
    </form>
  );
}

function textoDeMembros(perfis: Profile[]): string | undefined {
  if (perfis.length === 0) return undefined;
  return perfis.length === 1 ? '1 pessoa' : `${perfis.length} pessoas`;
}
