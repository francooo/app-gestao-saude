import { Eye, EyeOff, Lock, LockKeyhole, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';

import { ErroDaApi } from '../api/cliente';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../layout/Layout';
import estilos from './Login.module.css';

const MENSAGENS: Record<string, string> = {
  CREDENCIAIS_INVALIDAS: 'E-mail ou senha incorretos.',
  MUITAS_TENTATIVAS: 'Muitas tentativas seguidas. Aguarde 15 minutos e tente de novo.',
  DADOS_INVALIDOS: 'Confira o e-mail e a senha.',
};

export function Login() {
  const { sessao, entrar } = useAuth();
  const local = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (sessao.estado === 'autenticado') {
    const destino = (local.state as { de?: string } | null)?.de ?? '/';
    return <Navigate to={destino} replace />;
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha, lembrar);
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi
          ? (MENSAGENS[falha.codigo] ?? 'Não foi possível entrar agora. Tente de novo.')
          : 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
      );
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      {/* A ilustracao original (mae e bebe) nao veio como arquivo; ate chegar,
          o painel usa a folhagem em aquarela do app. */}
      <section className={estilos.arte} aria-hidden>
        <img src="/folhas/ramo-a.png" alt="" className={estilos.folhaGrande} />
        <img src="/folhas/ramo-canto.png" alt="" className={estilos.folhaCanto} />
        <div className={estilos.arteTexto}>
          <p className={estilos.arteTitulo}>Cuidar de quem cuida da família.</p>
          <p>Acompanhe o uso do Família Saúde em um só lugar.</p>
        </div>
      </section>

      <section className={estilos.lado}>
        <form className={estilos.cartao} onSubmit={enviar} noValidate>
          <Logo />
          <div className={estilos.cabecalho}>
            <h1>Acesso administrativo</h1>
            <p>Entre para acompanhar a operação do Família Saúde.</p>
          </div>

          <label className={estilos.campo}>
            <span>E-mail</span>
            <span className={estilos.entrada}>
              <Mail size={18} aria-hidden />
              <input
                type="email"
                autoComplete="username"
                placeholder="Digite seu e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </span>
          </label>

          <label className={estilos.campo}>
            <span>Senha</span>
            <span className={estilos.entrada}>
              <Lock size={18} aria-hidden />
              <input
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
              <button
                type="button"
                className={estilos.olho}
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          <label className={estilos.lembrar}>
            <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
            Lembrar de mim neste computador
          </label>

          {erro && (
            <p className={estilos.erro} role="alert">
              {erro}
            </p>
          )}

          <button type="submit" className={estilos.entrar} disabled={enviando || !email || !senha}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          <p className={estilos.rodape}>
            <LockKeyhole size={14} aria-hidden />
            Acesso restrito a administradores. Todo acesso é registrado.
          </p>
        </form>
      </section>
    </div>
  );
}
