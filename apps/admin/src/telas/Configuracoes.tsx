import {
  CircleCheck,
  History,
  LogOut,
  MessageCircle,
  Monitor,
  Pencil,
  Send,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';

import { ErroDaApi } from '../api/cliente';
import {
  useAuditoria,
  useConta,
  useEditarPerfil,
  useEncerrarOutrasSessoes,
  useSessoes,
  useTrocarSenha,
  useWhatsapp,
  type Auditoria,
  type SessaoAtiva,
} from '../api/telas';
import { useAuth } from '../auth/AuthProvider';
import { CabecalhoDaPagina } from '../layout/CabecalhoDaPagina';
import { data, haQuanto, iniciais, numero, ultimoAcesso } from '../lib/formato';
import { useFiltros } from '../lib/useFiltros';
import {
  Aviso,
  Cartao,
  Carregando,
  Erro,
  ListaDeBarras,
  Paginacao,
  Pill,
  Selecao,
  Tabela,
  Vazio,
  type Coluna,
} from '../ui/componentes';
import estilos from './Configuracoes.module.css';
import telas from './telas.module.css';

const ABAS: { id: string; rotulo: string; Icone: LucideIcon }[] = [
  { id: 'perfil', rotulo: 'Perfil administrativo', Icone: UserRound },
  { id: 'seguranca', rotulo: 'Segurança', Icone: ShieldCheck },
  { id: 'acessos', rotulo: 'Registro de acesso', Icone: History },
  { id: 'whatsapp', rotulo: 'WhatsApp', Icone: MessageCircle },
];

export function Configuracoes() {
  const [parametros, setParametros] = useSearchParams();
  const aba = ABAS.find((a) => a.id === parametros.get('aba'))?.id ?? 'perfil';

  return (
    <>
      <CabecalhoDaPagina titulo="Configurações" subtitulo="Gerencie seu perfil e a segurança do painel" />

      <div className={estilos.grade}>
        <nav className={estilos.abas} aria-label="Seções das configurações">
          {ABAS.map(({ id, rotulo, Icone }) => (
            <button
              key={id}
              type="button"
              aria-current={aba === id ? 'page' : undefined}
              onClick={() => setParametros(id === 'perfil' ? {} : { aba: id })}
            >
              <Icone size={20} aria-hidden />
              {rotulo}
            </button>
          ))}
        </nav>

        <div className={estilos.conteudo}>
          {aba === 'perfil' && <Perfil />}
          {aba === 'seguranca' && <Seguranca />}
          {aba === 'acessos' && <RegistroDeAcesso />}
          {aba === 'whatsapp' && <Whatsapp />}
        </div>
      </div>
    </>
  );
}

// --- perfil -----------------------------------------------------------------

function Perfil() {
  const consulta = useConta();
  const editar = useEditarPerfil();
  const { atualizarAdmin } = useAuth();
  const [nome, setNome] = useState<string | null>(null);

  if (consulta.isPending) return <Cartao titulo="Perfil administrativo"><Carregando /></Cartao>;
  if (consulta.isError) return <Cartao titulo="Perfil administrativo"><Erro onTentar={() => void consulta.refetch()} /></Cartao>;
  const { admin, ultimo_login, criado } = consulta.data;
  const editando = nome !== null;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!nome || nome.trim().length < 2) return;
    const resposta = await editar.mutateAsync(nome.trim());
    atualizarAdmin(resposta.admin);
    setNome(null);
  }

  return (
    <Cartao
      titulo="Perfil administrativo"
      acoes={
        !editando && (
          <button type="button" className={telas.botaoPrimario} onClick={() => setNome(admin.nome)}>
            <Pencil size={18} aria-hidden />
            Editar perfil
          </button>
        )
      }
    >
      <div className={estilos.perfil}>
        <span className={estilos.avatarGrande} aria-hidden>
          {iniciais(admin.nome)}
        </span>
        <dl className={estilos.dados}>
          <div>
            <dt>Nome</dt>
            <dd>
              {editando ? (
                <form className={estilos.formLinha} onSubmit={salvar}>
                  <label className="so-leitor-de-tela" htmlFor="nome-admin">
                    Nome
                  </label>
                  <input
                    id="nome-admin"
                    className={estilos.campo}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    maxLength={120}
                    autoFocus
                  />
                  <button type="submit" className={telas.botaoPrimario} disabled={editar.isPending || nome.trim().length < 2}>
                    Salvar
                  </button>
                  <button type="button" className={estilos.botaoTexto} onClick={() => setNome(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                admin.nome
              )}
              {editar.isError && (
                <p className={estilos.erro} role="alert">
                  Não foi possível salvar. Use um nome com 2 a 120 caracteres.
                </p>
              )}
            </dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{admin.email}</dd>
          </div>
          <div>
            <dt>Função</dt>
            <dd>Administrador do painel</dd>
          </div>
          <div>
            <dt>Último login</dt>
            <dd>{ultimoAcesso(ultimo_login)}</dd>
          </div>
          <div>
            <dt>Administrador desde</dt>
            <dd>{data(criado)}</dd>
          </div>
        </dl>
      </div>
      <Aviso>O e-mail de acesso só pode ser trocado por quem administra o banco, pelo script de criação de admin.</Aviso>
    </Cartao>
  );
}

// --- seguranca --------------------------------------------------------------

const MINIMO_DA_SENHA = 12;

function mensagemDaSenha(erro: unknown): string {
  if (erro instanceof ErroDaApi) {
    if (erro.codigo === 'CREDENCIAIS_INVALIDAS') return 'A senha atual está incorreta.';
    if (erro.codigo === 'MUITAS_TENTATIVAS') return 'Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.';
    if (erro.codigo === 'DADOS_INVALIDOS') return 'A nova senha precisa ser diferente da atual.';
  }
  return 'Não foi possível trocar a senha. Tente de novo.';
}

function Seguranca() {
  return (
    <>
      <TrocarSenha />
      <Sessoes />
    </>
  );
}

function TrocarSenha() {
  const trocar = useTrocarSenha();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [encerradas, setEncerradas] = useState<number | null>(null);

  const curta = nova.length > 0 && nova.length < MINIMO_DA_SENHA;
  const diferente = confirmacao.length > 0 && confirmacao !== nova;
  const pronta = atual.length > 0 && nova.length >= MINIMO_DA_SENHA && confirmacao === nova;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!pronta) return;
    setEncerradas(null);
    const resposta = await trocar.mutateAsync({ senhaAtual: atual, novaSenha: nova }).catch(() => null);
    if (!resposta) return;
    setEncerradas(resposta.encerradas);
    setAtual('');
    setNova('');
    setConfirmacao('');
  }

  return (
    <Cartao titulo="Trocar senha" subtitulo="Ao trocar, as sessões abertas em outros navegadores são encerradas">
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <label className={estilos.rotulo}>
          Senha atual
          <input
            type="password"
            className={estilos.campo}
            autoComplete="current-password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
          />
        </label>
        <label className={estilos.rotulo}>
          Nova senha
          <input
            type="password"
            className={estilos.campo}
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            aria-invalid={curta || undefined}
            aria-describedby="dica-senha"
          />
          <span id="dica-senha" className={curta ? estilos.erro : estilos.dica}>
            Pelo menos {MINIMO_DA_SENHA} caracteres.
          </span>
        </label>
        <label className={estilos.rotulo}>
          Repita a nova senha
          <input
            type="password"
            className={estilos.campo}
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            aria-invalid={diferente || undefined}
          />
          {diferente && <span className={estilos.erro}>As senhas não são iguais.</span>}
        </label>

        {trocar.isError && (
          <p className={estilos.erro} role="alert">
            {mensagemDaSenha(trocar.error)}
          </p>
        )}
        {encerradas !== null && (
          <p className={estilos.sucesso} role="status">
            <CircleCheck size={18} aria-hidden />
            Senha trocada.{' '}
            {encerradas === 0
              ? 'Não havia outras sessões abertas.'
              : `${numero(encerradas)} ${encerradas === 1 ? 'outra sessão foi encerrada' : 'outras sessões foram encerradas'}.`}
          </p>
        )}

        <div>
          <button type="submit" className={telas.botaoPrimario} disabled={!pronta || trocar.isPending}>
            <ShieldCheck size={18} aria-hidden />
            {trocar.isPending ? 'Trocando…' : 'Trocar senha'}
          </button>
        </div>
      </form>
    </Cartao>
  );
}

/** "Mozilla/5.0 (Windows NT 10.0…) … Chrome/…" -> "Chrome no Windows". */
function descreverNavegador(ua: string | null): string {
  if (!ua) return 'Navegador desconhecido';
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  const sistema = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return sistema ? `${navegador} no ${sistema}` : navegador;
}

function Sessoes() {
  const consulta = useSessoes();
  const encerrar = useEncerrarOutrasSessoes();
  const outras = consulta.data?.sessoes.filter((s) => !s.atual).length ?? 0;

  return (
    <Cartao
      titulo="Sessões abertas"
      subtitulo="Navegadores onde sua conta está conectada"
      acoes={
        outras > 0 && (
          <button
            type="button"
            className={telas.botaoContorno}
            onClick={() => encerrar.mutate()}
            disabled={encerrar.isPending}
          >
            <LogOut size={18} aria-hidden />
            Encerrar as outras
          </button>
        )
      }
    >
      {consulta.isPending ? (
        <Carregando linhas={3} />
      ) : consulta.isError ? (
        <Erro onTentar={() => void consulta.refetch()} />
      ) : (
        <ul className={estilos.sessoes}>
          {consulta.data.sessoes.map((s: SessaoAtiva) => (
            <li key={s.id}>
              <span className={telas.atividadeIcone} aria-hidden>
                <Monitor size={16} />
              </span>
              <span className={estilos.sessaoTexto}>
                <strong>{descreverNavegador(s.navegador)}</strong>
                <span>
                  {s.ip ? `IP ${s.ip} · ` : ''}entrou {haQuanto(s.criada)} · expira em {data(s.expira)}
                </span>
              </span>
              {s.atual && <Pill tom="sucesso">Esta sessão</Pill>}
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

// --- registro de acesso -----------------------------------------------------

const ACOES: Record<string, string> = {
  login: 'Entrou no painel',
  login_falhou: 'Tentativa de login falhou',
  logout: 'Saiu do painel',
  ver_visao_geral: 'Viu a visão geral',
  listar_usuarios: 'Listou usuários',
  listar_assinaturas: 'Listou assinaturas',
  listar_medicamentos: 'Listou medicamentos',
  listar_medicos: 'Listou médicos',
  ver_relatorios: 'Viu relatórios',
  editar_perfil: 'Editou o perfil',
  trocar_senha: 'Trocou a senha',
  troca_senha_falhou: 'Troca de senha falhou',
  encerrar_sessoes: 'Encerrou outras sessões',
};

const FALHAS = new Set(['login_falhou', 'troca_senha_falhou']);

const PERIODOS: Record<string, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '13 semanas',
  '12m': '12 meses',
};

/** Detalhes gravados (filtros, pagina...) em texto curto. */
function resumirDetalhes(detalhes: Record<string, unknown> | null): string {
  if (!detalhes) return '—';
  const partes: string[] = [];
  for (const [chave, valor] of Object.entries(detalhes)) {
    if (valor === null || valor === undefined || valor === '' || valor === false) continue;
    if (chave === 'lembrar') partes.push('com “lembrar de mim”');
    else if (chave === 'periodo') partes.push(`período: ${PERIODOS[String(valor)] ?? String(valor)}`);
    else if (chave === 'encerradas') partes.push(`${String(valor)} ${valor === 1 ? 'sessão encerrada' : 'sessões encerradas'}`);
    else if (chave === 'pagina') {
      if (valor !== 1) partes.push(`página ${String(valor)}`);
    } else if (chave === 'busca') partes.push(`busca “${String(valor)}”`);
    else if (chave === 'de') partes.push(`de “${String(valor)}”`);
    else if (chave === 'para') partes.push(`para “${String(valor)}”`);
    else partes.push(`${chave}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`);
  }
  return partes.length ? partes.join(' · ') : '—';
}

type LinhaDoRegistro = Auditoria['itens'][number];

const COLUNAS_DO_REGISTRO: Coluna<LinhaDoRegistro>[] = [
  {
    titulo: 'Quando',
    render: (l) => (
      <span>
        {ultimoAcesso(l.quando)}
        <br />
        <span className={telas.secundario}>{data(l.quando)}</span>
      </span>
    ),
  },
  { titulo: 'Administrador', render: (l) => l.admin },
  {
    titulo: 'Ação',
    render: (l) =>
      FALHAS.has(l.acao) ? <Pill tom="perigo">{ACOES[l.acao] ?? l.acao}</Pill> : (ACOES[l.acao] ?? l.acao),
  },
  { titulo: 'Detalhes', render: (l) => <span className={estilos.detalhes}>{resumirDetalhes(l.detalhes)}</span> },
  { titulo: 'IP', render: (l) => l.ip ?? '—' },
];

function RegistroDeAcesso() {
  const filtros = useFiltros(['acao'] as const);
  const consulta = useAuditoria(filtros.consulta);
  const dados = consulta.data;

  return (
    <Cartao
      titulo="Registro de acesso"
      subtitulo="Tudo o que os administradores fizeram no painel (LGPD). Não pode ser editado nem apagado."
    >
      <div className={estilos.filtroDoRegistro}>
        <Selecao
          rotulo="Ação"
          valor={filtros.valores.acao}
          opcoes={Object.entries(ACOES).map(([valor, rotulo]) => ({ valor, rotulo }))}
          onChange={(v) => filtros.definir('acao', v)}
        />
      </div>
      {consulta.isPending ? (
        <Carregando linhas={6} />
      ) : consulta.isError ? (
        <Erro onTentar={() => void consulta.refetch()} />
      ) : dados!.total === 0 ? (
        <Vazio titulo="Nenhum registro" texto="Nada foi registrado com esse filtro." />
      ) : (
        <>
          <Tabela
            legenda="Registro de acesso do painel"
            colunas={COLUNAS_DO_REGISTRO}
            itens={dados!.itens}
            atualizando={consulta.isPlaceholderData}
          />
          <Paginacao {...dados!} onChange={(p) => filtros.definir('pagina', p)} />
        </>
      )}
    </Cartao>
  );
}

// --- WhatsApp ---------------------------------------------------------------

const TIPOS_DE_MENSAGEM: Record<string, string> = {
  convite: 'Convites a acompanhantes',
  dose: 'Lembretes de dose',
  atraso: 'Avisos de atraso',
  tomado: 'Avisos de dose tomada',
  estoque: 'Avisos de estoque',
};

function motivoDaFalha(motivo: string | null): string {
  if (!motivo) return 'Motivo não informado';
  if (motivo === 'nao-configurado') return 'Provedor não configurado na API do app';
  if (motivo === 'tempo') return 'O provedor demorou demais para responder';
  if (motivo === 'rede') return 'Falha de rede até o provedor';
  const http = motivo.match(/^http-(\d+)$/);
  if (http) return `O provedor recusou (HTTP ${http[1]})`;
  return motivo;
}

function Whatsapp() {
  const consulta = useWhatsapp();

  if (consulta.isPending) return <Cartao titulo="Integração com WhatsApp"><Carregando /></Cartao>;
  if (consulta.isError) return <Cartao titulo="Integração com WhatsApp"><Erro onTentar={() => void consulta.refetch()} /></Cartao>;
  const { numeros: n, porTipo, falhas } = consulta.data;

  const situacao =
    n.tentativas_30d === 0
      ? { tom: 'neutro' as const, texto: 'Sem envios nos últimos 30 dias' }
      : n.ultima_situacao === 'falha'
        ? { tom: 'perigo' as const, texto: 'O último envio falhou' }
        : { tom: 'sucesso' as const, texto: 'Enviando normalmente' };

  return (
    <>
      <Cartao titulo="Integração com WhatsApp" subtitulo="Avisos que o app manda aos acompanhantes das famílias">
        <div className={estilos.whatsapp}>
          <span className={estilos.iconeWhatsapp} aria-hidden>
            <MessageCircle size={36} />
          </span>
          <div className={estilos.whatsappTextos}>
            <Pill tom={situacao.tom}>{situacao.texto}</Pill>
            <span className={telas.secundario}>
              {n.ultima_enviada ? `Última mensagem entregue ${haQuanto(n.ultima_enviada)}` : 'Nenhuma mensagem entregue até hoje'}
            </span>
          </div>
        </div>
        <div className={estilos.numerosPequenos}>
          <Numero Icone={Users} rotulo="Acompanhantes ativos" valor={n.acompanhantes} />
          <Numero Icone={Send} rotulo="Enviadas (30 dias)" valor={n.enviadas_30d} />
          <Numero Icone={TriangleAlert} rotulo="Falhas (30 dias)" valor={n.falhas_30d} />
        </div>
        <Aviso>
          As credenciais do provedor de WhatsApp ficam na API do app, fora do painel. Aqui aparece só o histórico de
          envios, sem o texto das mensagens.
        </Aviso>
      </Cartao>

      <div className={`${telas.linha} ${telas.metades}`}>
        <Cartao titulo="Mensagens por tipo" subtitulo="Entregues nos últimos 30 dias">
          {porTipo.length === 0 ? (
            <Vazio titulo="Nenhuma mensagem" texto="Nenhum aviso foi entregue nos últimos 30 dias." />
          ) : (
            <ListaDeBarras
              tom="musgo"
              itens={porTipo.map((t) => ({
                rotulo: TIPOS_DE_MENSAGEM[t.tipo] ?? t.tipo,
                valor: t.enviadas,
                detalhe: numero(t.enviadas),
              }))}
            />
          )}
        </Cartao>
        <Cartao titulo="Falhas recentes">
          {falhas.length === 0 ? (
            <Vazio titulo="Nenhuma falha" texto="Nenhum envio falhou até agora." />
          ) : (
            <ul className={estilos.sessoes}>
              {falhas.map((f) => (
                <li key={f.id}>
                  <span className={estilos.iconeFalha} aria-hidden>
                    <TriangleAlert size={16} />
                  </span>
                  <span className={estilos.sessaoTexto}>
                    <strong>{motivoDaFalha(f.motivo)}</strong>
                    <span>
                      {TIPOS_DE_MENSAGEM[f.tipo] ?? f.tipo} · {haQuanto(f.quando)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}

function Numero({ Icone, rotulo, valor }: { Icone: LucideIcon; rotulo: string; valor: number }) {
  return (
    <div className={estilos.numeroPequeno}>
      <Icone size={18} aria-hidden />
      <span>{rotulo}</span>
      <strong>{numero(valor)}</strong>
    </div>
  );
}
