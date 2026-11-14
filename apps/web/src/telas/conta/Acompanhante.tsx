import { useQueryClient } from '@tanstack/react-query';
import {
  acompanhantesApi,
  PERMISSOES,
  type Permissoes,
  type ResultadoDoConvite,
} from '@gestao/shared/api/acompanhantes';
import {
  avisosAutorizados,
  primeiroNome,
  rotuloDoAviso,
  textoDoConvite,
} from '@gestao/shared/lib/mensagensWhatsapp';
import { formatarTelefone, telefoneParaExibir } from '@gestao/shared/lib/telefone';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { ApiRequestError } from '@/api/cliente';
import { CHAVES, useAcompanhantes, usePerfis } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { useAuth } from '@/auth/AuthProvider';
import { SettingsGroup, SettingsRow } from '@/ui/Ajustes';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './conta.module.css';
import { ICONE_DO_AVISO, PreviaDeMensagem } from './Whatsapp';

const TODAS_LIGADAS: Permissoes = {
  notifyDose: true,
  notifyLate: true,
  notifyLowStock: true,
  notifyTaken: true,
};

/**
 * Cadastro e edicao de um acompanhante (/conta/acompanhante).
 *
 * Sem `?id`, cadastra e o servidor manda o convite. Com `?id`, edita — e NAO
 * reenvia o convite. `?profileId` so pre-escolhe a pessoa.
 */
export function Acompanhante() {
  const [parametros] = useSearchParams();
  const id = parametros.get('id');
  return <Formulario key={id ?? 'novo'} id={id} perfilInicial={parametros.get('profileId')} />;
}

function Formulario({ id, perfilInicial }: { id: string | null; perfilInicial: string | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { confirmar, avisar } = useDialogos();
  const novo = id === null;

  const perfis = usePerfis();
  // Nao ha busca por id: a lista da conta e curta e ja traz tudo.
  const acompanhantes = useAcompanhantes();
  const existente = novo ? null : (acompanhantes.data?.caregivers.find((c) => c.id === id) ?? null);

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [profileId, setProfileId] = useState<string | null>(perfilInicial);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [relacao, setRelacao] = useState('');
  const [permissoes, setPermissoes] = useState<Permissoes>(TODAS_LIGADAS);

  // Edicao: preenche UMA vez.
  const [preenchido, setPreenchido] = useState(false);
  useEffect(() => {
    if (!existente || preenchido) return;
    setPreenchido(true);
    setProfileId(existente.profileId);
    setNome(existente.fullName);
    setTelefone(telefoneParaExibir(existente.phone));
    setRelacao(existente.relationship ?? '');
    setPermissoes({
      notifyDose: existente.notifyDose,
      notifyLate: existente.notifyLate,
      notifyLowStock: existente.notifyLowStock,
      notifyTaken: existente.notifyTaken,
    });
  }, [existente, preenchido]);

  // Uma pessoa so: nao ha o que escolher. Com varias, a escolha fica em branco
  // de proposito — aviso de remedio da pessoa errada e o engano que esta tela
  // nao pode deixar passar calado.
  const pessoas = perfis.data ?? [];
  useEffect(() => {
    const lista = perfis.data;
    if (novo && !perfilInicial && lista?.length === 1) setProfileId(lista[0]!.id);
  }, [novo, perfilInicial, perfis.data]);

  const nomeDoPaciente = novo
    ? (pessoas.find((p) => p.id === profileId)?.fullName ?? '')
    : (existente?.patientName ?? '');

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (novo && !profileId) novos.profileId = 'Escolha para quem são os cuidados';
    if (nome.trim().length < 2) novos.fullName = 'Informe o nome';
    // Mesmo texto do servidor, para a pessoa nao ver duas frases para o mesmo erro.
    if (telefone.replace(/\D/g, '').length < 10) {
      novos.phone = 'Informe um celular com DDD, como (11) 99999-1234';
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  const sair = () => {
    void queryClient.invalidateQueries({ queryKey: CHAVES.acompanhantes });
    navigate(-1);
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    if (!validar()) return;

    const dados = {
      fullName: nome.trim(),
      phone: telefone,
      relationship: relacao.trim() || null,
      ...permissoes,
    };

    setSalvando(true);
    try {
      if (novo) {
        const r = await acompanhantesApi.criar({ profileId: profileId!, ...dados });
        await avisarDoConvite(r.convite, primeiroNome(r.caregiver.fullName));
      } else {
        await acompanhantesApi.atualizar(id, dados);
      }
      sair();
    } catch (erro) {
      if (erro instanceof ApiRequestError && erro.fields) setErros(erro.fields);
      setErroGeral(mensagemDoErro(erro));
      setSalvando(false);
    }
  }

  /**
   * O cadastro deu certo nos tres casos; o que muda e o convite. Por isso a
   * tela fecha em todos: ficar aberta convidaria a cadastrar a mesma pessoa
   * duas vezes.
   */
  function avisarDoConvite(convite: ResultadoDoConvite, quem: string): Promise<void> {
    if (convite === 'enviada') {
      return avisar('Convite enviado', `${quem} vai receber pelo WhatsApp os avisos autorizados.`);
    }
    if (convite === 'falha') {
      return avisar(
        'Cadastrado, mas o convite não foi enviado',
        'Confira se o número tem WhatsApp. Você pode corrigi-lo em Lembretes por WhatsApp.',
      );
    }
    return avisar('Cadastrado', 'O envio por WhatsApp ainda não está configurado.');
  }

  async function remover() {
    if (!id) return;
    const confirmou = await confirmar(
      `Remover ${primeiroNome(nome) || 'acompanhante'}?`,
      'Essa pessoa deixa de receber os avisos pelo WhatsApp.',
      'Remover',
    );
    if (!confirmou) return;
    try {
      await acompanhantesApi.remover(id);
      sair();
    } catch (erro) {
      void avisar('Não consegui remover', mensagemDoErro(erro));
    }
  }

  // A previa so aparece com a pessoa escolhida: sem ela a frase sairia com um
  // buraco no lugar do nome.
  const previa = nomeDoPaciente
    ? textoDoConvite({
        quemConvida: user?.fullName ?? 'Uma pessoa da família',
        paciente: nomeDoPaciente,
        avisos: avisosAutorizados(permissoes),
      })
    : null;

  const carregando = novo ? perfis.isPending : acompanhantes.isPending;
  const naoEncontrado = !novo && !carregando && !existente;

  return (
    <Pagina area="family" largura="formulario">
      <ScreenHeader
        title={novo ? 'Cadastrar acompanhante' : 'Editar acompanhante'}
        voltar="historico"
      />

      {carregando ? (
        <Carregando />
      ) : naoEncontrado ? (
        <div className={estilos.bloco}>
          <Aviso icone="alert-circle" erro>
            {acompanhantes.isError
              ? mensagemDoErro(acompanhantes.error)
              : 'Não encontrei este acompanhante. Ele pode ter sido removido.'}
          </Aviso>
        </div>
      ) : (
        <form onSubmit={(e) => void salvar(e)} noValidate>
          <SurfaceCard className={estilos.apresentacao}>
            <span className={estilos.circulo}>
              <Icone nome="mci:account-group" size={30} />
            </span>
            <div className={estilos.linhaTextos}>
              <p className={estilos.titulo}>Adicione alguém de confiança</p>
              <p className={estilos.ajuda}>
                Essa pessoa poderá receber os lembretes dos medicamentos pelo WhatsApp.
              </p>
            </div>
          </SurfaceCard>

          <div className={estilos.paraQuem}>
            <h2 className={estilos.paraQuemTitulo}>Para quem são os cuidados?</h2>
            {novo ? (
              <ProfileSelector
                profiles={pessoas}
                selectedId={profileId}
                onSelect={setProfileId}
                tituloDoPainel="Cuidados de"
                permitirTodos={false}
              />
            ) : (
              // Na edicao a pessoa e fixa: trocar seria outro cadastro, com
              // outro convite.
              <div className={estilos.pacienteFixo}>
                <Avatar nome={nomeDoPaciente || '?'} size={46} />
                {nomeDoPaciente}
              </div>
            )}
            {erros.profileId ? (
              <p className={estilos.paraQuemErro} role="alert">
                {erros.profileId}
              </p>
            ) : null}
          </div>

          <SurfaceCard className={estilos.bloco}>
            <FormField
              label="Nome completo"
              value={nome}
              onChangeText={setNome}
              placeholder="Digite o nome do acompanhante"
              autoComplete="off"
              autoCapitalize="words"
              error={erros.fullName}
              readOnly={salvando}
            />
            <FormField
              label="Número do WhatsApp"
              value={telefone}
              onChangeText={(v) => setTelefone(formatarTelefone(v))}
              type="tel"
              placeholder="(00) 00000-0000"
              maxLength={15}
              autoComplete="off"
              error={erros.phone}
              readOnly={salvando}
            />
            <FormField
              label="Relação com o paciente"
              value={relacao}
              onChangeText={setRelacao}
              placeholder="Ex.: mãe, pai ou cuidadora"
              error={erros.relationship}
              readOnly={salvando}
            />
          </SurfaceCard>

          <SettingsGroup className={estilos.bloco}>
            <h2 className={`${estilos.tituloDoCartao} ${estilos.tituloComRecuo}`}>
              Permissões de recebimento
            </h2>
            {PERMISSOES.map((k) => (
              <SettingsRow
                key={k}
                marcador={<IconTile icone={ICONE_DO_AVISO[k]} {...LADRILHO_NEUTRO} />}
                rotulo={rotuloDoAviso(k)}
                ligado={permissoes[k]}
                onChange={(v) => setPermissoes((p) => ({ ...p, [k]: v }))}
                desabilitado={salvando}
              />
            ))}
          </SettingsGroup>

          <SurfaceCard className={estilos.bloco}>
            {/* Na edicao a previa sai: nada sera enviado ao salvar, e mostrar o
                convite sugeriria o contrario. */}
            {novo && previa ? (
              <>
                <h2 className={estilos.tituloDoCartao}>Prévia do convite</h2>
                <PreviaDeMensagem texto={previa} />
              </>
            ) : null}

            {erroGeral ? (
              <p className={estilos.erroGeral} style={{ marginTop: 16 }} role="alert">
                {erroGeral}
              </p>
            ) : null}

            <PrimaryButton
              title={novo ? 'Enviar convite pelo WhatsApp' : 'Salvar alterações'}
              type="submit"
              loading={salvando}
              className={novo && previa ? estilos.botao : undefined}
            />

            <div className={estilos.acoes}>
              <button
                type="button"
                className={botoes.texto}
                disabled={salvando}
                onClick={() => navigate(-1)}
              >
                Cancelar
              </button>
              {!novo ? (
                <button
                  type="button"
                  className={botoes.perigo}
                  disabled={salvando}
                  onClick={() => void remover()}
                >
                  Remover acompanhante
                </button>
              ) : null}
            </div>

            <p className={estilos.rodape}>
              O acompanhante poderá receber somente os avisos autorizados.
            </p>
          </SurfaceCard>
        </form>
      )}
    </Pagina>
  );
}
