import { messageForError, registerRequestSchema } from '@gestao/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { ApiRequestError } from '@/api/cliente';
import { useAuth } from '@/auth/AuthProvider';
import { TelaDeEntrada } from '@/layout/TelaDeEntrada';
import { ConsentCheckbox } from '@/ui/ConsentCheckbox';
import { PillInput } from '@/ui/PillInput';
import { PrimaryButton } from '@/ui/PrimaryButton';

import estilos from './entrada.module.css';

type Campo = 'fullName' | 'email' | 'password' | 'passwordConfirmation' | 'acceptedPolicy';
type ErrosPorCampo = Partial<Record<Campo, string>>;

export function Cadastro() {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  const [erros, setErros] = useState<ErrosPorCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErroGeral(null);

    const parsed = registerRequestSchema.safeParse({
      fullName,
      email,
      password,
      passwordConfirmation,
      acceptedPolicy,
    });

    if (!parsed.success) {
      const proximos: ErrosPorCampo = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as Campo | undefined;
        if (campo && !proximos[campo]) proximos[campo] = issue.message;
      }
      setErros(proximos);
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await signUp(parsed.data);
      // O cadastro ja devolve a sessao: a guarda das rotas publicas redireciona.
    } catch (erro) {
      // E-mail duplicado aponta para o campo; o resto vira mensagem geral.
      if (erro instanceof ApiRequestError && erro.code === 'EMAIL_ALREADY_REGISTERED') {
        setErros({ email: 'Já existe uma conta com este e-mail' });
      } else {
        setErroGeral(messageForError(erro instanceof ApiRequestError ? erro.code : undefined));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaDeEntrada>
      <form onSubmit={enviar} noValidate>
        <h1 className={estilos.titulo}>Criar sua conta</h1>
        <p className={estilos.apoio}>Preencha os dados para começar.</p>

        <PillInput
          label="Nome completo"
          icon="user"
          name="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Como você se chama"
          error={erros.fullName}
          autoCapitalize="words"
          autoComplete="name"
          readOnly={enviando}
          autoFocus
        />

        <PillInput
          label="E-mail"
          icon="mail"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Digite seu e-mail"
          error={erros.email}
          autoCapitalize="none"
          autoComplete="username"
          inputMode="email"
          readOnly={enviando}
        />

        <PillInput
          label="Senha"
          icon="lock"
          secure
          name="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Crie uma senha"
          error={erros.password}
          autoCapitalize="none"
          autoComplete="new-password"
          readOnly={enviando}
        />

        <PillInput
          label="Confirmar senha"
          icon="lock"
          secure
          name="new-password-confirmation"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          placeholder="Repita sua senha"
          error={erros.passwordConfirmation}
          autoCapitalize="none"
          autoComplete="new-password"
          readOnly={enviando}
          className={estilos.ultimoCampo}
        />

        <ConsentCheckbox
          checked={acceptedPolicy}
          onChange={setAcceptedPolicy}
          error={erros.acceptedPolicy}
          disabled={enviando}
        >
          Li e aceito a política de privacidade, e autorizo o tratamento dos meus dados de saúde
          para acompanhamento no aplicativo.
        </ConsentCheckbox>

        {erroGeral ? (
          <p className={estilos.erroGeral} role="alert">
            {erroGeral}
          </p>
        ) : null}

        <PrimaryButton
          type="submit"
          title="Criar conta"
          loading={enviando}
          className={estilos.botao}
        />

        <p className={estilos.rodape}>
          <Link to="/login" replace className={estilos.link}>
            Já tenho uma conta
          </Link>
        </p>
      </form>
    </TelaDeEntrada>
  );
}
