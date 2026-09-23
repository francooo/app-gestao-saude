import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts, radii, sizes, spacing } from '@/theme';

type Opcao = { valor: string; rotulo: string };

type Props = {
  label: string;
  /** Nulo mostra o placeholder. */
  value: string | null;
  options: Opcao[];
  onChange: (valor: string | null) => void;
  placeholder: string;
  /** Titulo do painel. Obrigatorio: um padrao generico vazaria entre telas. */
  tituloDoPainel: string;
  error?: string;
  disabled?: boolean;
  containerStyle?: ViewStyle;
};

/**
 * Lista suspensa, no formato do mockup: rotulo em cima, campo com chevron, e
 * um painel modal ao tocar.
 *
 * Nao existe Picker nem Select no aplicativo, e o unico Modal e o do
 * ProfileSelector — este clona aquele padrao (fundo escuro que fecha ao
 * toque, painel creme, check a direita da opcao ativa) numa versao generica,
 * sem avatar.
 *
 * O visual do campo acompanha o FormField de proposito: lado a lado com um
 * FormField na mesma linha, qualquer diferenca de altura ou de borda salta.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  tituloDoPainel,
  error,
  disabled = false,
  containerStyle,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const escolhida = options.find((o) => o.valor === value) ?? null;

  function escolher(valor: string) {
    // Tocar na opcao ja escolhida limpa o campo: sem isso, quem seleciona por
    // engano num campo opcional nao teria como voltar atras.
    onChange(valor === value ? null : valor);
    setAberto(false);
  }

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => setAberto(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${escolhida?.rotulo ?? placeholder}`}
        accessibilityHint="Abre a lista de opções"
        style={[styles.campo, error && styles.campoErro, disabled && styles.campoApagado]}
      >
        <Text style={escolhida ? styles.valor : styles.placeholder} numberOfLines={1}>
          {escolhida?.rotulo ?? placeholder}
        </Text>
        <Feather name="chevron-down" size={20} color={colors.textSecondary} />
      </Pressable>

      {error ? (
        <Text style={styles.erro} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Modal
        visible={aberto}
        transparent
        animationType="fade"
        onRequestClose={() => setAberto(false)}
      >
        {/* Toque fora fecha: no Android o botao fisico ja faz isso, mas no
            iOS sem esta area nao haveria saida. */}
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <Pressable style={styles.painel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.painelTitulo}>{tituloDoPainel}</Text>

            <ScrollView bounces={false}>
              {options.map((o) => {
                const ativo = o.valor === value;
                return (
                  <Pressable
                    key={o.valor}
                    onPress={() => escolher(o.valor)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ativo }}
                    style={[styles.opcao, ativo && styles.opcaoAtiva]}
                  >
                    <Text style={[styles.opcaoTexto, ativo && styles.opcaoTextoAtivo]}>
                      {o.rotulo}
                    </Text>
                    {ativo ? (
                      <Feather name="check" size={20} color={colors.accentGreen} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  // Rotulo e campo copiam o FormField VALOR A VALOR. Lado a lado na mesma
  // linha, qualquer diferenca de altura, raio ou borda salta aos olhos.
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.sectionTitle,
    marginBottom: spacing.sm,
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: sizes.inputHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card - 10,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
    backgroundColor: colors.onAccent,
  },
  campoErro: { borderColor: colors.inputBorderError },
  campoApagado: { opacity: 0.6 },
  valor: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.textPrimary },
  placeholder: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.textPlaceholder },
  erro: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textError,
    marginTop: spacing.xs,
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
    padding: spacing.lg,
    maxHeight: '70%',
  },
  painelTitulo: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.card - 8,
  },
  opcaoAtiva: { backgroundColor: colors.surfaceWarm },
  opcaoTexto: { fontFamily: fonts.regular, fontSize: 16, color: colors.textPrimary },
  opcaoTextoAtivo: { fontFamily: fonts.semibold, color: colors.sectionTitle },
});
