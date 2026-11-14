import { useQueryClient } from '@tanstack/react-query';
import { healthApi, type MedicationInput } from '@gestao/shared/api/health';
import { dataParaISO, formatarData, isoParaData } from '@gestao/shared/lib/pessoa';
import { hora } from '@gestao/shared/lib/posologia';
import {
  aplicarPrimeiraDose,
  definirPrimeiraDose,
  descartarReceita,
  guardarReceita,
  instanteDaPrimeiraDose,
  lerReceita,
  proximasDosesDoIntervalo,
  removerItemDoLote,
  type CamposDoRascunho,
  type RascunhoDeReceita,
  type RespostaPrimeiraDose,
} from '@gestao/shared/lib/rascunhoDeMedicamento';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { CHAVES, usePerfis, useTodosOsMedicos } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import botoes from '@/ui/botoes.module.css';
import { Chip, Chips } from '@/ui/Chip';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { ImageViewer } from '@/ui/ImageViewer';
import { Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import form from './MedicamentoForm.module.css';
import estilos from './RevisarReceita.module.css';

type EscolhaMedico = { modo: 'novo' } | { modo: 'existente'; id: string } | { modo: 'nenhum' };

function medicoInicial(r: RascunhoDeReceita): EscolhaMedico {
  if (r.prescritorId) return { modo: 'existente', id: r.prescritorId };
  if (r.prescriberName) return { modo: 'novo' };
  return { modo: 'nenhum' };
}

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * O que a pessoa ja respondeu nesta revisao (para quem, medico, data...).
 *
 * No aplicativo a tela continua montada enquanto um item e editado. Aqui,
 * abrir o formulario do item troca de rota e a tela nasce de novo na volta —
 * sem esta memoria, as respostas se perderiam a cada "Editar". Vale so para a
 * mesma leitura (readId) e mora em memoria, como a receita.
 */
type Respostas = {
  readId: string;
  perfilId: string | null;
  medico: EscolhaMedico;
  especialidade: string;
  dataConsulta: string;
  guardarFoto: boolean;
  /** Medico ja criado e consulta ja registrada numa tentativa anterior de salvar. */
  medicoResolvido: string | null | undefined;
  consultaFeita: boolean;
};
let memoria: Respostas | null = null;

function respostasIniciais(r: RascunhoDeReceita): Respostas {
  if (memoria?.readId === r.readId) return memoria;
  return {
    readId: r.readId,
    perfilId: null,
    medico: medicoInicial(r),
    especialidade: r.specialtyRead ?? '',
    dataConsulta: isoParaData(r.consultationDate),
    guardarFoto: false,
    medicoResolvido: undefined,
    consultaFeita: false,
  };
}

const copia = (r: RascunhoDeReceita | null) => (r ? { ...r, itens: [...r.itens] } : null);

/**
 * Revisao da receita lida por foto: para quem e, o medico, a data da consulta
 * e cada remedio, com a pergunta da primeira dose.
 *
 * Nada foi salvo ate aqui. "Confirmar e salvar" cria o medico (se for novo), a
 * consulta e cada remedio, um a um; o que falhar fica na tela para tentar de
 * novo, sem repetir o que ja foi criado.
 */
export function RevisarReceita() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmar } = useDialogos();
  const perfis = usePerfis();
  const medicos = useTodosOsMedicos();

  const [receita, setReceita] = useState<RascunhoDeReceita | null>(() => copia(lerReceita()));
  const [r, setR] = useState<Respostas | null>(() => {
    const lida = lerReceita();
    return lida ? respostasIniciais(lida) : null;
  });
  const mudar = (parte: Partial<Respostas>) => setR((atual) => (atual ? { ...atual, ...parte } : atual));

  const [ampliada, setAmpliada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const [erroData, setErroData] = useState<string | null>(null);
  const [errosDose, setErrosDose] = useState<Record<number, string>>({});
  const cartoes = useRef<Record<number, HTMLDivElement | null>>({});

  // Guarda as respostas para sobreviverem a ida ao formulario de um item.
  useEffect(() => {
    memoria = r;
  }, [r]);

  // A receita venceu (15 min) ou a pagina foi recarregada: volta para a foto.
  useEffect(() => {
    if (!receita) navigate('/remedios/novo', { replace: true });
  }, [receita, navigate]);

  // Comeca no titular da conta.
  const perfilId = r?.perfilId ?? null;
  useEffect(() => {
    if (perfilId || !perfis.data) return;
    mudar({ perfilId: perfis.data.find((p) => p.isAccountHolder)?.id ?? perfis.data[0]?.id ?? null });
  }, [perfilId, perfis.data]);

  if (!receita || !r) return <Pagina area="medications" largura="formulario">{null}</Pagina>;

  const recarregar = () => setReceita(copia(lerReceita()));

  async function remover(indice: number) {
    if (!receita || receita.itens.length <= 1) return;
    const nome = receita.itens[indice]?.campos.nome || 'este remédio';
    if (!(await confirmar('Remover da receita', `Tirar ${nome} desta receita?`, 'Remover'))) return;
    removerItemDoLote(indice);
    setErrosDose({});
    recarregar();
  }

  function mudarPrimeiraDose(indice: number, resposta: RespostaPrimeiraDose) {
    definirPrimeiraDose(indice, resposta);
    setErrosDose(({ [indice]: _fora, ...resto }) => resto);
    recarregar();
  }

  /** Copia a resposta para os outros remedios que ainda nao tem uma. */
  function usarEmTodos(resposta: RespostaPrimeiraDose) {
    receita!.itens.forEach((it, i) => {
      if (it.campos.tipo !== 'as_needed' && (it.primeiraDose?.jaTomou ?? null) === null) {
        definirPrimeiraDose(i, resposta);
      }
    });
    setErrosDose({});
    recarregar();
  }

  function paraInput(
    campos: CamposDoRascunho,
    readItem: number,
    prescriberId: string | null,
    startsAt: string | null,
  ): MedicationInput {
    const q = Number(campos.quantidade.replace(',', '.'));
    const emb = Number(campos.embalagem.replace(',', '.'));
    return {
      profileId: r!.perfilId!,
      name: campos.nome.trim(),
      strength: campos.concentracao.trim() || null,
      form: campos.forma,
      doseAmount: Number.isFinite(q) && q > 0 ? q : null,
      doseUnit: campos.forma === 'outro' ? null : campos.forma,
      packageAmount: Number.isFinite(emb) && emb > 0 ? Math.round(emb) : null,
      endsAt: campos.fimDoTratamento,
      startsAt,
      scheduleType: campos.tipo,
      intervalHours: campos.tipo === 'interval' ? campos.intervalo : null,
      times:
        campos.tipo === 'fixed_times' ? campos.horarios.filter((h) => HORA_VALIDA.test(h)) : [],
      dayInterval: campos.tipo === 'fixed_times' ? campos.diasIntervalo : null,
      weekdays: campos.tipo === 'fixed_times' ? campos.diasSemana : null,
      totalDoses: campos.tipo !== 'as_needed' ? campos.totalDoses : null,
      instructions: campos.instrucoes.trim() || null,
      prescriberId,
      photoReadId: receita!.readId,
      photoReadItem: readItem,
    };
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!receita || !r || salvando) return;
    setErroGeral(null);
    setProgresso(null);

    if (!r.perfilId) {
      setErroPerfil('Escolha para quem é esta receita');
      return;
    }
    setErroPerfil(null);

    const temData = r.dataConsulta.trim().length > 0;
    const isoData = temData ? dataParaISO(r.dataConsulta) : null;
    if (temData && !isoData) {
      setErroData('Confira a data: use dia/mês/ano, como 23/06/2026');
      return;
    }
    setErroData(null);

    if (receita.itens.some((it) => it.campos.nome.trim().length < 2)) {
      setErroGeral('Um dos remédios está sem nome. Use "Editar" para completar.');
      return;
    }

    // A primeira dose de cada remedio com horario precisa de resposta valida.
    const agora = new Date();
    const instantes = receita.itens.map((it) =>
      it.campos.tipo === 'as_needed' ? null : instanteDaPrimeiraDose(it.primeiraDose, agora),
    );
    const erros: Record<number, string> = {};
    instantes.forEach((inst, i) => {
      if (inst && !inst.ok) erros[i] = inst.erro;
    });
    const faltando = Object.keys(erros).map(Number);
    if (faltando.length > 0) {
      setErrosDose(erros);
      setErroGeral(
        faltando.length === 1
          ? 'Falta responder a primeira dose de um remédio.'
          : `Falta responder a primeira dose de ${faltando.length} remédios.`,
      );
      cartoes.current[faltando[0]!]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrosDose({});

    setSalvando(true);
    try {
      // O medico e criado UMA vez: numa nova tentativa, vale o da anterior.
      let prescriberId: string | null;
      if (r.medicoResolvido !== undefined) {
        prescriberId = r.medicoResolvido;
      } else if (r.medico.modo === 'existente') {
        prescriberId = r.medico.id;
      } else if (r.medico.modo === 'novo' && receita.prescriberName) {
        const prof = await healthApi.createProfessional({
          name: receita.prescriberName.trim(),
          specialty: r.especialidade.trim() || null,
        });
        prescriberId = prof.id;
      } else {
        prescriberId = null;
      }
      let consultaFeita = r.consultaFeita;
      mudar({ medicoResolvido: prescriberId });

      if (!consultaFeita && isoData) {
        try {
          const [a, m, d] = isoData.split('-').map(Number);
          await healthApi.createAppointment({
            profileId: r.perfilId,
            professionalId: prescriberId,
            // Meio-dia local: a data nao muda de dia em nenhum fuso do pais.
            scheduledAt: new Date(a!, m! - 1, d!, 12, 0, 0).toISOString(),
            modality: 'presencial',
            status: 'realizada',
            title: r.especialidade.trim() || 'Consulta',
          });
          consultaFeita = true;
          mudar({ consultaFeita: true });
        } catch {
          // A consulta e um registro de apoio: nao impede os remedios.
        }
      }

      const total = receita.itens.length;
      const restantes: RascunhoDeReceita['itens'] = [];
      let salvos = 0;

      for (const [indice, item] of receita.itens.entries()) {
        try {
          const instante = instantes[indice];
          const quando = instante?.ok ? instante.quando : null;
          const { campos, startsAt } = aplicarPrimeiraDose(item.campos, quando);
          const criado = await healthApi.createMedication(
            paraInput(campos, item.readItem, prescriberId, startsAt),
          );

          // "Ja tomei": a primeira dose entra no historico.
          if (quando && item.primeiraDose?.jaTomou) {
            try {
              const iso = quando.toISOString();
              await healthApi.registerDose(criado.id, {
                scheduledFor: iso,
                takenAt: iso,
                status: 'tomada',
              });
            } catch {
              // O remedio existe; a dose pode ser marcada depois, na lista.
            }
          }
          if (r.guardarFoto && receita.foto) {
            try {
              await healthApi.updateMedication(criado.id, { prescriptionPhoto: receita.foto });
            } catch {
              // Idem: a foto pode ser anexada depois, na tela do remedio.
            }
          }
          salvos += 1;
        } catch {
          restantes.push(item);
        }
      }

      void queryClient.invalidateQueries({ queryKey: CHAVES.remedios });
      void queryClient.invalidateQueries({ queryKey: ['medicos'] });
      void queryClient.invalidateQueries({ queryKey: ['consultas'] });

      if (restantes.length === 0) {
        descartarReceita();
        memoria = null;
        navigate('/remedios', { replace: true });
        return;
      }

      // Ficaram alguns: so eles continuam na tela, para a nova tentativa.
      guardarReceita({
        ...receita,
        itens: restantes,
        prescritorId: prescriberId,
        consultationDate: consultaFeita ? null : receita.consultationDate,
      });
      setReceita({ ...receita, itens: restantes });
      setProgresso(`Salvei ${salvos} de ${total}. Tente de novo para salvar o resto.`);
    } catch (e) {
      setErroGeral(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina area="medications" largura="formulario">
      <ScreenHeader title="Revise a receita" voltar="historico" />

      <form onSubmit={salvar} noValidate>
        <SurfaceCard className={form.bloco}>
          <h2 className={form.blocoTitulo}>Para quem é esta receita</h2>
          <ProfileSelector
            profiles={perfis.data ?? []}
            selectedId={r.perfilId}
            onSelect={(id) => {
              setErroPerfil(null);
              mudar({ perfilId: id });
            }}
            tituloDoPainel="Para quem é esta receita"
            permitirTodos={false}
          />
          {erroPerfil ? (
            <p className={estilos.erro} role="alert">
              {erroPerfil}
            </p>
          ) : null}
          <p className={`${form.blocoAjuda} ${estilos.respiro}`}>
            Todos os remédios desta receita vão para a mesma pessoa.
          </p>
        </SurfaceCard>

        <SurfaceCard className={form.bloco}>
          <h2 className={form.blocoTitulo}>Dados da receita</h2>

          <p className={form.rotulo}>Médico</p>
          <Chips rotulo="Médico">
            {receita.prescriberName ? (
              <Chip
                rotulo={`${receita.prescriberName} · Novo`}
                ativo={r.medico.modo === 'novo'}
                disabled={salvando}
                onClick={() => mudar({ medico: { modo: 'novo' } })}
              />
            ) : null}
            {(medicos.data ?? []).map((md) => (
              <Chip
                key={md.id}
                rotulo={md.name}
                ativo={r.medico.modo === 'existente' && r.medico.id === md.id}
                disabled={salvando}
                onClick={() => mudar({ medico: { modo: 'existente', id: md.id } })}
              />
            ))}
            <Chip
              rotulo="Nenhum"
              ativo={r.medico.modo === 'nenhum'}
              disabled={salvando}
              onClick={() => mudar({ medico: { modo: 'nenhum' } })}
            />
          </Chips>
          {r.medico.modo === 'novo' ? (
            <p className={`${form.blocoAjuda} ${estilos.sobeUmPouco}`}>
              Este médico ainda não está cadastrado. Vou criá-lo com o nome e a especialidade
              abaixo, e vincular os remédios a ele.
            </p>
          ) : null}

          <FormField
            label="Especialidade"
            value={r.especialidade}
            onChangeText={(v) => mudar({ especialidade: v })}
            placeholder="Pediatria"
            hint="Entra na ficha do médico e no registro da consulta."
            readOnly={salvando}
          />
          <FormField
            label="Data da consulta"
            value={r.dataConsulta}
            onChangeText={(v) => {
              setErroData(null);
              mudar({ dataConsulta: formatarData(v) });
            }}
            placeholder="23/06/2026"
            inputMode="numeric"
            maxLength={10}
            hint="A consulta fica registrada como realizada. Deixe em branco se não souber."
            error={erroData ?? undefined}
            readOnly={salvando}
            className={form.ultimo}
          />
        </SurfaceCard>

        {receita.foto ? (
          <SurfaceCard className={form.bloco}>
            <button
              type="button"
              className={estilos.foto}
              disabled={salvando}
              onClick={() => setAmpliada(true)}
              aria-label="Ampliar a foto da receita"
            >
              <img src={receita.foto} alt="" />
              <span className={estilos.lupa}>
                <Icone nome="maximize-2" size={15} />
              </span>
            </button>

            {/* DESLIGADO por padrao: a receita traz paciente, CRM e as vezes o
                diagnostico, entao so e guardada se a pessoa pedir. */}
            <label className={`${form.guardar} ${estilos.respiro}`}>
              <input
                type="checkbox"
                className={form.caixaDeMarcar}
                checked={r.guardarFoto}
                disabled={salvando}
                onChange={(e) => mudar({ guardarFoto: e.target.checked })}
              />
              <span>
                <span className={form.guardarTitulo}>
                  Guardar a foto da receita nestes remédios
                </span>
                <span className={form.guardarAjuda}>
                  Ela fica na tela de cada remédio, para você ter em mãos na farmácia.
                </span>
              </span>
            </label>
          </SurfaceCard>
        ) : null}

        <h2 className={estilos.listaTitulo}>
          {receita.itens.length === 1
            ? '1 remédio nesta receita'
            : `${receita.itens.length} remédios nesta receita`}
        </h2>

        <div className={estilos.itens}>
          {receita.itens.map((item, indice) => (
            <div
              key={`${item.readItem}-${indice}`}
              ref={(el) => {
                cartoes.current[indice] = el;
              }}
            >
              <CartaoDoItem
                indice={indice}
                campos={item.campos}
                primeiraDose={item.primeiraDose}
                erroDose={errosDose[indice] ?? null}
                podeUsarEmTodos={receita.itens.some(
                  (it, i) =>
                    i !== indice &&
                    it.campos.tipo !== 'as_needed' &&
                    (it.primeiraDose?.jaTomou ?? null) === null,
                )}
                podeRemover={receita.itens.length > 1}
                desabilitado={salvando}
                onPrimeiraDose={(resposta) => mudarPrimeiraDose(indice, resposta)}
                onUsarEmTodos={() => item.primeiraDose && usarEmTodos(item.primeiraDose)}
                onRemover={() => void remover(indice)}
              />
            </div>
          ))}
        </div>

        {progresso ? (
          <p className={estilos.progresso} role="status">
            {progresso}
          </p>
        ) : null}
        {erroGeral ? (
          <p className={form.erroGeral} role="alert">
            {erroGeral}
          </p>
        ) : null}

        <PrimaryButton
          type="submit"
          title={progresso ? 'Tentar salvar o resto' : 'Confirmar e salvar receita'}
          loading={salvando}
          className={estilos.confirmar}
        />
        <button
          type="button"
          className={`${botoes.texto} ${botoes.largo}`}
          disabled={salvando}
          onClick={() => navigate(-1)}
        >
          Voltar e enviar outra foto
        </button>
      </form>

      <ImageViewer
        uri={receita.foto}
        visivel={ampliada}
        descricao="Receita"
        onClose={() => setAmpliada(false)}
      />
    </Pagina>
  );
}

function resumoPosologia(c: CamposDoRascunho): string {
  if (c.tipo === 'as_needed') return 'Se necessário';
  if (c.tipo === 'fixed_times') {
    const horas = c.horarios.filter((h) => HORA_VALIDA.test(h));
    return horas.length > 0 ? `Às ${horas.join(', ')}` : 'Horários fixos';
  }
  return c.intervalo === 24 ? '1x ao dia' : `A cada ${c.intervalo}h`;
}

/**
 * O que a resposta da primeira dose faz com os horarios: os campos ja
 * realinhados e uma linha de previa ("Proximas: 14:00 · 22:00").
 */
function previaDaPrimeiraDose(
  campos: CamposDoRascunho,
  resposta: RespostaPrimeiraDose | undefined,
): { campos: CamposDoRascunho; previa: string | null; erro: string | null } {
  if (!resposta || resposta.jaTomou === null || !HORA_VALIDA.test(resposta.hora)) {
    return { campos, previa: null, erro: null };
  }
  const instante = instanteDaPrimeiraDose(resposta);
  if (!instante.ok) return { campos, previa: null, erro: instante.erro };

  const { campos: ajustados } = aplicarPrimeiraDose(campos, instante.quando);
  if (ajustados.tipo === 'fixed_times') {
    return { campos: ajustados, previa: `Horários: ${ajustados.horarios.join(' · ')}`, erro: null };
  }
  const proximas = proximasDosesDoIntervalo(ajustados, instante.quando, resposta.jaTomou);
  const rotulo = resposta.jaTomou ? 'Próximas' : 'Doses';
  return { campos: ajustados, previa: `${rotulo}: ${proximas.map(hora).join(' · ')}`, erro: null };
}

function CartaoDoItem({
  indice,
  campos: camposLidos,
  primeiraDose,
  erroDose,
  podeUsarEmTodos,
  podeRemover,
  desabilitado,
  onPrimeiraDose,
  onUsarEmTodos,
  onRemover,
}: {
  indice: number;
  campos: CamposDoRascunho;
  primeiraDose: RespostaPrimeiraDose | undefined;
  erroDose: string | null;
  podeUsarEmTodos: boolean;
  podeRemover: boolean;
  desabilitado: boolean;
  onPrimeiraDose: (r: RespostaPrimeiraDose) => void;
  onUsarEmTodos: () => void;
  onRemover: () => void;
}) {
  const perguntaDose = camposLidos.tipo !== 'as_needed';
  const { campos, previa, erro } = previaDaPrimeiraDose(camposLidos, primeiraDose);
  const nome = campos.nome.trim();
  const quantidade =
    campos.quantidade.trim().length > 0
      ? `${campos.quantidade.trim()}${campos.forma === 'outro' ? '' : ` ${campos.forma}`}`
      : null;

  return (
    <SurfaceCard className={estilos.item}>
      <h3 className={estilos.itemNome}>
        {nome || 'Remédio sem nome'}
        {campos.concentracao.trim() ? (
          <span className={estilos.itemConc}> {campos.concentracao.trim()}</span>
        ) : null}
      </h3>
      <p className={estilos.itemDetalhe}>
        {resumoPosologia(campos)}
        {quantidade ? ` · ${quantidade} por vez` : ''}
      </p>

      {perguntaDose ? (
        <PrimeiraDose
          valor={primeiraDose}
          onChange={onPrimeiraDose}
          previa={previa}
          erro={erroDose ?? erro}
          desabilitado={desabilitado}
        />
      ) : null}

      {perguntaDose && previa !== null && podeUsarEmTodos ? (
        <button
          type="button"
          className={botoes.texto}
          style={{ paddingLeft: 0 }}
          disabled={desabilitado}
          onClick={onUsarEmTodos}
        >
          <Icone nome="copy" size={15} />
          Usar a mesma resposta nos outros remédios
        </button>
      ) : null}

      <div className={estilos.itemAcoes}>
        {desabilitado ? null : (
          <Link
            to={`/medicamento/form/novo?loteItem=${indice}`}
            className={botoes.contorno}
            style={{ minHeight: 44 }}
            aria-label={`Editar ${nome || 'o remédio'}`}
          >
            <Icone nome="edit-2" size={15} />
            Editar
          </Link>
        )}
        {podeRemover ? (
          <button
            type="button"
            className={botoes.perigo}
            disabled={desabilitado}
            onClick={onRemover}
            aria-label={`Remover ${nome || 'o remédio'}`}
          >
            Remover
          </button>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

/**
 * "A primeira dose ja foi tomada?" — a resposta alinha os horarios do
 * tratamento ao momento real em que ele comeca.
 */
function PrimeiraDose({
  valor,
  onChange,
  previa,
  erro,
  desabilitado,
}: {
  valor: RespostaPrimeiraDose | undefined;
  onChange: (v: RespostaPrimeiraDose) => void;
  previa: string | null;
  erro: string | null;
  desabilitado: boolean;
}) {
  const atual: RespostaPrimeiraDose = valor ?? { jaTomou: null, dia: 'hoje', hora: '' };

  function escolher(jaTomou: boolean) {
    // "Ja tomei amanha" e "vou tomar ontem" nao existem: o dia volta para hoje.
    const dia =
      (jaTomou && atual.dia === 'amanha') || (!jaTomou && atual.dia === 'ontem')
        ? 'hoje'
        : atual.dia;
    onChange({ ...atual, jaTomou, dia });
  }

  function agora() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    onChange({ ...atual, dia: 'hoje', hora: `${hh}:${mm}` });
  }

  const dias: { chave: RespostaPrimeiraDose['dia']; rotulo: string }[] = atual.jaTomou
    ? [
        { chave: 'ontem', rotulo: 'Ontem' },
        { chave: 'hoje', rotulo: 'Hoje' },
      ]
    : [
        { chave: 'hoje', rotulo: 'Hoje' },
        { chave: 'amanha', rotulo: 'Amanhã' },
      ];

  return (
    <div className={estilos.primeiraDose}>
      <p className={form.rotulo}>A primeira dose já foi tomada?</p>
      <Chips rotulo="A primeira dose já foi tomada?">
        <Chip
          rotulo="Já tomei"
          ativo={atual.jaTomou === true}
          disabled={desabilitado}
          onClick={() => escolher(true)}
        />
        <Chip
          rotulo="Ainda não"
          ativo={atual.jaTomou === false}
          disabled={desabilitado}
          onClick={() => escolher(false)}
        />
      </Chips>

      {atual.jaTomou !== null ? (
        <>
          <p className={form.rotulo}>{atual.jaTomou ? 'Quando tomou?' : 'Quando vai tomar?'}</p>
          <Chips rotulo={atual.jaTomou ? 'Dia em que tomou' : 'Dia em que vai tomar'}>
            {dias.map((d) => (
              <Chip
                key={d.chave}
                rotulo={d.rotulo}
                ativo={atual.dia === d.chave}
                disabled={desabilitado}
                onClick={() => onChange({ ...atual, dia: d.chave })}
              />
            ))}
          </Chips>
          <div className={estilos.linhaHora}>
            <FormField
              label={atual.jaTomou ? 'Hora em que tomou' : 'Hora em que vai tomar'}
              type="time"
              value={atual.hora}
              onChangeText={(v) => onChange({ ...atual, hora: v })}
              readOnly={desabilitado}
              className={estilos.hora}
            />
            <button
              type="button"
              className={botoes.contorno}
              style={{ minHeight: 56 }}
              disabled={desabilitado}
              onClick={agora}
              aria-label="Usar a hora de agora"
            >
              Agora
            </button>
          </div>
        </>
      ) : null}

      {erro ? (
        <p className={estilos.erro} role="alert">
          {erro}
        </p>
      ) : previa ? (
        <p className={estilos.previa} role="status">
          {previa}
        </p>
      ) : null}
    </div>
  );
}
