import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import {
  healthApi,
  type MedicationInput,
  type Professional,
  type Profile,
} from '@/api/health';
import { FormField } from '@/components/FormField';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { dataParaISO, formatarData, isoParaData } from '@/lib/pessoa';
import {
  type CamposDoRascunho,
  descartarReceita,
  guardarReceita,
  lerReceita,
  marcarCadastroConcluido,
  type RascunhoDeReceita,
  removerItemDoLote,
} from '@/lib/rascunhoDeMedicamento';
import { sincronizarLembretesDeUmMedicamento } from '@/lib/reminders';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/**
 * Revisao do cadastro em LOTE de uma receita lida por foto.
 *
 * A IA NUNCA SALVA SOZINHA: esta tela mostra TODOS os remedios de uma vez e so
 * grava quando a pessoa toca "Confirmar e salvar". Um membro vale para a receita
 * inteira; o medico e a data da consulta sao resolvidos uma vez aqui. Confirmar
 * cria, num laco no cliente, o medico (se novo), a consulta (realizada) e cada
 * remedio — tudo por rotas que ja existem, sem funcao nova nem migracao.
 *
 * Falha parcial nao perde trabalho: os remedios que nao entraram ficam no
 * rascunho para uma nova tentativa, e o medico/consulta ja criados nao se
 * repetem (ver os refs e o que e reescrito no rascunho).
 */

type EscolhaMedico =
  | { modo: 'novo' }
  | { modo: 'existente'; id: string }
  | { modo: 'nenhum' };

function medicoInicial(r: RascunhoDeReceita): EscolhaMedico {
  if (r.prescritorId) return { modo: 'existente', id: r.prescritorId };
  if (r.prescriberName) return { modo: 'novo' };
  return { modo: 'nenhum' };
}

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function RevisarReceitaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [receita, setReceita] = useState<RascunhoDeReceita | null>(() => {
    const r = lerReceita();
    return r ? { ...r, itens: [...r.itens] } : null;
  });
  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [medicos, setMedicos] = useState<Professional[]>([]);

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [medico, setMedico] = useState<EscolhaMedico>(() => {
    const r = lerReceita();
    return r ? medicoInicial(r) : { modo: 'nenhum' };
  });
  const [especialidade, setEspecialidade] = useState(() => lerReceita()?.specialtyRead ?? '');
  const [dataConsulta, setDataConsulta] = useState(() => isoParaData(lerReceita()?.consultationDate));
  const [guardarFoto, setGuardarFoto] = useState(false);
  const [ampliada, setAmpliada] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const [erroData, setErroData] = useState<string | null>(null);

  /**
   * O que ja foi resolvido, para uma SEGUNDA tentativa nao duplicar.
   *
   * Dentro desta tela, tocar "Confirmar" de novo depois de uma falha parcial
   * reaproveita o medico ja criado e a consulta ja registrada. Fora dela (uma
   * remontagem), o rascunho reescrito faz o mesmo papel: prescritorId gravado e
   * consultationDate zerada depois de criadas.
   */
  const medicoResolvido = useRef<string | null | undefined>(undefined);
  const consultaFeita = useRef(false);

  // Rascunho vencido ou ausente: nao da para revisar o que sumiu.
  useEffect(() => {
    if (!receita) router.back();
  }, [receita, router]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [listaPerfis, listaMedicos] = await Promise.all([
          healthApi.listProfiles(),
          healthApi.listProfessionals(),
        ]);
        if (cancelado) return;
        setPerfis(listaPerfis);
        setMedicos(listaMedicos);
        // Titular como padrao, como no formulario: e quem mais cadastra.
        setPerfilId(
          listaPerfis.find((p) => p.isAccountHolder)?.id ?? listaPerfis[0]?.id ?? null,
        );
      } catch (e) {
        if (!cancelado) {
          setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  /**
   * Reaplica o rascunho a cada foco — e com COPIA NOVA.
   *
   * Editar um item navega ao form e volta; atualizarItemDoLote muta o rascunho
   * no lugar, mantendo a mesma referencia, e um setReceita com a mesma
   * referencia nao re-renderiza. A copia rasa forca o React a redesenhar o card
   * editado. Os outros campos (membro, medico, especialidade, data) sao estado
   * proprio e NAO sao reaplicados: a escolha da pessoa sobrevive ao vaivem.
   */
  useFocusEffect(
    useCallback(() => {
      const r = lerReceita();
      setReceita(r ? { ...r, itens: [...r.itens] } : null);
    }, []),
  );

  function remover(indice: number) {
    if (!receita || receita.itens.length <= 1) return;
    const nome = receita.itens[indice]?.campos.nome || 'este remédio';
    Alert.alert('Remover da receita', `Tirar ${nome} desta receita?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          removerItemDoLote(indice);
          const r = lerReceita();
          setReceita(r ? { ...r, itens: [...r.itens] } : null);
        },
      },
    ]);
  }

  function paraInput(
    campos: CamposDoRascunho,
    readItem: number,
    prescriberId: string | null,
  ): MedicationInput {
    const q = Number(campos.quantidade.replace(',', '.'));
    const emb = Number(campos.embalagem.replace(',', '.'));
    return {
      profileId: perfilId!,
      name: campos.nome.trim(),
      strength: campos.concentracao.trim() || null,
      form: campos.forma,
      doseAmount: Number.isFinite(q) && q > 0 ? q : null,
      doseUnit: campos.forma === 'outro' ? null : campos.forma,
      packageAmount: Number.isFinite(emb) && emb > 0 ? Math.round(emb) : null,
      endsAt: campos.fimDoTratamento,
      scheduleType: campos.tipo,
      intervalHours: campos.tipo === 'interval' ? campos.intervalo : null,
      times: campos.tipo === 'fixed_times' ? campos.horarios.filter((h) => HORA_VALIDA.test(h)) : [],
      instructions: campos.instrucoes.trim() || null,
      prescriberId,
      photoReadId: receita!.readId,
      photoReadItem: readItem,
    };
  }

  async function salvar() {
    if (!receita || salvando) return;
    setErroGeral(null);
    setProgresso(null);

    if (!perfilId) {
      setErroPerfil('Escolha para quem é esta receita');
      return;
    }
    setErroPerfil(null);

    // Data em branco = sem consulta. Preenchida e invalida = erro, nao silencio:
    // a pessoa quis registrar a consulta e merece saber que a data nao colou.
    const temData = dataConsulta.trim().length > 0;
    const isoData = temData ? dataParaISO(dataConsulta) : null;
    if (temData && !isoData) {
      setErroData('Confira a data: use dia/mês/ano, como 23/06/2026');
      return;
    }
    setErroData(null);

    // Nome e o unico campo sem o qual o servidor recusa. Aponta para a edicao
    // em vez de deixar o item cair calado na lista de "faltaram".
    const semNome = receita.itens.findIndex((it) => it.campos.nome.trim().length < 2);
    if (semNome >= 0) {
      setErroGeral('Um dos remédios está sem nome. Toque em "Editar" para completar.');
      return;
    }

    setSalvando(true);
    try {
      // 0. O medico, ANTES de tudo: se criar falhar, nada mais foi criado.
      let prescriberId: string | null;
      if (medicoResolvido.current !== undefined) {
        prescriberId = medicoResolvido.current;
      } else if (medico.modo === 'existente') {
        prescriberId = medico.id;
      } else if (medico.modo === 'novo' && receita.prescriberName) {
        const prof = await healthApi.createProfessional({
          name: receita.prescriberName.trim(),
          specialty: especialidade.trim() || null,
        });
        prescriberId = prof.id;
      } else {
        prescriberId = null;
      }
      medicoResolvido.current = prescriberId;

      // 0b. A consulta (realizada), best-effort: ela nao deve travar os remedios.
      if (!consultaFeita.current && isoData) {
        try {
          const [a, m, d] = isoData.split('-').map(Number);
          await healthApi.createAppointment({
            profileId: perfilId,
            professionalId: prescriberId,
            // Meio-dia local evita troca de dia por fuso; a receita nao traz hora.
            scheduledAt: new Date(a!, m! - 1, d!, 12, 0, 0).toISOString(),
            modality: 'presencial',
            status: 'realizada',
            title: especialidade.trim() || 'Consulta',
          });
          consultaFeita.current = true;
        } catch {
          // silencio: a consulta e secundaria; os remedios continuam.
        }
      }

      // Os remedios, um a um. Os que falham ficam para uma nova tentativa.
      const total = receita.itens.length;
      const restantes: RascunhoDeReceita['itens'] = [];
      let salvos = 0;
      for (const item of receita.itens) {
        try {
          const criado = await healthApi.createMedication(
            paraInput(item.campos, item.readItem, prescriberId),
          );
          if (guardarFoto && receita.foto) {
            // Best-effort, como no form: o remedio ja existe, a foto e extra.
            try {
              await healthApi.updateMedication(criado.id, { prescriptionPhoto: receita.foto });
            } catch {
              /* a foto pode ser anexada depois, na tela do remedio. */
            }
          }
          try {
            await sincronizarLembretesDeUmMedicamento(criado);
          } catch {
            /* a reconciliacao da lista conserta na proxima abertura. */
          }
          salvos += 1;
        } catch {
          restantes.push(item);
        }
      }

      if (restantes.length === 0) {
        descartarReceita();
        // A tela de leitura ficou na pilha; ela se dispensa e o voltar cai na
        // origem — ver rascunhoDeMedicamento.ts.
        marcarCadastroConcluido();
        router.back();
        return;
      }

      // Falha parcial: guarda so o que faltou, ja com o medico resolvido e a
      // consulta zerada, para a nova tentativa nao duplicar nenhum dos dois.
      guardarReceita({
        ...receita,
        itens: restantes,
        prescritorId: prescriberId,
        consultationDate: consultaFeita.current ? null : receita.consultationDate,
      });
      setReceita({ ...receita, itens: restantes });
      setProgresso(`Salvei ${salvos} de ${total}. Toque para tentar o resto.`);
    } catch (e) {
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  if (!receita) {
    return (
      <View style={styles.tela}>
        <ScreenBackground colors={backgrounds.medications} />
      </View>
    );
  }

  const medicoNovoDisponivel = Boolean(receita.prescriberName);

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.conteudo,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl * 2 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="Revise a receita" titleLines={2} onBack={() => router.back()} />

          <SurfaceCard style={styles.bloco}>
            <Text style={styles.blocoTitulo}>Para quem é esta receita</Text>
            <View style={styles.seletor}>
              <ProfileSelector
                profiles={perfis.map((p) => ({
                  id: p.id,
                  fullName: p.fullName,
                  avatarColor: p.avatarColor,
                  relationship: p.relationship,
                }))}
                selectedId={perfilId}
                onSelect={(id) => {
                  setErroPerfil(null);
                  setPerfilId(id);
                }}
                tituloDoPainel="Para quem é esta receita"
                permitirTodos={false}
              />
            </View>
            {erroPerfil ? <Text style={styles.erroCampo}>{erroPerfil}</Text> : null}
            <Text style={styles.blocoAjuda}>
              Todos os remédios desta receita vão para a mesma pessoa.
            </Text>
          </SurfaceCard>

          <SurfaceCard style={styles.bloco}>
            <Text style={styles.blocoTitulo}>Dados da receita</Text>

            <Text style={styles.rotulo}>Médico</Text>
            <View style={styles.chips}>
              {medicoNovoDisponivel ? (
                <ChipMedico
                  rotulo={receita.prescriberName!}
                  marca="Novo"
                  ativo={medico.modo === 'novo'}
                  desabilitado={salvando}
                  onPress={() => setMedico({ modo: 'novo' })}
                />
              ) : null}
              {medicos.map((md) => (
                <ChipMedico
                  key={md.id}
                  rotulo={md.name}
                  ativo={medico.modo === 'existente' && medico.id === md.id}
                  desabilitado={salvando}
                  onPress={() => setMedico({ modo: 'existente', id: md.id })}
                />
              ))}
              <ChipMedico
                rotulo="Nenhum"
                ativo={medico.modo === 'nenhum'}
                desabilitado={salvando}
                onPress={() => setMedico({ modo: 'nenhum' })}
              />
            </View>
            {medico.modo === 'novo' ? (
              <Text style={styles.blocoAjuda}>
                Este médico ainda não está cadastrado. Vou criá-lo com o nome e a especialidade
                abaixo, e vincular os remédios a ele.
              </Text>
            ) : null}

            <FormField
              label="Especialidade"
              value={especialidade}
              onChangeText={setEspecialidade}
              placeholder="Pediatria"
              hint="Entra na ficha do médico e no registro da consulta."
              editable={!salvando}
            />

            <FormField
              label="Data da consulta"
              value={dataConsulta}
              onChangeText={(v) => {
                setErroData(null);
                setDataConsulta(formatarData(v));
              }}
              placeholder="23/06/2026"
              keyboardType="number-pad"
              maxLength={10}
              hint="A consulta fica registrada como realizada. Deixe em branco se não souber."
              error={erroData ?? undefined}
              editable={!salvando}
            />
          </SurfaceCard>

          {receita.foto ? (
            <SurfaceCard style={styles.bloco}>
              <Pressable
                onPress={() => setAmpliada(true)}
                disabled={salvando}
                accessibilityRole="imagebutton"
                accessibilityLabel="Foto da receita"
                accessibilityHint="Toque duas vezes para ver em tela cheia"
              >
                <Image
                  source={{ uri: receita.foto }}
                  contentFit="cover"
                  transition={120}
                  style={styles.miniatura}
                />
                <View style={styles.lupa}>
                  <Feather name="maximize-2" size={15} color={colors.onAccent} />
                </View>
              </Pressable>

              {/*
                DESLIGADO por padrao, pelo mesmo motivo do fluxo de um remedio: a
                receita traz paciente, CRM e as vezes o diagnostico, entao ela so
                e guardada se a pessoa pedir. Aqui ela pede uma vez, para todos.
              */}
              <Pressable
                onPress={() => setGuardarFoto((v) => !v)}
                disabled={salvando}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: guardarFoto }}
                accessibilityLabel="Guardar a foto da receita nestes remédios"
                style={({ pressed }) => [styles.guardar, pressed && styles.pressionado]}
              >
                <Feather
                  name={guardarFoto ? 'check-square' : 'square'}
                  size={20}
                  color={guardarFoto ? colors.accentGreen : colors.textSecondary}
                />
                <View style={styles.flex}>
                  <Text style={styles.guardarTitulo}>
                    Guardar a foto da receita nestes remédios
                  </Text>
                  <Text style={styles.guardarAjuda}>
                    Ela fica na tela de cada remédio, para você ter em mãos na farmácia.
                  </Text>
                </View>
              </Pressable>
            </SurfaceCard>
          ) : null}

          <Text style={styles.listaTitulo}>
            {receita.itens.length === 1
              ? '1 remédio nesta receita'
              : `${receita.itens.length} remédios nesta receita`}
          </Text>

          {receita.itens.map((item, indice) => (
            <CartaoDoItem
              key={`${item.readItem}-${indice}`}
              campos={item.campos}
              podeRemover={receita.itens.length > 1}
              desabilitado={salvando}
              onEditar={() => router.push(`/medicamento/form/novo?loteItem=${indice}`)}
              onRemover={() => remover(indice)}
            />
          ))}

          {progresso ? <Text style={styles.progresso}>{progresso}</Text> : null}
          {erroGeral ? <Text style={styles.erroGeral}>{erroGeral}</Text> : null}

          <PrimaryButton
            title={progresso ? 'Tentar salvar o resto' : 'Confirmar e salvar receita'}
            onPress={() => void salvar()}
            loading={salvando}
            style={styles.confirmar}
          />

          <Pressable
            onPress={() => router.back()}
            disabled={salvando}
            accessibilityRole="button"
            style={({ pressed }) => [styles.voltar, pressed && styles.pressionado]}
          >
            <Text style={styles.voltarTexto}>Voltar e tirar outra foto</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ImageViewerModal
        uri={receita.foto || null}
        visivel={ampliada}
        descricao="Receita"
        onClose={() => setAmpliada(false)}
      />
    </View>
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

function CartaoDoItem({
  campos,
  podeRemover,
  desabilitado,
  onEditar,
  onRemover,
}: {
  campos: CamposDoRascunho;
  podeRemover: boolean;
  desabilitado: boolean;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const quantidade =
    campos.quantidade.trim().length > 0
      ? `${campos.quantidade.trim()}${campos.forma === 'outro' ? '' : ` ${campos.forma}`}`
      : null;

  return (
    <SurfaceCard style={styles.item}>
      <View style={styles.itemLinha}>
        <View style={styles.flex}>
          <Text style={styles.itemNome} numberOfLines={2}>
            {campos.nome.trim() || 'Remédio sem nome'}
            {campos.concentracao.trim() ? (
              <Text style={styles.itemConc}>{`  ${campos.concentracao.trim()}`}</Text>
            ) : null}
          </Text>
          <Text style={styles.itemDetalhe}>
            {resumoPosologia(campos)}
            {quantidade ? ` · ${quantidade} por vez` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.itemAcoes}>
        <Pressable
          onPress={onEditar}
          disabled={desabilitado}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${campos.nome.trim() || 'o remédio'}`}
          style={({ pressed }) => [styles.editar, (pressed || desabilitado) && styles.pressionado]}
        >
          <Feather name="edit-2" size={15} color={colors.accentGreen} />
          <Text style={styles.editarTexto}>Editar</Text>
        </Pressable>

        {podeRemover ? (
          <Pressable
            onPress={onRemover}
            disabled={desabilitado}
            accessibilityRole="button"
            accessibilityLabel={`Remover ${campos.nome.trim() || 'o remédio'}`}
            style={({ pressed }) => [styles.removerItem, (pressed || desabilitado) && styles.pressionado]}
          >
            <Text style={styles.removerItemTexto}>Remover</Text>
          </Pressable>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

function ChipMedico({
  rotulo,
  marca,
  ativo,
  desabilitado,
  onPress,
}: {
  rotulo: string;
  marca?: string;
  ativo: boolean;
  desabilitado?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo, disabled: desabilitado }}
      style={[styles.chip, ativo && styles.chipAtivo, desabilitado && !ativo && styles.chipApagado]}
    >
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>
        {rotulo}
      </Text>
      {marca ? (
        <View style={[styles.chipMarca, ativo && styles.chipMarcaAtiva]}>
          <Text style={[styles.chipMarcaTexto, ativo && styles.chipMarcaTextoAtivo]}>{marca}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },

  bloco: { marginTop: spacing.xl, padding: spacing.lg },
  blocoTitulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  blocoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  seletor: { marginTop: spacing.md },

  rotulo: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.chipMore,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  chipAtivo: { backgroundColor: colors.chipActive },
  chipApagado: { opacity: 0.5 },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sectionTitle },
  chipTextoAtivo: { color: colors.onAccent },
  chipMarca: {
    backgroundColor: colors.accentGreenSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipMarcaAtiva: { backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  chipMarcaTexto: { fontFamily: fonts.bold, fontSize: 11, color: colors.accentGreen },
  chipMarcaTextoAtivo: { color: colors.onAccent },

  miniatura: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.card - 12,
    backgroundColor: colors.pillTablet,
  },
  lupa: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  guardar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: 56,
    marginTop: spacing.lg,
  },
  guardarTitulo: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  guardarAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 2,
  },

  listaTitulo: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  item: { marginTop: spacing.md, padding: spacing.lg },
  itemLinha: { flexDirection: 'row', alignItems: 'flex-start' },
  itemNome: { fontFamily: fonts.bold, fontSize: 16, color: colors.sectionTitle, lineHeight: 22 },
  itemConc: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSecondary },
  itemDetalhe: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  itemAcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  editar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  editarTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentGreen },
  removerItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  removerItemTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textError },

  progresso: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.sectionTitle,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  erroCampo: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textError,
    marginTop: spacing.sm,
  },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  confirmar: { marginTop: spacing.xl },
  voltar: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.xs },
  voltarTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  pressionado: { opacity: 0.85 },
});
