import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FormField } from '@/components/FormField';
import { buscarCep, formatarCep, montarEndereco, somenteDigitos } from '@/lib/cep';
import { colors, fonts, radii, spacing } from '@/theme';

export type ReferenceLocation = {
  label: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  location: ReferenceLocation | null;
  /** Fixa um endereco como referencia. */
  onSetAddress: (address: string) => Promise<void>;
  /** Volta a usar a posicao atual do aparelho. */
  onUseCurrent: () => Promise<void>;
  saving?: boolean;
};

/**
 * Ponto a partir do qual as distancias ate os consultorios sao medidas.
 *
 * No mockup isto era "buscar medicos perto daqui", de um catalogo publico.
 * Como os medicos sao os seus, o util e o inverso: saber que o pediatra fica
 * a 3 km DE CASA vale mais do que a 3 km de onde voce estava por acaso.
 */
export function LocationBar({ location, onSetAddress, onUseCurrent, saving }: Props) {
  const [aberto, setAberto] = useState(false);
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const rotulo = location?.label ?? 'Definir ponto de referência';
  const temReferencia = Boolean(location?.latitude);

  async function consultarCep(valor: string) {
    setCep(formatarCep(valor));
    setErro(undefined);
    if (somenteDigitos(valor).length !== 8) return;

    setBuscando(true);
    const r = await buscarCep(valor);
    setBuscando(false);

    if (r.ok) {
      setEndereco(
        montarEndereco({
          logradouro: r.endereco.logradouro,
          bairro: r.endereco.bairro,
          cidade: r.endereco.cidade,
          uf: r.endereco.uf,
          cep: r.endereco.cep,
        }),
      );
      return;
    }
    setErro(
      r.motivo === 'nao_encontrado'
        ? 'CEP não encontrado. Digite o endereço à mão.'
        : 'Não consegui consultar o CEP. Digite o endereço à mão.',
    );
  }

  async function confirmar() {
    if (endereco.trim().length < 5) {
      setErro('Informe um endereço');
      return;
    }
    try {
      await onSetAddress(endereco.trim());
      setAberto(false);
      setCep('');
      setEndereco('');
    } catch {
      setErro('Não consegui localizar esse endereço. Tente com mais detalhes.');
    }
  }

  return (
    <>
      <View style={styles.barra}>
        <Feather
          name="map-pin"
          size={20}
          color={temReferencia ? colors.accentGreen : colors.textPlaceholder}
        />
        <Text style={[styles.rotulo, !temReferencia && styles.rotuloVazio]} numberOfLines={1}>
          {rotulo}
        </Text>

        <View style={styles.divisor} />

        <Pressable
          onPress={() => setAberto(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Alterar ponto de referência"
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.accentGreen} />
          ) : (
            <Text style={styles.alterar}>Alterar</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={aberto}
        transparent
        animationType="fade"
        onRequestClose={() => setAberto(false)}
      >
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <Pressable style={styles.painel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.painelTitulo}>Medir distâncias a partir de</Text>
            <Text style={styles.painelAjuda}>
              As distâncias até os consultórios passam a ser calculadas deste ponto.
            </Text>

            <Pressable
              onPress={async () => {
                await onUseCurrent();
                setAberto(false);
              }}
              style={styles.opcaoAtual}
              accessibilityRole="button"
            >
              <Feather name="crosshair" size={18} color={colors.accentGreen} />
              <Text style={styles.opcaoAtualTexto}>Usar minha localização atual</Text>
            </Pressable>

            <View style={styles.ou}>
              <View style={styles.ouLinha} />
              <Text style={styles.ouTexto}>ou fixe um endereço</Text>
              <View style={styles.ouLinha} />
            </View>

            <FormField
              label="CEP"
              value={cep}
              onChangeText={consultarCep}
              placeholder="01310-200"
              keyboardType="number-pad"
              maxLength={9}
              loading={buscando}
            />
            <FormField
              label="Endereço"
              value={endereco}
              onChangeText={setEndereco}
              placeholder="Rua, número, cidade"
              error={erro}
              containerStyle={styles.ultimoCampo}
            />

            <View style={styles.botoes}>
              <Pressable onPress={() => setAberto(false)} style={styles.cancelar}>
                <Text style={styles.cancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={confirmar} disabled={saving} style={styles.confirmar}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Text style={styles.confirmarTexto}>Usar este endereço</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  rotulo: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sectionTitle,
  },
  rotuloVazio: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  divisor: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.textPlaceholder,
    opacity: 0.5,
  },
  alterar: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.accentGreen,
  },
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(30, 38, 22, 0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  painel: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
  },
  painelTitulo: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.sectionTitle,
  },
  painelAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  opcaoAtual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  opcaoAtualTexto: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.sectionTitle,
  },
  ou: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xl,
  },
  ouLinha: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.textPlaceholder,
    opacity: 0.5,
  },
  ouTexto: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  ultimoCampo: { marginBottom: 0 },
  botoes: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  cancelar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  cancelarTexto: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  confirmar: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
  },
  confirmarTexto: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.onAccent,
  },
});
