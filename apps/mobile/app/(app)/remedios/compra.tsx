import { Feather } from '@expo/vector-icons';
import { endOfDay, startOfDay } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { healthApi, type Medication } from '@/api/health';
import { FormField } from '@/components/FormField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SelectField } from '@/components/SelectField';
import { SurfaceCard } from '@/components/SurfaceCard';
import { quantidadeDoEstoque, validadeParaISO } from '@/lib/estoque';
import { formatarData, somenteDigitos } from '@/lib/pessoa';
import { tituloDoMedicamento } from '@/lib/posologia';
import { backgrounds, colors, fonts, spacing } from '@/theme';

/** Mesmo nome e mesmo valor das outras telas com barra de abas. */
const ESPACO_BARRA = 96;

/** Teto do servidor (compraDeEstoqueSchema.units). */
const MAXIMO_DE_UNIDADES = 99999;

type Erros = Partial<Record<'remedio' | 'caixas' | 'unidades' | 'expiresOn' | 'place', string>>;

/**
 * Registrar a compra de um remedio — uma entrada de estoque.
 *
 * MORA NA PILHA DE REMEDIOS, com a barra de abas, pelo mesmo motivo do
 * cadastro por foto (remedios/novo.tsx): e um formulario CURTO, de quatro
 * campos, e nao o formulario longo que justificou esconder a barra em
 * medicamento/form.
 *
 * "Caixas x unidades por caixa" e so ajuda de conta: o servidor guarda o
 * TOTAL de unidades. Quem compra 2 caixas de 21 nao precisa fazer 42 de cabeca.
 */
export default function CompraScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [medicamentos, setMedicamentos] = useState<Medication[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);

  const [remedioId, setRemedioId] = useState<string | null>(id ?? null);
  const [caixas, setCaixas] = useState('1');
  const [unidades, setUnidades] = useState('');
  const [validade, setValidade] = useState('');
  const [local, setLocal] = useState('');

  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const escolhido = medicamentos.find((m) => m.id === remedioId) ?? null;

  const carregar = useCallback(async () => {
    setErroDeCarga(null);
    setCarregando(true);
    try {
      const agora = new Date();
      // A janela de doses e obrigatoria na listagem; esta tela nao usa doses.
      const lista = await healthApi.listMedications({
        from: startOfDay(agora),
        to: endOfDay(agora),
        includeInactive: true,
      });
      // So os ativos no seletor — mais o que veio pelo parametro, mesmo
      // encerrado: quem tocou "Registrar compra" no detalhe dele quer aquele.
      setMedicamentos(lista.filter((m) => m.isActive || m.id === id));
    } catch (e) {
      setErroDeCarga(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Ao escolher o remedio, as unidades por caixa vem do cadastro dele.
   *
   * Por EFEITO, e nao no onChange do seletor: o remedio pre-selecionado pelo
   * parametro `id` so ganha o `packageAmount` quando a lista chega.
   */
  useEffect(() => {
    if (escolhido?.packageAmount) setUnidades(String(escolhido.packageAmount));
  }, [escolhido?.id, escolhido?.packageAmount]);

  const nCaixas = Number(somenteDigitos(caixas)) || 0;
  const nUnidades = Number(somenteDigitos(unidades)) || 0;
  const total = nCaixas * nUnidades;

  function validar(): Erros {
    const e: Erros = {};
    if (!escolhido) e.remedio = 'Escolha o remédio.';
    if (nCaixas < 1) e.caixas = 'Pelo menos 1.';
    if (nUnidades < 1) e.unidades = 'Quantas vêm em cada caixa?';
    else if (total > MAXIMO_DE_UNIDADES) e.unidades = 'Quantidade grande demais.';
    if (validade.trim() && !validadeParaISO(validade)) {
      e.expiresOn = 'Data inválida. Use DD/MM/AAAA, de hoje em diante.';
    }
    return e;
  }

  async function salvar() {
    const locais = validar();
    setErros(locais);
    setErroGeral(null);
    if (Object.keys(locais).length > 0 || !remedioId) return;

    setSalvando(true);
    try {
      await healthApi.registrarCompra(remedioId, {
        units: total,
        expiresOn: validade.trim() ? validadeParaISO(validade) : null,
        place: local.trim() || null,
      });
      // A tela de estoque recarrega no foco e reagenda o lembrete de compra la.
      router.back();
    } catch (e) {
      /**
       * Erros por campo do servidor caem nos campos daqui. `units` vira o
       * campo de unidades por caixa — e o que a pessoa ajusta para mudar o
       * total —, e o resto vai como esta.
       */
      if (e instanceof ApiRequestError && e.fields) {
        const { units, expiresOn, place } = e.fields;
        setErros({ unidades: units, expiresOn, place });
      }
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = medicamentos.map((m) => ({
    valor: m.id,
    rotulo: [tituloDoMedicamento(m), m.profileName?.split(' ')[0]].filter(Boolean).join(' · '),
  }));

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
            { paddingTop: insets.top + spacing.md, paddingBottom: ESPACO_BARRA + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            title="Registrar compra"
            onBack={() => router.back()}
          />

          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : erroDeCarga ? (
            <SurfaceCard style={styles.aviso}>
              <Feather name="alert-circle" size={26} color={colors.textError} />
              <Text style={styles.avisoTexto}>{erroDeCarga}</Text>
              <Pressable onPress={() => void carregar()} accessibilityRole="button">
                <Text style={styles.tentarDeNovo}>Tentar de novo</Text>
              </Pressable>
            </SurfaceCard>
          ) : medicamentos.length === 0 ? (
            <SurfaceCard style={styles.aviso}>
              <Feather name="plus-circle" size={26} color={colors.accentGreen} />
              <Text style={styles.avisoTexto}>
                Cadastre um remédio primeiro. Depois volte aqui para registrar a compra.
              </Text>
              <Pressable onPress={() => router.push('/remedios/novo')} accessibilityRole="button">
                <Text style={styles.tentarDeNovo}>Cadastrar remédio</Text>
              </Pressable>
            </SurfaceCard>
          ) : (
            <SurfaceCard style={styles.cartao}>
              <SelectField
                label="Remédio"
                value={remedioId}
                options={opcoes}
                onChange={setRemedioId}
                placeholder="Escolha o remédio"
                tituloDoPainel="Compra de qual remédio?"
                error={erros.remedio}
              />

              <View style={styles.linha}>
                <FormField
                  label="Caixas"
                  value={caixas}
                  onChangeText={(t) => setCaixas(somenteDigitos(t).slice(0, 2))}
                  keyboardType="number-pad"
                  error={erros.caixas}
                  containerStyle={styles.estreito}
                  accessibilityLabel="Quantidade de caixas"
                />
                <FormField
                  label="Unidades por caixa"
                  value={unidades}
                  onChangeText={(t) => setUnidades(somenteDigitos(t).slice(0, 5))}
                  keyboardType="number-pad"
                  placeholder="Ex.: 30"
                  error={erros.unidades}
                  containerStyle={styles.largo}
                />
              </View>

              {total > 0 ? (
                <Text style={styles.total} accessibilityLiveRegion="polite">
                  Total: {quantidadeDoEstoque(total, escolhido?.form)}
                </Text>
              ) : null}

              <FormField
                label="Validade (opcional)"
                value={validade}
                onChangeText={(t) => setValidade(formatarData(t))}
                keyboardType="number-pad"
                placeholder="DD/MM/AAAA"
                maxLength={10}
                error={erros.expiresOn}
                hint="Está impressa na caixa. Avisamos quando faltar 30 dias."
              />

              <FormField
                label="Farmácia / cidade (opcional)"
                value={local}
                onChangeText={setLocal}
                placeholder="Ex.: Farmácia Vida · São Paulo, SP"
                maxLength={120}
                error={erros.place}
              />

              {erroGeral ? (
                <Text style={styles.erroGeral} accessibilityLiveRegion="polite">
                  {erroGeral}
                </Text>
              ) : null}

              <PrimaryButton title="Salvar compra" onPress={() => void salvar()} loading={salvando} />
            </SurfaceCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl },
  cartao: { marginTop: spacing.xl, padding: spacing.lg },
  linha: { flexDirection: 'row', gap: spacing.md },
  estreito: { flex: 1 },
  largo: { flex: 2 },
  total: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.accentGreen,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  aviso: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  tentarDeNovo: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accentGreen,
    marginTop: spacing.md,
  },
});
