import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MedicamentoLido } from '@/api/health';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  itens: MedicamentoLido[];
  escolhido: number | null;
  onEscolher: (index: number) => void;
};

/**
 * Qual dos remedios da receita cadastrar agora.
 *
 * Existe porque uma receita costuma trazer de 2 a 5 — no teste real o modelo
 * leu tres de uma vez. Pegar o primeiro em silencio cadastraria o remedio
 * errado, e a pessoa so descobriria no lembrete.
 *
 * NADA VEM PRE-SELECIONADO. Escolher e a propriedade de seguranca desta tela;
 * um item ja marcado convida a seguir sem olhar.
 */
export function SeletorDeRemedios({ itens, escolhido, onEscolher }: Props) {
  return (
    <SurfaceCard style={styles.cartao}>
      <Text style={styles.titulo}>
        Encontrei {itens.length} remédios nesta receita
      </Text>
      <Text style={styles.subtitulo}>
        Escolha qual cadastrar agora. Dá para cadastrar os outros depois, um de cada vez.
      </Text>

      <View style={styles.lista}>
        {itens.map((item) => {
          const ativo = escolhido === item.index;
          return (
            <Pressable
              key={item.index}
              onPress={() => onEscolher(item.index)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativo }}
              accessibilityLabel={`${item.name} ${item.strength ?? ''}`.trim()}
              style={({ pressed }) => [styles.item, ativo && styles.itemAtivo, pressed && styles.pressionado]}
            >
              <Feather
                name={ativo ? 'check-circle' : 'circle'}
                size={18}
                color={ativo ? colors.accentGreen : colors.textSecondary}
              />
              <View style={styles.itemTextos}>
                {/* Duas linhas no nome: aqui a altura uniforme e o que faz a
                    lista ser comparavel de relance. */}
                <Text style={styles.itemNome} numberOfLines={2}>
                  {[item.name, item.strength].filter(Boolean).join(' ')}
                </Text>
                <Text style={styles.itemResumo} numberOfLines={1}>
                  {resumo(item)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SurfaceCard>
  );
}

function resumo(item: MedicamentoLido): string {
  if (item.scheduleType === 'interval' && item.intervalHours) {
    return item.intervalHours === 24 ? '1x ao dia' : `a cada ${item.intervalHours} horas`;
  }
  if (item.scheduleType === 'fixed_times' && item.times.length > 0) {
    return `às ${item.times.join(' e ')}`;
  }
  if (item.scheduleType === 'as_needed') return 'se necessário';
  return 'sem horário na receita';
}

const styles = StyleSheet.create({
  cartao: { padding: spacing.lg, marginTop: spacing.md },
  titulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  lista: { marginTop: spacing.md, gap: spacing.sm },
  // Medidas copiadas dos radios de tipo do formulario: as duas listas sao
  // irmas e precisam ler como irmas.
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card - 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  itemAtivo: { borderColor: colors.accentGreen, backgroundColor: colors.chipMore },
  pressionado: { opacity: 0.85 },
  itemTextos: { flex: 1, marginLeft: spacing.md },
  itemNome: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  itemResumo: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
