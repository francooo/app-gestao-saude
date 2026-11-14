import { forgotPasswordRequestSchema, messageForError } from '@gestao/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { ApiRequestError, authApi } from '@/api/cliente';
import { TelaDeEntrada } from '@/layout/TelaDeEntrada';
import { PillInput } from '@/ui/PillInput';
import { PrimaryButton } from '@/ui/PrimaryButton';

import estilos from './entrada.module.css';

export function EsqueciSenha() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [erroDoCampo, setErroDoCampo] = useState<string | undefined>();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErroGeral(null);

    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setErroDoCampo(parsed.error.issues[0]?.message ?? 'E-mail inválido');
      return;
    }

    setErroDoCampo(undefined);
    setEnviando(true);
    try {
      await authApi.forgotPassword(parsed.data);
      // A API responde 200 mesmo se a conta nao existir — nao revelamos quais
      // e-mails estao cadastrados. A tela de sucesso e sempre a mesma.
      setEnviado(true);
    } catch (erro) {
      setErroGeral(messageForError(erro instanceof ApiRequestError ? erro.code : undefined));
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <TelaDeEntrada>
        <h1 className={estilos.titulo}>Confira seu e-mail</h1>
        <p className={estilos.apoio} role="status">
          Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. O link
          vale por 30 minutos.
        </p>
        <PrimaryButton
          title="Voltar ao login"
          onClick={() => navigate('/login', { replace: true })}
        />
      </TelaDeEntrada>
    );
  }

  return (
    <TelaDeEntrada>
      <form onSubmit={enviar} noValidate>
        <h1 className={estilos.titulo}>Esqueci minha senha</h1>
        <p className={estilos.apoio}>Informe seu e-mail para receber o link de redefinição.</p>

        <PillInput
          label="E-mail"
          icon="mail"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Digite seu e-mail"
          error={erroDoCampo}
          autoCapitalize="none"
          autoComplete="username"
          inputMode="email"
          readOnly={enviando}
          className={estilos.semMargem}
          autoFocus
        />

        {erroGeral ? (
          <p className={estilos.erroGeral} role="alert">
            {erroGeral}
          </p>
        ) : null}

        <PrimaryButton
          type="submit"
          title="Enviar link de redefinição"
          loading={enviando}
          className={estilos.botao}
        />

        <p className={estilos.rodape}>
          <Link to="/login" replace className={estilos.link}>
            Voltar para o login
          </Link>
        </p>
      </form>
    </TelaDeEntrada>
  );
}
