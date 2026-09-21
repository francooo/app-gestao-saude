import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

type Props = {
  /** Marcada como tomada. */
  checked: boolean;
  /** 'se necessario': acao repetivel, nunca fica marcada. */
  repetivel?: boolean;
  disabled?: boolean;
  enviando?: boolean;
  /** Para o leitor de tela: "Dose de Amoxicilina 500mg das 14:00". */
  label: string;
  onPress: () => void;
  size?: number;
};

/**
 * O circulo de marcar a dose como tomada.
 *
 * Fica num componente proprio porque a tela de detalhe reusa, e porque os
 * cuidados dele nao sao obvios:
 *
 *  - O papel de acessibilidade e `checkbox`, nao `button` — exceto no
 *    'se necessario', que e acao repetivel e nao tem estado marcado.
 *  - O alvo de toque e de 48dp mesmo com o circulo menor, via hitSlop. Ele
 *    vive DENTRO de um Pressable (o card abre o detalhe), entao precisa ganhar
 *    o toque sem herdar o do pai.
 *  - O estado nunca e so cor: o check e a linha "Tomado hoje as 08:00" no card
 *    dizem a mesma coisa.
 */
export function DoseButton({
  checked,
  repetivel = false,
  disabled = false,
  enviando = false,
  label,
  onPress,
  size = 34,
}: Props) {
  const inerte = disabled || enviando;

  return (
    <Pressable
      onPress={onPress}
      disabled={inerte}
      // Completa o alvo ate 48dp sem inchar o desenho.
      hitSlop={Math.max(0, (48 - size) / 2)}
      accessibilityRole={repetivel ? 'button' : 'checkbox'}
      accessibilityState={repetivel ? { disabled: inerte } : { checked, disabled: inerte }}
      accessibilityLabel={label}
      accessibilityHint={
        repetivel
          ? 'Toque duas vezes para registrar uma dose agora'
          : checked
            ? 'Toque duas vezes para desfazer'
            : 'Toque duas vezes para marcar como tomada'
      }
      style={({ pressed }) => [pressed && !inerte && styles.pressionado]}
    >
      <View
        style={[
          styles.circulo,
          { width: size, height: size, borderRadius: size / 2 },
          checked ? styles.cheio : styles.vazio,
          disabled && styles.apagado,
        ]}
      >
        {enviando ? (
          <ActivityIndicator size="small" color={checked ? colors.onAccent : colors.doseRing} />
        ) : checked ? (
          <Feather name="check" size={size * 0.55} color={colors.onAccent} />
        ) : repetivel ? (
          <Feather name="plus" size={size * 0.55} color={colors.doseRing} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circulo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vazio: {
    borderWidth: 2,
    borderColor: colors.doseRing,
    backgroundColor: 'transparent',
  },
  cheio: {
    backgroundColor: colors.doseTaken,
  },
  apagado: {
    opacity: 0.35,
  },
  pressionado: {
    opacity: 0.6,
  },
});
