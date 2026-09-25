import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

type Props = {
  /** Marcador de 44 px a esquerda: um <IconTile size={44}/> ou um <Avatar size={44}/>. */
  marcador: ReactNode;
  rotulo: string;
  /** Segunda linha. Ver a nota sobre altura reservada, abaixo. */
  valor?: string;
  /** 'navegar' poe a seta; 'interruptor' poe o Switch; 'nada' e so leitura. */
  acessorio?: 'navegar' | 'interruptor' | 'nada';
  onPress?: () => void;
  ligado?: boolean;
  onChange?: (valor: boolean) => void;
  desabilitado?: boolean;
  /** Substitui o `valor` e e lido pelo leitor de tela quando desabilitado. */
  motivoDesabilitado?: string;
  /**
   * Reserva a altura da segunda linha mesmo sem valor.
   *
   * Use quando o valor AINDA vai chegar (uma contagem, o e-mail). Sem isso a
   * linha cresce quando o dado carrega, e tres linhas crescendo em momentos
   * diferentes fazem o cartao dancar debaixo do dedo. Quando o valor nunca vai
   * existir — especialidade nula, parentesco em branco — deixe falso.
   */
  reservarValor?: boolean;
};

/**
 * Uma linha de ajuste: marcador, rotulo, segunda linha e um acessorio.
 *
 * Nasceu de repeticao real: sao dez destas em tres telas, com tres acessorios
 * diferentes. O gabarito mais proximo que existia, a funcao `Info` da tela de
 * detalhe do medicamento, e local aquela tela e nao tem seta, interruptor nem
 * estado desabilitado.
 */
export function SettingsRow({
  marcador,
  rotulo,
  valor,
  acessorio = 'navegar',
  onPress,
  ligado = false,
  onChange,
  desabilitado = false,
  motivoDesabilitado,
  reservarValor = false,
}: Props) {
  const interruptor = acessorio === 'interruptor';
  const segundaLinha = desabilitado && motivoDesabilitado ? motivoDesabilitado : valor;

  /**
   * Num interruptor, quem recebe o toque e a LINHA, nao o Switch.
   *
   * O Switch nativo tem ~31 px de altura, abaixo do alvo minimo de 44, e um
   * rotulo intocavel ao lado de um alvo pequeno castiga quem tem dificuldade
   * motora fina. Com o `pointerEvents="none"` no Switch, a linha inteira vira
   * o alvo — e continua sendo UM unico no para o leitor de tela.
   */
  const aoTocar = interruptor ? () => onChange?.(!ligado) : onPress;

  return (
    <Pressable
      onPress={desabilitado ? undefined : aoTocar}
      disabled={desabilitado || (!interruptor && !onPress)}
      accessible
      accessibilityRole={interruptor ? 'switch' : acessorio === 'nada' ? 'text' : 'button'}
      // A virgula troca o ponto medio: os leitores de tela leem "·" como
      // "ponto", e a linha inteira vira uma frase esquisita.
      accessibilityLabel={segundaLinha ? `${rotulo}, ${segundaLinha}` : rotulo}
      accessibilityState={{ disabled: desabilitado, ...(interruptor ? { checked: ligado } : {}) }}
      style={({ pressed }) => [styles.linha, pressed && !desabilitado && styles.pressionada]}
    >
      <View style={desabilitado ? styles.apagado : undefined}>{marcador}</View>

      <View style={[styles.textos, desabilitado && styles.apagado]}>
        <Text style={styles.rotulo}>{rotulo}</Text>
        {segundaLinha || reservarValor ? (
          <Text style={styles.valor} numberOfLines={2}>
            {segundaLinha ?? ' '}
          </Text>
        ) : null}
      </View>

      {acessorio === 'navegar' ? (
        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
      ) : null}

      {interruptor ? (
        <View pointerEvents="none">
          <Switch
            value={ligado}
            disabled={desabilitado}
            trackColor={{ true: colors.switchOn, false: colors.starEmpty }}
            thumbColor={colors.surface}
            // Sem isto o trilho desligado some no Android.
            ios_backgroundColor={colors.starEmpty}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    // flex-start e nao center: com fonte grande do sistema o rotulo vira tres
    // linhas, e um ladrilho centralizado nisso flutua no meio do texto.
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    // minHeight, nunca height: a linha precisa poder crescer.
    minHeight: 68,
  },
  pressionada: {
    // Mesmo tom do filete, com menos opacidade: retorno de toque sem cor nova.
    backgroundColor: 'rgba(90, 100, 73, 0.06)',
  },
  textos: { flex: 1, marginLeft: spacing.md, marginTop: 2 },
  rotulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  valor: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  // So no marcador e nos textos. O Switch nativo ja tem o proprio visual de
  // desabilitado, e escurece-lo duas vezes o deixa ilegivel.
  apagado: { opacity: 0.45 },
});
