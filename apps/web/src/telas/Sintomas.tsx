import { useQuery, useQueryClient } from '@tanstack/react-query';
import { healthApi, type SymptomEntry, type SymptomKind } from '@gestao/shared/api/health';
import {
  barrasDaJanela,
  descricaoDoGrafico,
  descricaoDoRegistro,
  horaValida,
  legendaDoGrafico,
  momentoDoRegistro,
  momentoEscolhido,
  quantosNaJanela,
  tipoDe,
  TIPOS_DE_SINTOMA,
  type Barra,
} from '@gestao/shared/lib/diarioDeSintomas';
import { hora } from '@gestao/shared/lib/posologia';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { useState, type FormEvent } from 'react';

import { CHAVES, usePerfis } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { Carregando } from '@/ui/Carregando';
import { Chip, Chips } from '@/ui/Chip';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { Aviso, Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Sintomas.module.css';

/** Quantos registros a linha do tempo mostra antes de "Ver historico completo". */
const VISIVEIS = 5;
const DIAS = 7;
const DEGRAUS = [1, 2, 3, 4, 5] as const;

/**
 * Diario de sintomas (/sintomas).
 *
 * SAO SEIS TIPOS. Pressao e glicemia ficaram de fora de proposito — sao
 * medicoes, nao sintomas, e nao cabem numa escala de 1 a 5.
 */
export function Sintomas() {
  const queryClient = useQueryClient();
  const { confirmar, avisar } = useDialogos();

  const perfis = usePerfis();
  const lista = perfis.data ?? [];
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const perfilId =
    escolhido ?? lista.find((p) => p.isAccountHolder)?.id ?? lista[0]?.id ?? null;

  // Os ultimos 30 dias da pessoa. A chave leva a pessoa: ao trocar, os
  // registros da anterior saem da tela na hora.
  const chave = CHAVES.sintomas(perfilId);
  const historico = useQuery({
    queryKey: chave,
    queryFn: () =>
      healthApi.listSymptoms({
        profileId: perfilId!,
        from: startOfDay(subDays(new Date(), 29)),
        to: endOfDay(new Date()),
      }),
    enabled: Boolean(perfilId),
  });
  const registros = historico.data ?? [];

  const [todos, setTodos] = useState(false);
  const [tipo, setTipo] = useState<SymptomKind | null>(null);
  const [intensidade, setIntensidade] = useState<number | null>(null);
  const [temperatura, setTemperatura] = useState('');
  const [dia, setDia] = useState<'hoje' | 'ontem'>('hoje');
  const [horario, setHorario] = useState(() => hora(new Date()));
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvoAs, setSalvoAs] = useState<string | null>(null);

  const agora = new Date();

  function trocarPessoa(id: string | null) {
    setEscolhido(id);
    setTodos(false);
    setSalvoAs(null);
  }

  function escolherTipo(novo: SymptomKind) {
    // Clicar de novo NAO desmarca: desmarcar jogaria fora a escala e a
    // observacao ja digitadas.
    if (novo === tipo) return;
    setTipo(novo);
    setSalvoAs(null);
    // A temperatura so significa algo em febre; a escala sobrevive a troca.
    if (novo !== 'febre') setTemperatura('');
  }

  const definicao = tipo ? tipoDe(tipo) : null;

  const temperaturaNumero = Number(temperatura.replace(',', '.'));
  const temTemperatura = temperatura.trim() !== '';
  const erroDaTemperatura = !temTemperatura
    ? undefined
    : !Number.isFinite(temperaturaNumero)
      ? 'Digite só o número, como 37,8.'
      : temperaturaNumero < 30 || temperaturaNumero > 45
        ? 'Temperatura fora do esperado. Confira o número.'
        : undefined;
  const avisoDaTemperatura =
    !erroDaTemperatura && temTemperatura && temperaturaNumero < 35
      ? 'Confira: essa temperatura é bem baixa.'
      : undefined;

  const quando = horaValida(horario) ? momentoEscolhido(dia, horario, agora) : null;
  const erroDoHorario = !horaValida(horario)
    ? 'Informe a hora, como 14:30.'
    : quando && quando > agora
      ? `Ainda não são ${horario}. Confira o horário.`
      : undefined;

  const podeSalvar =
    !!perfilId && !!tipo && intensidade != null && !erroDaTemperatura && !erroDoHorario;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!podeSalvar || !quando || !tipo || intensidade == null || !perfilId) return;
    setSalvando(true);
    try {
      const criado = await healthApi.createSymptom({
        profileId: perfilId,
        kind: tipo,
        intensity: intensidade,
        occurredAt: quando.toISOString(),
        temperatureC: tipo === 'febre' && temTemperatura ? temperaturaNumero : null,
        note: nota.trim() || null,
      });
      // Entra no topo na hora: e o que prova que caiu.
      queryClient.setQueryData<SymptomEntry[]>(chave, (atual) => [criado, ...(atual ?? [])]);
      setIntensidade(null);
      setTemperatura('');
      setNota('');
      setDia('hoje');
      setHorario(hora(new Date()));
      setSalvoAs(hora(quando));
      // O TIPO continua escolhido, para o grafico nao sumir bem na hora em que
      // a barra nova apareceu.
    } catch (erro) {
      void avisar('Não consegui salvar', mensagemDoErro(erro));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(r: SymptomEntry) {
    if (!(await confirmar('Apagar este registro?', descricaoDoRegistro(r), 'Apagar'))) return;
    try {
      await healthApi.deleteSymptom(r.id);
      queryClient.setQueryData<SymptomEntry[]>(chave, (atual) =>
        (atual ?? []).filter((x) => x.id !== r.id),
      );
    } catch (erro) {
      void avisar('Não consegui apagar', mensagemDoErro(erro));
    }
  }

  const visiveis = todos ? registros.slice(0, 20) : registros.slice(0, VISIVEIS);
  const naJanela = definicao
    ? registros.filter((r) => new Date(r.occurredAt) >= startOfDay(subDays(agora, DIAS - 1)))
    : [];
  const mostrarGrafico = definicao ? quantosNaJanela(naJanela, definicao) >= 2 : false;
  const barras = definicao && mostrarGrafico ? barrasDaJanela(naJanela, definicao, agora, DIAS) : [];

  return (
    <Pagina area="medications" largura="larga">
      <ScreenHeader
        title="Diário de sintomas"
        subtitle="Anote como cada pessoa está se sentindo"
        voltar="historico"
      />

      {perfis.isPending ? (
        <Carregando />
      ) : perfis.isError && lista.length === 0 ? (
        // NUNCA "cadastre alguem" numa falha: a tela diria isso para quem tem
        // a familia inteira cadastrada.
        <div className={estilos.bloco}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void perfis.refetch() }}
          >
            {mensagemDoErro(perfis.error)}
          </Aviso>
        </div>
      ) : (
        <div className={estilos.colunas}>
          <div className={estilos.coluna}>
            <div className={estilos.seletor}>
              <ProfileSelector
                profiles={lista}
                selectedId={perfilId}
                onSelect={trocarPessoa}
                tituloDoPainel="Registrar sintoma de"
                permitirTodos={false}
              />
            </div>

            <SurfaceCard className={estilos.bloco}>
              <h2 className={estilos.blocoTitulo} id="sintomas-tipo">
                Como você está se sentindo hoje?
              </h2>

              <div className={estilos.grade} role="radiogroup" aria-labelledby="sintomas-tipo">
                {TIPOS_DE_SINTOMA.map((t) => {
                  const ativo = t.chave === tipo;
                  return (
                    <button
                      key={t.chave}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      className={estilos.item}
                      onClick={() => escolherTipo(t.chave)}
                    >
                      {/* A cor carrega SELECAO, nao categoria: o icone e o
                          rotulo ja identificam o tipo. */}
                      <span className={estilos.circulo}>
                        <Icone nome={t.icone} size={24} />
                      </span>
                      {t.rotulo}
                    </button>
                  );
                })}
              </div>

              {!tipo ? <p className={estilos.apoio}>Escolha o que você quer anotar.</p> : null}
            </SurfaceCard>

            {definicao ? (
              <form onSubmit={(e) => void salvar(e)} noValidate>
                <div className={estilos.secao}>
                  <SectionHeader title="Registrar sintoma" />
                </div>

                <SurfaceCard>
                  {/* Intensidade e horario LADO A LADO, com um divisor. O
                      horario continua editavel: o diario aceita registro de
                      ontem e de horas atras. */}
                  <div className={estilos.duas}>
                    <div className={estilos.escala}>
                      <p className={estilos.rotulo} id="sintomas-escala">
                        {definicao.nomeDaEscala}
                      </p>
                      {/* Preenchimento CUMULATIVO: de 1 ate o valor ficam
                          cheios. Uma bolinha sozinha na posicao 3 seria ambigua. */}
                      <div
                        className={estilos.bolinhas}
                        role="radiogroup"
                        aria-labelledby="sintomas-escala"
                      >
                        {DEGRAUS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={n === intensidade}
                            aria-label={`${n} de 5, ${definicao.degraus[n - 1]}`}
                            className={estilos.degrau}
                            data-cheia={intensidade != null && n <= intensidade ? '' : undefined}
                            disabled={salvando}
                            onClick={() => {
                              setIntensidade(n);
                              setSalvoAs(null);
                            }}
                          />
                        ))}
                      </div>
                      {/* Sempre presente: sem isto a altura do bloco pula
                          quando a pessoa escolhe o primeiro degrau. */}
                      <p className={estilos.grau} data-vazio={intensidade == null ? '' : undefined}>
                        {intensidade == null
                          ? 'Clique para escolher'
                          : definicao.degraus[intensidade - 1]}
                      </p>
                    </div>

                    <FormField
                      label="Horário"
                      type="time"
                      value={horario}
                      onChangeText={(v) => {
                        setHorario(v);
                        setSalvoAs(null);
                      }}
                      error={erroDoHorario}
                      readOnly={salvando}
                      className={estilos.horario}
                    />
                  </div>

                  <p className={estilos.rotulo}>Quando</p>
                  <div className={estilos.quando}>
                    <Chips rotulo="Dia">
                      {(['hoje', 'ontem'] as const).map((d) => (
                        <Chip
                          key={d}
                          rotulo={d === 'hoje' ? 'Hoje' : 'Ontem'}
                          ativo={dia === d}
                          disabled={salvando}
                          onClick={() => {
                            setDia(d);
                            setSalvoAs(null);
                          }}
                        />
                      ))}
                    </Chips>
                  </div>

                  {tipo === 'febre' ? (
                    <FormField
                      label="Temperatura (°C)"
                      value={temperatura}
                      onChangeText={(v) => {
                        setTemperatura(v);
                        setSalvoAs(null);
                      }}
                      placeholder="37,8"
                      inputMode="decimal"
                      maxLength={5}
                      hint="Opcional. Se você mediu, anote aqui."
                      error={erroDaTemperatura}
                      aviso={avisoDaTemperatura}
                      readOnly={salvando}
                    />
                  ) : null}

                  <FormField
                    label="Observações"
                    value={nota}
                    onChangeText={(v) => {
                      setNota(v);
                      setSalvoAs(null);
                    }}
                    placeholder="Conte como você está se sentindo..."
                    maxLength={500}
                    multiline
                    readOnly={salvando}
                  />

                  <PrimaryButton
                    title="Salvar registro"
                    tom="terracota"
                    type="submit"
                    loading={salvando}
                    disabled={!podeSalvar}
                  />

                  {intensidade == null ? (
                    <p className={estilos.apoioDoBotao}>
                      {definicao.direcao === 'melhor'
                        ? `${definicao.nomeDaEscala} para salvar.`
                        : 'Escolha a intensidade para salvar.'}
                    </p>
                  ) : null}

                  {salvoAs ? (
                    <p className={estilos.salvo} role="status">
                      Registro salvo às {salvoAs}.
                    </p>
                  ) : null}
                </SurfaceCard>
              </form>
            ) : null}
          </div>

          <div className={estilos.coluna}>
            <div className={estilos.secaoDoTopo}>
              <SectionHeader title="Histórico recente" />
            </div>

            {historico.isPending && perfilId ? (
              <Carregando />
            ) : historico.isError && registros.length === 0 ? (
              <Aviso
                icone="alert-circle"
                erro
                acao={{ rotulo: 'Tentar de novo', onClick: () => void historico.refetch() }}
              >
                Não consegui carregar o histórico agora.
              </Aviso>
            ) : registros.length === 0 ? (
              <p className={estilos.vazio}>Seu primeiro registro aparece aqui.</p>
            ) : (
              <SurfaceCard>
                {mostrarGrafico && definicao ? (
                  <>
                    <Grafico
                      barras={barras}
                      titulo={`${definicao.rotulo} nos últimos ${DIAS} dias`}
                      legenda={legendaDoGrafico(definicao)}
                      descricao={descricaoDoGrafico(barras, definicao)}
                    />
                    <hr className={estilos.divisor} />
                  </>
                ) : null}

                {/* Linha do tempo: um trilho liga os pontos; o mais recente em
                    terracota. */}
                <ol className={estilos.tempo}>
                  {visiveis.map((r) => (
                    <li key={r.id} className={estilos.registro}>
                      <span className={estilos.ponto} aria-hidden="true" />
                      <div className={estilos.registroTextos}>
                        <p className={estilos.registroQuando}>{momentoDoRegistro(r, agora)}</p>
                        <p className={estilos.registroDescricao}>{descricaoDoRegistro(r)}</p>
                        {r.note ? <p className={estilos.registroNota}>{r.note}</p> : null}
                      </div>
                      <button
                        type="button"
                        className={estilos.apagar}
                        onClick={() => void apagar(r)}
                        aria-label={`Apagar o registro: ${momentoDoRegistro(r, agora)}, ${descricaoDoRegistro(r)}`}
                      >
                        <Icone nome="trash-2" size={18} />
                      </button>
                    </li>
                  ))}
                </ol>

                {!todos && registros.length > VISIVEIS ? (
                  <button type="button" className={estilos.verMais} onClick={() => setTodos(true)}>
                    Ver histórico completo
                    <Icone nome="chevron-right" size={16} />
                  </button>
                ) : null}
              </SurfaceCard>
            )}
          </div>
        </div>
      )}
    </Pagina>
  );
}

const ALTURA = 96;

/**
 * Grafico de barras feito de caixas, como no aplicativo. Para o leitor de tela
 * e UMA imagem com a serie descrita em palavras, nao sete colunas mudas.
 */
function Grafico({
  barras,
  titulo,
  legenda,
  descricao,
}: {
  barras: Barra[];
  titulo: string;
  legenda: string;
  descricao: string;
}) {
  return (
    <figure className={estilos.grafico}>
      <p className={estilos.graficoTitulo}>{titulo}</p>
      <div className={estilos.colunasDoGrafico} role="img" aria-label={descricao}>
        {barras.map((b) => (
          <div key={b.chave} className={estilos.colunaDoGrafico}>
            {/* Dia sem registro nao some: o trilho vazio diz "nao anotei". */}
            <div className={estilos.trilho} data-vazio={b.valor == null ? '' : undefined}>
              {b.valor != null ? (
                <div
                  className={estilos.barra}
                  data-hoje={b.hoje ? '' : undefined}
                  style={{ height: Math.max(4, Math.round((b.valor / 5) * ALTURA)) }}
                />
              ) : null}
            </div>
            <span className={estilos.dia} data-hoje={b.hoje ? '' : undefined}>
              {b.rotulo}
            </span>
          </div>
        ))}
      </div>
      {/* A legenda diz o que a barra resume e para que lado a escala aponta —
          a direcao se inverte entre os tipos. */}
      <figcaption className={estilos.legenda}>{legenda}</figcaption>
    </figure>
  );
}
