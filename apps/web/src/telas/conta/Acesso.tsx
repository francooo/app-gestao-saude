import { API_ERROR } from '@gestao/shared';
import { contaApi } from '@gestao/shared/api/conta';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { ApiRequestError, authApi } from '@/api/cliente';
import { mensagemDoErro } from '@/api/doses';
import { useAuth } from '@/auth/AuthProvider';
import botoes from '@/ui/botoes.module.css';
import { FormField } from '@/ui/FormField';
import { IconTile } from '@/ui/IconTile';
import { Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './conta.module.css';

const AMBAR = { fundo: 'var(--cor-tile-sun)', traco: 'var(--cor-surface)' } as const;

/** E-mail e senha da conta (/conta/acesso). */
export function Acesso() {
  const { user } = useAuth();

  return (
    <Pagina area="settings" largura="larga">
      <ScreenHeader title="E-mail e senha" voltar="/ajustes" />

      <div className={estilos.duasColunas}>
        <BlocoDeEmail emailAtual={user?.email ?? '—'} />
        <BlocoDeSenha emailAtual={user?.email ?? ''} />
      </div>
    </Pagina>
  );
}

function codigoDe(e: unknown): string | undefined {
  return e instanceof ApiRequestError ? e.code : undefined;
}

function BlocoDeEmail({ emailAtual }: { emailAtual: string }) {
  const [novo, setNovo] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<{ novo?: string; senha?: string; geral?: string }>({});
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const alvo = novo.trim().toLowerCase();
    const novosErros: typeof erros = {};

    if (!alvo) novosErros.novo = 'Informe o novo e-mail';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)) novosErros.novo = 'Informe um e-mail válido';
    else if (alvo === emailAtual.toLowerCase()) novosErros.novo = 'Este já é o seu e-mail';
    if (!senha) novosErros.senha = 'Informe sua senha atual';

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEnviando(true);
    try {
      await contaApi.pedirTrocaDeEmail({ currentPassword: senha, newEmail: alvo });
      setPedido(alvo);
    } catch (erro) {
      // Senha errada tem campo proprio; o resto vira aviso geral.
      if (codigoDe(erro) === API_ERROR.WRONG_PASSWORD) {
        setErros({ senha: 'Senha incorreta' });
        setSenha('');
      } else {
        setErros({ geral: mensagemDoErro(erro) });
      }
    } finally {
      setEnviando(false);
    }
  }

  if (pedido) {
    return (
      <section className={estilos.secao}>
        <SectionHeader title="E-mail" />
        <SurfaceCard>
          <div className={estilos.linhaIcone} role="status">
            <IconTile icone="mail" {...AMBAR} />
            <div className={estilos.linhaTextos}>
              <p className={estilos.titulo}>Confirme no seu e-mail</p>
              <p className={estilos.ajuda}>
                Enviamos um link para <span className={estilos.destaque}>{pedido}</span>. O
                endereço só muda depois que você abrir o link — até lá, o atual continua valendo.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    );
  }

  return (
    <section className={estilos.secao}>
      <SectionHeader title="E-mail" />
      <SurfaceCard>
        <form onSubmit={(e) => void enviar(e)} noValidate>
          <p className={estilos.rotuloPequeno}>E-MAIL ATUAL</p>
          <p className={estilos.emailAtual}>{emailAtual}</p>

          <hr className={estilos.divisor} />

          <FormField
            label="Novo e-mail"
            value={novo}
            onChangeText={setNovo}
            type="email"
            placeholder="nome@exemplo.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            error={erros.novo}
            readOnly={enviando}
          />
          <FormField
            label="Senha atual"
            value={senha}
            onChangeText={setSenha}
            secure
            autoComplete="current-password"
            error={erros.senha}
            readOnly={enviando}
          />

          <p className={`${estilos.ajuda} ${estilos.ajudaAntesDoBotao}`}>
            Vamos mandar um link para o endereço novo. Ele só passa a valer quando você abrir esse
            link — assim um endereço digitado errado não tranca sua conta.
          </p>

          {erros.geral ? (
            <p className={estilos.erroGeral} role="alert">
              {erros.geral}
            </p>
          ) : null}

          <PrimaryButton title="Alterar e-mail" type="submit" loading={enviando} />
        </form>
      </SurfaceCard>
    </section>
  );
}

function BlocoDeSenha({ emailAtual }: { emailAtual: string }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [erros, setErros] = useState<{
    atual?: string;
    nova?: string;
    repete?: string;
    geral?: string;
  }>({});
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const novosErros: typeof erros = {};
    if (!atual) novosErros.atual = 'Informe sua senha atual';
    if (nova.length < 8) novosErros.nova = 'A senha deve ter ao menos 8 caracteres';
    else if (nova.length > 72) novosErros.nova = 'A senha deve ter no máximo 72 caracteres';
    else if (nova === atual) novosErros.nova = 'A nova senha precisa ser diferente da atual';
    if (repete !== nova) novosErros.repete = 'As senhas não são iguais';

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEnviando(true);
    try {
      await contaApi.trocarSenha({ currentPassword: atual, newPassword: nova });
      setPronto(true);
    } catch (erro) {
      if (codigoDe(erro) === API_ERROR.WRONG_PASSWORD) {
        setErros({ atual: 'Senha incorreta' });
        setAtual('');
      } else {
        setErros({ geral: mensagemDoErro(erro) });
      }
    } finally {
      setEnviando(false);
    }
  }

  /**
   * "Esqueci minha senha atual" NAO leva a /esqueci-senha: aquela rota e de
   * visitante e devolve quem esta logado ao Inicio. O link e pedido direto, e
   * o e-mail leva a pagina de redefinir, que funciona com a sessao aberta.
   */
  async function pedirLink() {
    if (!emailAtual) return;
    try {
      await authApi.forgotPassword({ email: emailAtual });
    } catch {
      // A resposta e sempre a mesma; falha aqui e de rede.
    }
    setLinkEnviado(true);
  }

  if (pronto) {
    return (
      <section className={estilos.secao}>
        <SectionHeader title="Senha" />
        <SurfaceCard>
          <div className={estilos.linhaIcone} role="status">
            <IconTile
              icone="check-circle"
              fundo="var(--cor-pill-tablet)"
              traco="var(--cor-dose-taken)"
            />
            <div className={estilos.linhaTextos}>
              <p className={estilos.titulo}>Senha alterada</p>
              <p className={estilos.ajuda}>
                Você continua conectado neste navegador. Os outros aparelhos foram desconectados.
              </p>
            </div>
          </div>
          <div className={`${estilos.centro} ${estilos.acaoDeTexto}`}>
            <Link to="/ajustes" className={botoes.texto}>
              Voltar aos ajustes
            </Link>
          </div>
        </SurfaceCard>
      </section>
    );
  }

  return (
    <section className={estilos.secao}>
      <SectionHeader title="Senha" />
      <SurfaceCard>
        <form onSubmit={(e) => void enviar(e)} noValidate>
          <FormField
            label="Senha atual"
            value={atual}
            onChangeText={setAtual}
            secure
            autoComplete="current-password"
            error={erros.atual}
            readOnly={enviando}
          />
          <FormField
            label="Nova senha"
            value={nova}
            onChangeText={setNova}
            secure
            autoComplete="new-password"
            hint="Ao menos 8 caracteres"
            error={erros.nova}
            readOnly={enviando}
          />
          <FormField
            label="Repita a nova senha"
            value={repete}
            onChangeText={setRepete}
            secure
            autoComplete="new-password"
            error={erros.repete}
            readOnly={enviando}
          />

          {erros.geral ? (
            <p className={estilos.erroGeral} role="alert">
              {erros.geral}
            </p>
          ) : null}

          <PrimaryButton title="Alterar senha" type="submit" loading={enviando} />
        </form>

        <div className={`${estilos.centro} ${estilos.acaoDeTexto}`}>
          <button
            type="button"
            className={botoes.texto}
            onClick={() => void pedirLink()}
            disabled={linkEnviado}
          >
            {linkEnviado ? `Link enviado para ${emailAtual}` : 'Esqueci minha senha atual'}
          </button>
        </div>
      </SurfaceCard>
    </section>
  );
}
