import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ERROR } from '@gestao/shared';
import { contaApi, type Contagens } from '@gestao/shared/api/conta';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ApiRequestError } from '@/api/cliente';
import { CHAVES } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { useAuth } from '@/auth/AuthProvider';
import { SettingsGroup, SettingsRow } from '@/ui/Ajustes';
import botoes from '@/ui/botoes.module.css';
import { ConsentCheckbox } from '@/ui/ConsentCheckbox';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { IconTile } from '@/ui/IconTile';
import { Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './conta.module.css';

const TERRACOTA = { fundo: 'var(--cor-terracotta)', traco: 'var(--cor-surface)' } as const;

/**
 * A politica completa mora numa PAGINA PUBLICA do projeto da API; aqui fica o
 * resumo em linguagem direta. O link passa pelo servidor do site, que sabe o
 * endereco da API e redireciona (ver server/rotas.ts).
 */
const URL_POLITICA = '/api/privacidade';

const RESUMO = [
  'Seus dados de saúde ficam num banco em São Paulo e são usados só para o aplicativo funcionar.',
  'Não vendemos nem compartilhamos seus dados, e não há publicidade.',
  'As perguntas ao assistente, e os dados necessários para respondê-las, vão para a Groq, fora do Brasil.',
  'O assistente também pesquisa na internet quando precisa, e cita a fonte.',
  'Se você pedir para ler a foto de uma receita ou de uma caixa, a imagem também vai para a Groq, fora do Brasil, só para preencher o cadastro.',
  'Se usar "Descreva como tomar" no cadastro de um remédio, a frase escrita vai para a Groq só para preencher os horários.',
  'A foto da caixinha fica guardada no cadastro do remédio, e dá para removê-la. A da receita, só se você anexar.',
  'Se você cadastrar um acompanhante, ele recebe por WhatsApp o primeiro nome da pessoa, o remédio e o horário — só os avisos que você marcou —, por meio de um provedor terceiro de envio.',
  'Apagar a conta remove tudo: pessoas, remédios, doses, receitas e conversas.',
];

/** Privacidade e seguranca: consentimento, resumo da politica e apagar a conta. */
export function Privacidade() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { confirmar, avisar } = useDialogos();

  const conta = useQuery({
    queryKey: CHAVES.contaComContagens,
    queryFn: () => contaApi.perfil(true),
  });
  const consentimento = conta.data?.consent ?? null;
  const contagens = conta.data?.counts ?? null;

  const [aceitando, setAceitando] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);

  async function reaceitar() {
    setAceitando(true);
    try {
      await contaApi.aceitarPolitica();
      // Raiz 'conta': esta tela e o aviso de politica desatualizada.
      await queryClient.invalidateQueries({ queryKey: CHAVES.conta });
    } catch (e) {
      void avisar('Não consegui registrar', mensagemDoErro(e));
    } finally {
      setAceitando(false);
    }
  }

  /** Primeira das duas confirmacoes: interrompe e e barata de cancelar. */
  async function pedirExclusao() {
    if (await confirmar('Apagar a conta?', enunciado(contagens), 'Continuar')) {
      setPainelAberto(true);
    }
  }

  async function aoApagar() {
    setPainelAberto(false);
    await avisar(
      'Conta apagada',
      'Seus dados foram removidos. Obrigado por ter usado o aplicativo.',
    );
    await signOut();
  }

  return (
    <Pagina area="settings">
      <ScreenHeader title="Privacidade e segurança" voltar="/ajustes" />

      {/* A secao inteira some quando a carga falha: melhor nao ter a secao que
          ter uma secao mentindo sobre uma obrigacao legal. */}
      {conta.data ? (
        <section className={estilos.secao}>
          <SectionHeader title="Seu consentimento" />
          <SettingsGroup>
            <SettingsRow
              marcador={<IconTile icone="check-circle" {...TERRACOTA} />}
              rotulo="Consentimento registrado"
              valor={
                consentimento
                  ? `Versão ${consentimento.policyVersion} · aceito em ${data(consentimento.grantedAt)}`
                  : 'Não encontramos o registro do seu aceite.'
              }
            />
          </SettingsGroup>

          {!consentimento || !consentimento.atual ? (
            <div className={estilos.reaceite}>
              <p>
                {consentimento
                  ? 'A política mudou desde o seu aceite.'
                  : 'Não há registro do seu aceite nesta conta.'}
              </p>
              <button
                type="button"
                className={`${botoes.ambar} ${botoes.largo}`}
                onClick={() => void reaceitar()}
                disabled={aceitando}
              >
                {aceitando ? <span className={botoes.girando} /> : 'Ler e aceitar a versão atual'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={estilos.secao}>
        <SectionHeader title="Política de privacidade" />
        <SurfaceCard>
          <p className={estilos.titulo}>Em resumo</p>
          <ul className={estilos.resumo}>
            {RESUMO.map((linha) => (
              <li key={linha}>
                <Icone nome="check" size={16} color="var(--cor-accent-green)" />
                {linha}
              </li>
            ))}
          </ul>

          <div className={estilos.centro}>
            <a href={URL_POLITICA} target="_blank" rel="noreferrer" className={botoes.texto}>
              Ler a política completa
              <Icone nome="external-link" size={16} />
            </a>
          </div>
        </SurfaceCard>
      </section>

      <SurfaceCard className={estilos.destrutivo}>
        <IconTile icone="trash-2" size={54} {...TERRACOTA} />
        <p className={estilos.titulo}>Apagar a conta</p>
        <p className={estilos.ajuda}>{enunciado(contagens)}</p>
        <button
          type="button"
          className={`${botoes.perigo} ${estilos.acaoDeTexto}`}
          onClick={() => void pedirExclusao()}
        >
          Apagar a conta e todos os dados
        </button>
      </SurfaceCard>

      {painelAberto ? (
        <PainelDeExclusao
          contagens={contagens}
          onFechar={() => setPainelAberto(false)}
          onApagado={() => void aoApagar()}
        />
      ) : null}
    </Pagina>
  );
}

/** Segunda confirmacao: a senha e o aceite explicito de que nao ha volta. */
function PainelDeExclusao({
  contagens,
  onFechar,
  onApagado,
}: {
  contagens: Contagens | null;
  onFechar: () => void;
  onApagado: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const pessoas = contagens?.profiles;
  const quantas = pessoas ? (pessoas === 1 ? '1 pessoa' : `${pessoas} pessoas`) : null;

  async function apagar(e: FormEvent) {
    e.preventDefault();
    if (!senha || !aceite) return;
    setEnviando(true);
    setErro(undefined);
    try {
      await contaApi.apagarConta(senha);
      onApagado();
    } catch (falha) {
      const codigo = falha instanceof ApiRequestError ? falha.code : undefined;
      // O painel NAO fecha na falha: reabrir e redigitar tudo faria a pessoa
      // desistir no meio, e um meio-caminho aqui e pior que os dois extremos.
      setErro(codigo === API_ERROR.WRONG_PASSWORD ? 'Senha incorreta' : mensagemDoErro(falha));
      setSenha('');
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className={estilos.painel}
      aria-labelledby="exclusao-titulo"
      onCancel={(e) => {
        e.preventDefault();
        if (!enviando) onFechar();
      }}
    >
      <form className={estilos.painelCaixa} onSubmit={(e) => void apagar(e)} noValidate>
        <h2 id="exclusao-titulo" className={estilos.painelTitulo}>
          Apagar a conta
        </h2>
        <p className={estilos.painelTexto}>
          Para confirmar, digite sua senha.{' '}
          {quantas
            ? `Os dados de saúde de ${quantas} serão apagados dos nossos servidores e não podem ser recuperados.`
            : 'Os dados de saúde da sua família serão apagados dos nossos servidores e não podem ser recuperados.'}
        </p>

        <FormField
          label="Sua senha"
          value={senha}
          onChangeText={setSenha}
          secure
          autoComplete="current-password"
          autoFocus
          error={erro}
          readOnly={enviando}
        />

        <ConsentCheckbox checked={aceite} onChange={setAceite} disabled={enviando}>
          Entendi que{' '}
          {quantas
            ? `os dados de ${quantas} serão apagados`
            : 'todos os dados da minha família serão apagados'}{' '}
          e que isso não pode ser desfeito.
        </ConsentCheckbox>

        <button
          type="submit"
          className={estilos.botaoApagar}
          disabled={!senha || !aceite || enviando}
        >
          {enviando ? <span className={botoes.girando} /> : 'Apagar a conta'}
        </button>

        <div className={`${estilos.centro} ${estilos.acaoDeTexto}`}>
          <button type="button" className={botoes.texto} onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * O que a exclusao leva, com numeros reais. Sem os numeros, degrada para a
 * frase sem quantidades. NUNCA mostra "0": um zero mentiroso convida a apagar.
 */
function enunciado(c: Contagens | null): string {
  if (!c) {
    return 'Isto apaga, para sempre: todas as pessoas, remédios, doses registradas, receitas, consultas e as conversas com o assistente. Não dá para desfazer, e não temos cópia.';
  }

  const partes = [
    plural(c.profiles, 'pessoa', 'pessoas'),
    plural(c.medications, 'remédio', 'remédios'),
    plural(c.doses, 'dose registrada', 'doses registradas'),
    plural(c.prescriptions, 'receita', 'receitas'),
    plural(c.appointments, 'consulta', 'consultas'),
  ].filter(Boolean);

  return `Isto apaga, para sempre: ${partes.join(', ')} e todas as conversas com o assistente. Não dá para desfazer, e não temos cópia.`;
}

function plural(n: number, um: string, varios: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? um : varios}`;
}

function data(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
