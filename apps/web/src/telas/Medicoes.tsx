import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ERROR } from '@gestao/shared';
import { ApiRequestError } from '@gestao/shared/api/client';
import {
  healthApi,
  type GlucoseContext,
  type Measurement,
  type MeasurementKind,
} from '@gestao/shared/api/health';
import { horaValida, momentoEscolhido } from '@gestao/shared/lib/diarioDeSintomas';
import {
  descricaoDaMedicao,
  descricaoDaSerie,
  MOMENTOS_DA_GLICEMIA,
  serieDoGrafico,
  TEXTO_DO_AVISO_EXTREMO,
  tipoDeMedicao,
  TIPOS_DE_MEDICAO,
  validarMedicao,
  valorExtremo,
  type Campo,
} from '@gestao/shared/lib/medicoes';
import { diaCurto, hora } from '@gestao/shared/lib/posologia';
import { blocosDoPeriodo, periodoDosUltimos } from '@gestao/shared/lib/relatorio';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { CHAVES, useAssinaturaExigida, usePerfis, usePlano } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { escolherFotoDeDocumento } from '@/lib/foto';
import { BlocoDeAviso } from '@/ui/BlocoDeAviso';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { Chip, Chips, SeloDaIA } from '@/ui/Chip';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { GraficoDeMedicoes } from '@/ui/GraficoDeMedicoes';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Medicoes.module.css';

/** A tela busca 90 dias de uma vez (tres blocos de 31); 7 e 30 sao recortes. */
const DIAS_BUSCADOS = 90;
const PERIODOS = [7, 30, 90] as const;
const VISIVEIS = 6;

type Textos = Partial<Record<Campo, string>>;

/**
 * Medicoes (/medicoes): pressao, glicemia, peso e oxigenacao de cada pessoa.
 *
 * Registrar e ver e GRATIS. A assinatura so libera "Fotografar o visor", em
 * que a IA le os numeros do aparelho e preenche os campos — e a pessoa
 * confere antes de salvar; quem barra de verdade e o servidor (403).
 *
 * REFERENCIA SEM VEREDITO: o grafico mostra a faixa usual com a fonte, e
 * nenhum valor e chamado de alto ou baixo. So um valor extremo traz o aviso
 * neutro com o 192 (lib/medicoes do shared).
 */
export function Medicoes() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { confirmar, avisar } = useDialogos();
  const { premium, politicaVelha } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();
  const [params] = useSearchParams();

  const perfis = usePerfis();
  const lista = perfis.data ?? [];
  const [escolhido, setEscolhido] = useState<string | null>(() => params.get('pessoa'));
  const perfilId =
    (escolhido && lista.some((p) => p.id === escolhido) ? escolhido : null) ??
    lista.find((p) => p.isAccountHolder)?.id ??
    lista[0]?.id ??
    null;

  const chave = CHAVES.medicoesDe(perfilId, DIAS_BUSCADOS);
  const historico = useQuery({
    queryKey: chave,
    enabled: Boolean(perfilId),
    queryFn: async () => {
      const { inicio, fim } = periodoDosUltimos(DIAS_BUSCADOS, new Date());
      const blocos = await Promise.all(
        blocosDoPeriodo(inicio, fim).map((b) =>
          healthApi.listMeasurements({ profileId: perfilId!, from: b.de, to: b.ate }),
        ),
      );
      const vistos = new Set<string>();
      return blocos
        .flat()
        .filter((m) => !vistos.has(m.id) && vistos.add(m.id))
        .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    },
  });
  const medicoes = historico.data ?? [];

  const [tipoChave, setTipoChave] = useState<MeasurementKind>('pressao');
  const tipo = tipoDeMedicao(tipoChave)!;
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [textos, setTextos] = useState<Textos>({});
  const [momento, setMomento] = useState<GlucoseContext | null>(null);
  const [dia, setDia] = useState<'hoje' | 'ontem'>('hoje');
  const [horario, setHorario] = useState(() => hora(new Date()));
  const [nota, setNota] = useState('');
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salva, setSalva] = useState<Measurement | null>(null);
  const [todos, setTodos] = useState(false);

  // Leitura do visor.
  const [daFoto, setDaFoto] = useState<Set<Campo>>(new Set());
  const [lendo, setLendo] = useState(false);
  const [erroDaFoto, setErroDaFoto] = useState<string | null>(null);
  const [limiteDaFoto, setLimiteDaFoto] = useState(false);
  const cancelamento = useRef<AbortController | null>(null);
  const abandonado = useRef(false);

  useEffect(() => {
    abandonado.current = false;
    return () => {
      abandonado.current = true;
      cancelamento.current?.abort();
    };
  }, []);

  const agora = new Date();

  function limparFormulario() {
    setTextos({});
    setMomento(null);
    setNota('');
    setTentou(false);
    setDaFoto(new Set());
    setErroDaFoto(null);
  }

  function trocarPessoa(id: string | null) {
    cancelamento.current?.abort();
    setEscolhido(id);
    setSalva(null);
    setTodos(false);
    limparFormulario();
  }

  function trocarTipo(novo: MeasurementKind) {
    if (novo === tipoChave) return;
    cancelamento.current?.abort();
    setTipoChave(novo);
    setSalva(null);
    setTodos(false);
    limparFormulario();
  }

  function digitar(campo: Campo, valor: string) {
    setTextos((t) => ({ ...t, [campo]: valor }));
    setSalva(null);
    // Mexeu no numero: deixa de ser "da foto".
    if (daFoto.has(campo)) {
      setDaFoto((s) => {
        const n = new Set(s);
        n.delete(campo);
        return n;
      });
    }
  }

  const { valores, erros } = validarMedicao(tipo, textos);
  // Erro aparece no campo ja digitado, ou em todos depois de tentar salvar.
  const erroVisivel = (c: Campo) => (tentou || (textos[c] ?? '').trim() !== '' ? erros[c] : undefined);
  const faltaMomento = tipoChave === 'glicemia' && !momento;

  const quando = horaValida(horario) ? momentoEscolhido(dia, horario, agora) : null;
  const erroDoHorario = !horaValida(horario)
    ? 'Informe a hora, como 14:30.'
    : quando && quando > agora
      ? `Ainda não são ${horario}. Confira o horário.`
      : undefined;

  const valido = Object.keys(erros).length === 0 && !faltaMomento && !erroDoHorario;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (!valido || !quando || !perfilId) return;
    setSalvando(true);
    try {
      const criada = await healthApi.createMeasurement({
        profileId: perfilId,
        kind: tipoChave,
        measuredAt: quando.toISOString(),
        note: nota.trim() || null,
        source: daFoto.size > 0 ? 'foto' : 'manual',
        ...valores,
        ...(tipoChave === 'glicemia' ? { glucoseContext: momento } : {}),
      });
      queryClient.setQueryData<Measurement[]>(chave, (atual) =>
        [criada, ...(atual ?? [])].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)),
      );
      // O peso mais recente vira o peso da ficha (a API grava os dois juntos).
      if (tipoChave === 'peso') void queryClient.invalidateQueries({ queryKey: CHAVES.perfis });
      limparFormulario();
      setDia('hoje');
      setHorario(hora(new Date()));
      setSalva(criada);
    } catch (erro) {
      void avisar('Não consegui salvar', mensagemDoErro(erro));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(m: Measurement) {
    const d = new Date(m.measuredAt);
    if (
      !(await confirmar(
        'Apagar esta medição?',
        `${diaCurto(d)} às ${hora(d)}: ${descricaoDaMedicao(m)}`,
        'Apagar',
      ))
    )
      return;
    try {
      await healthApi.deleteMeasurement(m.id);
      queryClient.setQueryData<Measurement[]>(chave, (atual) => (atual ?? []).filter((x) => x.id !== m.id));
      if (m.kind === 'peso') void queryClient.invalidateQueries({ queryKey: CHAVES.perfis });
      if (salva?.id === m.id) setSalva(null);
    } catch (erro) {
      void avisar('Não consegui apagar', mensagemDoErro(erro));
    }
  }

  /** Abre a camera (ou o arquivo) e manda ler. Chamado direto do clique. */
  async function fotografar() {
    setErroDaFoto(null);
    const escolha = await escolherFotoDeDocumento({ camera: true });
    if (!escolha.ok) {
      if (escolha.motivo === 'falha') setErroDaFoto('Não consegui usar a foto. Tente de novo, ou escolha outra imagem.');
      return;
    }
    const kind = tipoChave;
    const controller = new AbortController();
    cancelamento.current = controller;
    setLendo(true);
    try {
      const leitura = await healthApi.lerVisor({ photo: escolha.dataUri, kind, profileId: perfilId }, controller.signal);
      if (abandonado.current) return;
      const novos: Textos = {};
      const lidos = new Set<Campo>();
      for (const c of tipo.campos) {
        const v = leitura[c.campo];
        if (v != null) {
          novos[c.campo] = String(v).replace('.', ',');
          lidos.add(c.campo);
        }
      }
      setTextos(novos);
      setDaFoto(lidos);
      setSalva(null);
    } catch (erro) {
      if (abandonado.current || controller.signal.aborted) return;
      if (tratarAssinatura(erro)) return;
      if (erro instanceof ApiRequestError && erro.code === API_ERROR.PHOTO_READ_LIMIT_REACHED) setLimiteDaFoto(true);
      setErroDaFoto(mensagemDoErro(erro));
    } finally {
      cancelamento.current = null;
      if (!abandonado.current) setLendo(false);
    }
  }

  // Ultima medicao de cada tipo, para os cartoes.
  const ultimaDe = (k: MeasurementKind) => medicoes.find((m) => m.kind === k) ?? null;

  const { inicio, fim } = periodoDosUltimos(dias, agora);
  const doPeriodo = medicoes.filter(
    (m) => m.kind === tipoChave && new Date(m.measuredAt) >= inicio && new Date(m.measuredAt) <= fim,
  );
  const serie = serieDoGrafico(doPeriodo, tipo, inicio, fim);
  const visiveis = todos ? doPeriodo : doPeriodo.slice(0, VISIVEIS);
  const ocupado = salvando || lendo;

  return (
    <Pagina area="medications" largura="larga">
      <ScreenHeader
        title="Medições"
        subtitle="Pressão, glicemia, peso e oxigenação de cada pessoa"
        voltar="historico"
      />

      {perfis.isPending ? (
        <Carregando />
      ) : perfis.isError && lista.length === 0 ? (
        <div className={estilos.bloco}>
          <Aviso icone="alert-circle" erro acao={{ rotulo: 'Tentar de novo', onClick: () => void perfis.refetch() }}>
            {mensagemDoErro(perfis.error)}
          </Aviso>
        </div>
      ) : (
        <>
          <div className={estilos.seletor}>
            <ProfileSelector
              profiles={lista}
              selectedId={perfilId}
              onSelect={trocarPessoa}
              tituloDoPainel="Medições de"
              permitirTodos={false}
            />
          </div>

          {/* Um cartao por tipo, com a ultima medicao. Escolher o cartao troca
              o formulario e o grafico. */}
          <div className={estilos.tipos} role="radiogroup" aria-label="Tipo de medição">
            {TIPOS_DE_MEDICAO.map((t) => {
              const ultima = ultimaDe(t.chave);
              const d = ultima ? new Date(ultima.measuredAt) : null;
              return (
                <button
                  key={t.chave}
                  type="button"
                  role="radio"
                  aria-checked={t.chave === tipoChave}
                  className={estilos.tipo}
                  onClick={() => trocarTipo(t.chave)}
                >
                  <span className={estilos.tipoIcone} aria-hidden="true">
                    <Icone nome={t.icone} size={22} />
                  </span>
                  <span className={estilos.tipoTextos}>
                    <span className={estilos.tipoRotulo}>{t.rotulo}</span>
                    <span className={estilos.tipoValor}>
                      {historico.isPending && perfilId ? '…' : ultima ? descricaoDaMedicao(ultima) : 'Sem medição'}
                    </span>
                    {d ? (
                      <span className={estilos.tipoQuando}>
                        {diaCurto(d)} às {hora(d)}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={estilos.colunas}>
            <div className={estilos.coluna}>
              <div className={estilos.secaoDoTopo}>
                <SectionHeader title={`Registrar ${tipo.rotulo.toLowerCase()}`} />
              </div>

              <form onSubmit={(e) => void salvar(e)} noValidate>
                <SurfaceCard>
                  <Visor
                    premium={premium}
                    politicaVelha={politicaVelha}
                    bloqueado={limiteDaFoto}
                    lendo={lendo}
                    desabilitado={salvando || !perfilId}
                    erro={erroDaFoto}
                    onFotografar={() => void fotografar()}
                    onCancelar={() => cancelamento.current?.abort()}
                    onPolitica={() => navigate('/conta/privacidade')}
                  />

                  <div className={estilos.campos}>
                    {tipo.campos.map((c) => (
                      <FormField
                        key={c.campo}
                        label={c.opcional ? `${c.rotulo} — opcional` : c.rotulo}
                        value={textos[c.campo] ?? ''}
                        onChangeText={(v) => digitar(c.campo, v)}
                        inputMode={c.decimal ? 'decimal' : 'numeric'}
                        maxLength={6}
                        selo={daFoto.has(c.campo) ? <SeloDaIA /> : undefined}
                        aviso={daFoto.has(c.campo) && !erroVisivel(c.campo) ? 'Lido da foto. Confira com o visor.' : undefined}
                        error={erroVisivel(c.campo)}
                        readOnly={ocupado}
                        className={estilos.campo}
                      />
                    ))}
                  </div>

                  {tipoChave === 'glicemia' ? (
                    <div className={estilos.grupo}>
                      <p className={estilos.rotulo}>Quando foi medida</p>
                      <Chips rotulo="Momento da glicemia">
                        {MOMENTOS_DA_GLICEMIA.map((m) => (
                          <Chip
                            key={m.chave}
                            rotulo={m.rotulo}
                            ativo={momento === m.chave}
                            disabled={ocupado}
                            onClick={() => {
                              setMomento(m.chave);
                              setSalva(null);
                            }}
                          />
                        ))}
                      </Chips>
                      {tentou && faltaMomento ? (
                        <p className={estilos.erro} role="alert">
                          Escolha o momento da medição.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={estilos.duas}>
                    <div className={estilos.grupo}>
                      <p className={estilos.rotulo}>Dia</p>
                      <Chips rotulo="Dia">
                        {(['hoje', 'ontem'] as const).map((d) => (
                          <Chip
                            key={d}
                            rotulo={d === 'hoje' ? 'Hoje' : 'Ontem'}
                            ativo={dia === d}
                            disabled={ocupado}
                            onClick={() => {
                              setDia(d);
                              setSalva(null);
                            }}
                          />
                        ))}
                      </Chips>
                    </div>
                    <FormField
                      label="Horário"
                      type="time"
                      value={horario}
                      onChangeText={(v) => {
                        setHorario(v);
                        setSalva(null);
                      }}
                      error={erroDoHorario}
                      readOnly={ocupado}
                      className={estilos.horario}
                    />
                  </div>

                  <FormField
                    label="Observações"
                    value={nota}
                    onChangeText={(v) => {
                      setNota(v);
                      setSalva(null);
                    }}
                    placeholder="Ex.: medi sentado, depois do café"
                    maxLength={500}
                    multiline
                    readOnly={ocupado}
                  />

                  <PrimaryButton
                    title="Salvar medição"
                    tom="terracota"
                    type="submit"
                    loading={salvando}
                    disabled={!perfilId || lendo}
                  />

                  {salva ? (
                    <p className={estilos.salvo} role="status">
                      Medição salva: {descricaoDaMedicao(salva)}.
                    </p>
                  ) : null}
                </SurfaceCard>
              </form>

              {/* Aviso neutro, so para valor extremo: nao diagnostica, so
                  lembra para onde ligar. */}
              {salva && valorExtremo(salva) ? (
                <div className={estilos.bloco}>
                  <BlocoDeAviso
                    tom="atencao"
                    icone="phone"
                    titulo="Observe como a pessoa está"
                    texto={TEXTO_DO_AVISO_EXTREMO}
                  />
                </div>
              ) : null}
            </div>

            <div className={estilos.coluna}>
              <div className={estilos.secaoDoTopo}>
                <SectionHeader title="Histórico" />
              </div>

              <SurfaceCard>
                <Chips rotulo="Período do gráfico">
                  {PERIODOS.map((p) => (
                    <Chip
                      key={p}
                      rotulo={`${p} dias`}
                      ativo={dias === p}
                      onClick={() => {
                        setDias(p);
                        setTodos(false);
                      }}
                    />
                  ))}
                </Chips>

                {historico.isPending && perfilId ? (
                  <Carregando />
                ) : historico.isError && medicoes.length === 0 ? (
                  <div className={estilos.bloco}>
                    <Aviso
                      icone="alert-circle"
                      erro
                      acao={{ rotulo: 'Tentar de novo', onClick: () => void historico.refetch() }}
                    >
                      Não consegui carregar as medições agora.
                    </Aviso>
                  </div>
                ) : doPeriodo.length === 0 ? (
                  <div className={estilos.vazio}>
                    <IconTile size={48} icone={tipo.icone} {...LADRILHO_NEUTRO} />
                    <p>
                      Nenhuma medição de {tipo.rotulo.toLowerCase()} nos últimos {dias} dias. A primeira que você
                      salvar aparece aqui, no gráfico.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className={estilos.grafico}>
                      <GraficoDeMedicoes serie={serie} descricao={descricaoDaSerie(serie, dias)} />
                    </div>

                    <hr className={estilos.divisor} />

                    <ul className={estilos.lista}>
                      {visiveis.map((m) => {
                        const d = new Date(m.measuredAt);
                        return (
                          <li key={m.id} className={estilos.item}>
                            <div className={estilos.itemTextos}>
                              <p className={estilos.itemQuando}>
                                {diaCurto(d)} às {hora(d)}
                                {m.source === 'foto' ? ' · lida da foto' : ''}
                              </p>
                              <p className={estilos.itemValor}>{descricaoDaMedicao(m)}</p>
                              {m.note ? <p className={estilos.itemNota}>{m.note}</p> : null}
                            </div>
                            <button
                              type="button"
                              className={estilos.apagar}
                              onClick={() => void apagar(m)}
                              aria-label={`Apagar a medição de ${diaCurto(d)} às ${hora(d)}: ${descricaoDaMedicao(m)}`}
                            >
                              <Icone nome="trash-2" size={18} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {!todos && doPeriodo.length > VISIVEIS ? (
                      <button type="button" className={estilos.verMais} onClick={() => setTodos(true)}>
                        Ver todas ({doPeriodo.length})
                        <Icone nome="chevron-right" size={16} />
                      </button>
                    ) : null}
                  </>
                )}
              </SurfaceCard>

              <p className={estilos.nota}>
                As medições também entram no <Link to="/relatorio">relatório para o médico</Link>.
              </p>
            </div>
          </div>
        </>
      )}
    </Pagina>
  );
}

/**
 * "Fotografar o visor". Sem assinatura, vira uma linha com cadeado que leva a
 * assinatura (um botao que nao faz nada e pior que nenhum); sem o aceite da
 * politica atual, um aviso — a digitacao continua aberta nos dois casos.
 */
function Visor({
  premium,
  politicaVelha,
  bloqueado,
  lendo,
  desabilitado,
  erro,
  onFotografar,
  onCancelar,
  onPolitica,
}: {
  premium: boolean;
  politicaVelha: boolean;
  bloqueado: boolean;
  lendo: boolean;
  desabilitado: boolean;
  erro: string | null;
  onFotografar: () => void;
  onCancelar: () => void;
  onPolitica: () => void;
}) {
  if (!premium) {
    return (
      <Link
        to="/conta/assinatura"
        className={estilos.trancado}
        aria-label="Fotografar o visor do aparelho. Faz parte da assinatura."
      >
        <Icone nome="lock" size={18} color="var(--cor-accent-green)" />
        <span className={estilos.trancadoTextos}>
          <span className={estilos.trancadoTitulo}>Fotografar o visor</span>
          <span className={estilos.trancadoTexto}>A IA lê os números do aparelho. Faz parte da assinatura.</span>
        </span>
        <Icone nome="chevron-right" size={20} color="var(--cor-text-secondary)" />
      </Link>
    );
  }

  if (politicaVelha) {
    return (
      <div className={estilos.visor}>
        <BlocoDeAviso
          tom="atencao"
          icone="shield"
          titulo="Para ler a foto, falta seu aceite na política nova"
          texto="A leitura usa um parceiro fora do Brasil, e isso está descrito na versão atual da política. Digitar continua normal."
          acaoPrincipal={{ rotulo: 'Ver a política', estilo: 'contorno', onClick: onPolitica }}
        />
      </div>
    );
  }

  return (
    <div className={estilos.visor}>
      {lendo ? (
        <div className={estilos.lendo} role="status">
          <span className={botoes.girando} />
          <span>Lendo os números do visor…</span>
          <button type="button" className={`${botoes.texto} ${estilos.cancelar}`} onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`${botoes.contorno} ${botoes.largo}`}
          disabled={desabilitado || bloqueado}
          onClick={onFotografar}
        >
          <Icone nome="camera" size={18} />
          Fotografar o visor
        </button>
      )}
      <p className={erro ? estilos.erro : estilos.apoio} role={erro ? 'alert' : undefined}>
        {erro ?? 'A IA preenche os números. Você confere com o visor antes de salvar. A foto não é guardada.'}
      </p>
    </div>
  );
}
