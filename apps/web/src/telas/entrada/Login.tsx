import { loginRequestSchema, messageForError } from '@gestao/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { ApiRequestError } from '@/api/cliente';
import { useAuth } from '@/auth/AuthProvider';
import { TelaDeEntrada } from '@/layout/TelaDeEntrada';
import { PillInput } from '@/ui/PillInput';
import { PrimaryButton } from '@/ui/PrimaryButton';

import estilos from './entrada.module.css';

type ErrosPorCampo = { email?: string; password?: string };

export function Login() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Nasce desmarcado: num computador dividido, o padrao seguro e nao lembrar.
  const [lembrar, setLembrar] = useState(false);
  const [erros, setErros] = useState<ErrosPorCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErroGeral(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const proximos: ErrosPorCampo = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0];
        if (campo === 'email' && !proximos.email) proximos.email = issue.message;
        if (campo === 'password' && !proximos.password) proximos.password = issue.message;
      }
      setErros(proximos);
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await signIn(parsed.data, lembrar);
      // A navegacao acontece sozinha: a guarda das rotas publicas redireciona
      // assim que o usuario entra no contexto.
    } catch (erro) {
      setErroGeral(messageForError(erro instanceof ApiRequestError ? erro.code : undefined));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaDeEntrada>
      <form onSubmit={enviar} noValidate>
        <h1 className={estilos.titulo}>Entrar na sua conta</h1>
        <p className={estilos.apoio}>Cuide da saúde da sua família em um só lugar</p>

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
          autoFocus
        />

        <PillInput
          label="Senha"
          icon="lock"
          secure
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Digite sua senha"
          error={erros.password}
          autoCapitalize="none"
          autoComplete="current-password"
          readOnly={enviando}
        />

        <div className={estilos.lembrarLinha}>
          <label className={estilos.lembrar}>
            <input
              type="checkbox"
              checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)}
              disabled={enviando}
            />
            Lembrar de mim
          </label>
          <Link to="/esqueci-senha" className={estilos.link}>
            Esqueci minha senha
          </Link>
        </div>

        {erroGeral ? (
          <p className={estilos.erroGeral} role="alert">
            {erroGeral}
          </p>
        ) : null}

        <PrimaryButton type="submit" title="Entrar" loading={enviando} className={estilos.botao} />

        {/* Peso normal na frase, negrito so no "Criar conta": o destaque recai sobre a acao. */}
        <p className={estilos.rodape}>
          Ainda não tem uma conta?{' '}
          <Link to="/cadastro" className={estilos.link}>
            Criar conta
          </Link>
        </p>
      </form>
    </TelaDeEntrada>
  );
}
