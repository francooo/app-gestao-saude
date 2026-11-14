import { useQueryClient } from '@tanstack/react-query';
import { pickAvatarColor } from '@gestao/shared';
import { healthApi, relationshipValues } from '@gestao/shared/api/health';
import {
  alturaParaCm,
  cmParaAltura,
  dataParaISO,
  formatarData,
  idadeDescrita,
  isoParaData,
  numeroDigitado,
  pesoTexto,
  somenteDigitos,
} from '@gestao/shared/lib/pessoa';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { ApiRequestError } from '@/api/cliente';
import { CHAVES, usePerfil } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { escolherFoto } from '@/lib/foto';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { FormField, SelectField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { Aviso, Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './conta.module.css';

const PARENTESCOS = relationshipValues.map((v) => ({
  valor: v as string,
  // Primeira letra maiuscula so na exibicao: o banco guarda o valor do enum.
  rotulo: v.charAt(0).toUpperCase() + v.slice(1),
}));

/** Cadastro e edicao de um membro da familia (/membro/novo e /membro/:id). */
export function Membro() {
  const { id } = useParams();
  // A chave refaz o formulario ao trocar de pessoa: sem ela, "Adicionar"
  // nasceria com a foto e os dados da ultima ficha aberta.
  return <Formulario key={id} id={id ?? 'novo'} />;
}

function Formulario({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmar, avisar } = useDialogos();
  const [parametros] = useSearchParams();
  /** Chegou por "Dados pessoais", nos Ajustes — e nao pela lista da familia. */
  const deAjustes = parametros.get('origem') === 'ajustes';
  const novo = id === 'novo';

  const existente = usePerfil(novo ? undefined : id);
  const contagens = existente.data?.counts ?? null;

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [titular, setTitular] = useState(false);
  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [peso, setPeso] = useState('');
  /**
   * Quando o peso guardado foi anotado. So leitura: dose pediatrica se calcula
   * por quilo, e um peso de tres meses atras num bebe ja nao vale.
   */
  const [pesoAnotadoEm, setPesoAnotadoEm] = useState<string | undefined>();
  const [altura, setAltura] = useState('');
  const [parentesco, setParentesco] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  // Edicao: preenche UMA vez; uma nova busca nao passa por cima da digitacao.
  const p = existente.data?.profile;
  const [preenchido, setPreenchido] = useState(false);
  useEffect(() => {
    if (!p || preenchido) return;
    setPreenchido(true);
    setNome(p.fullName);
    setNascimento(isoParaData(p.birthDate));
    setPeso(pesoTexto(p.weightKg));
    setPesoAnotadoEm(
      p.weightKg != null && p.weightMeasuredAt
        ? `Anotado em ${new Date(p.weightMeasuredAt).toLocaleDateString('pt-BR')}`
        : undefined,
    );
    setAltura(cmParaAltura(p.heightCm));
    setParentesco(p.relationship);
    setObservacoes(p.notes ?? '');
    setTitular(p.isAccountHolder);
    // Sem esta linha a foto comecaria nula e QUALQUER salvamento a apagaria.
    setFoto(p.photo ?? null);
  }, [p, preenchido]);

  /** Abre o seletor de arquivo. Chamado direto do clique. */
  async function aplicarFoto() {
    setProcessandoFoto(true);
    const r = await escolherFoto({ camera: false });
    setProcessandoFoto(false);
    if (r.ok) setFoto(r.dataUri);
    // Desistir nao e erro: nao mexe na foto atual e nao avisa nada.
    else if (r.motivo === 'falha') void avisar('Não consegui usar essa imagem', 'Tente outra foto.');
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};

    if (nome.trim().length < 2) novos.fullName = 'Informe o nome';
    if (somenteDigitos(nascimento).length > 0 && !dataParaISO(nascimento)) {
      novos.birthDate = 'Data inválida';
    }
    if (peso.trim() !== '' && numeroDigitado(peso) == null) novos.weightKg = 'Peso inválido';
    if (altura.trim() !== '' && alturaParaCm(altura) == null) novos.heightCm = 'Altura inválida';

    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  const depoisDeMudar = () => {
    // Raiz 'perfis': a lista, a ficha e a faixa da tela Inicio.
    void queryClient.invalidateQueries({ queryKey: CHAVES.perfis });
    navigate(-1);
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    if (!validar()) return;

    const limpo = nome.trim();
    const dados = {
      fullName: limpo,
      birthDate: dataParaISO(nascimento),
      relationship: parentesco,
      notes: observacoes.trim() || null,
      photo: foto,
      weightKg: numeroDigitado(peso),
      heightCm: alturaParaCm(altura),
      // A cor vai RESOLVIDA: derivada do nome, ela mudaria quando alguem
      // corrigisse o nome — e o circulo colorido e como se reconhece quem e quem.
      ...(novo ? { avatarColor: pickAvatarColor(limpo) } : {}),
    };

    setSalvando(true);
    try {
      if (novo) await healthApi.createProfile(dados);
      else await healthApi.updateProfile(id, dados);
      depoisDeMudar();
    } catch (erro) {
      if (erro instanceof ApiRequestError && erro.fields) setErros(erro.fields);
      setErroGeral(mensagemDoErro(erro));
      setSalvando(false);
    }
  }

  async function remover() {
    const futuras = contagens?.upcomingAppointments ?? 0;
    const remedios = contagens?.medications ?? 0;

    const detalhe = [
      futuras === 1
        ? 'o lembrete da consulta futura para'
        : futuras > 1
          ? `os lembretes das ${futuras} consultas futuras param`
          : null,
      remedios === 1
        ? 'o remédio e o histórico de doses continuam guardados'
        : remedios > 1
          ? `os ${remedios} remédios e o histórico de doses continuam guardados`
          : 'o histórico de saúde continua guardado',
    ]
      .filter(Boolean)
      .join(', e ');

    const confirmou = await confirmar(
      `Remover ${nome.split(' ')[0]}?`,
      `A pessoa sai da tela inicial e das listas. Como ${detalhe} — se você cadastrar de novo, dá para restaurar.`,
      'Remover',
    );
    if (!confirmou) return;

    try {
      await healthApi.updateProfile(id, { isActive: false });
      // A ficha deixou de existir: sem isto a invalidacao a buscaria de novo.
      queryClient.removeQueries({ queryKey: CHAVES.perfil(id) });
      depoisDeMudar();
    } catch (erro) {
      void avisar('Não consegui remover', mensagemDoErro(erro));
    }
  }

  const idade = idadeDescrita(dataParaISO(nascimento));
  const titulo = deAjustes ? 'Dados pessoais' : novo ? 'Cadastro de membro' : 'Editar membro';
  const ocupado = salvando || processandoFoto;

  return (
    <Pagina area="family" largura="formulario">
      <ScreenHeader title={titulo} voltar="historico" mostrarSino />

      {!novo && existente.isPending ? (
        <Carregando />
      ) : !novo && existente.isError && !p ? (
        <div className={estilos.bloco}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void existente.refetch() }}
          >
            {mensagemDoErro(existente.error)}
          </Aviso>
        </div>
      ) : (
        <form onSubmit={(e) => void salvar(e)} noValidate>
          <SurfaceCard flush className={`${estilos.foto} ${estilos.bloco}`}>
            <button
              type="button"
              className={estilos.fotoBotao}
              disabled={ocupado}
              onClick={() => void aplicarFoto()}
              aria-label={foto ? 'Alterar a foto' : 'Adicionar foto'}
            >
              {foto ? (
                <Avatar nome={nome || '?'} photo={foto} size={112} />
              ) : (
                <span className={estilos.avatarVazio}>
                  <Icone nome="user" size={60} />
                </span>
              )}
              <span className={estilos.fotoSelo}>
                {processandoFoto ? (
                  <span className={botoes.girando} />
                ) : (
                  <Icone nome="camera" size={18} />
                )}
              </span>
            </button>

            {foto ? (
              <button
                type="button"
                className={botoes.perigo}
                disabled={ocupado}
                onClick={() => setFoto(null)}
              >
                Remover foto
              </button>
            ) : (
              <p className={estilos.fotoDica}>Clique para adicionar uma foto</p>
            )}
          </SurfaceCard>

          <SurfaceCard className={estilos.bloco}>
            <FormField
              label="Nome completo"
              value={nome}
              onChangeText={setNome}
              placeholder="Digite o nome do membro"
              autoComplete="off"
              autoCapitalize="words"
              error={erros.fullName}
              readOnly={salvando}
            />

            <FormField
              label="Nascimento"
              value={nascimento}
              onChangeText={(v) => setNascimento(formatarData(v))}
              placeholder="dd/mm/aaaa"
              inputMode="numeric"
              maxLength={10}
              // A idade calculada aparece aqui, sem guardar um numero que
              // envelhece sozinho.
              hint={idade ?? undefined}
              error={erros.birthDate}
              readOnly={salvando}
            />

            <div className={estilos.linha}>
              <FormField
                label="Peso"
                value={peso}
                onChangeText={setPeso}
                placeholder="Ex.: 68 kg"
                inputMode="decimal"
                hint={pesoAnotadoEm}
                error={erros.weightKg}
                readOnly={salvando}
              />
              <FormField
                label="Altura"
                value={altura}
                onChangeText={setAltura}
                placeholder="Ex.: 1,70 m"
                inputMode="decimal"
                error={erros.heightCm}
                readOnly={salvando}
              />
            </div>

            {/* Parentesco nao existe para o titular: a lista nao tem "titular",
                e campo que so pode ser preenchido errado e pior que nenhum. */}
            {titular ? null : (
              <SelectField
                label="Parentesco"
                value={parentesco}
                options={PARENTESCOS}
                onChange={setParentesco}
                placeholder="Selecione o parentesco"
                error={erros.relationship}
                disabled={salvando}
              />
            )}

            <div className={estilos.subtitulo}>
              <SectionHeader title="Informações de saúde" icon="leaf" />
            </div>

            <FormField
              label="Observações"
              value={observacoes}
              onChangeText={setObservacoes}
              placeholder="Alguma informação importante?"
              multiline
              error={erros.notes}
              readOnly={salvando}
            />

            {erroGeral ? (
              <p className={estilos.erroGeral} role="alert">
                {erroGeral}
              </p>
            ) : null}

            <PrimaryButton
              title={novo ? 'Salvar membro' : 'Salvar'}
              type="submit"
              loading={salvando}
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
                <Link to={`/relatorio?pessoa=${id}`} className={botoes.texto}>
                  <Icone nome="file-text" size={18} />
                  Relatório para o médico
                </Link>
              ) : null}

              {/* O titular e a propria conta: sair da propria familia nao quer
                  dizer nada, e o servidor recusa de qualquer forma. */}
              {!novo && !titular ? (
                <button
                  type="button"
                  className={botoes.perigo}
                  disabled={salvando}
                  onClick={() => void remover()}
                >
                  Remover da família
                </button>
              ) : null}

              {/* O e-mail nao mora nesta tela, e quem abre "Dados pessoais"
                  vai procura-lo aqui. */}
              {deAjustes ? (
                <Link to="/conta/acesso" replace className={botoes.texto}>
                  Alterar e-mail ou senha
                </Link>
              ) : null}
            </div>

            {!novo && titular && !deAjustes ? (
              <p className={estilos.titularAviso}>
                Esta é a sua conta, por isso ela não pode ser removida da família.
              </p>
            ) : null}
          </SurfaceCard>

          {novo ? (
            <p className={estilos.rodape}>Você poderá editar essas informações depois.</p>
          ) : null}
        </form>
      )}
    </Pagina>
  );
}
