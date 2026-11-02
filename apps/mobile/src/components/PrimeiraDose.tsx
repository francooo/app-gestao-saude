import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from '@/components/FormField';
import type { RespostaPrimeiraDose } from '@/lib/rascunhoDeMedicamento';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * "A primeira dose ja foi tomada?" dentro do cartao de um remedio da receita.
 *
 * Totalmente controlado: a resposta crua (dia relativo + hora digitada) mora no
 * item do lote, e quem a transforma em instante e valida e
 * instanteDaPrimeiraDose, na hora de salvar. Assim "usar a mesma resposta nos
 * outros" e so copiar o objeto, sem estado interno para dessincronizar.
 *
 * Nao usa o DateTimePickerCard: ele so oferece 06:00–21:30 de meia em meia
 * hora e nao deixa escolher o passado — e "tomei ontem as 23:10" e justamente
 * o caso que importa aqui.
 */
export function PrimeiraDose({
  valor,
  onChange,
  previa,
  erro,
  desabilitado,
}: {
  valor: RespostaPrimeiraDose | undefined;
  onChange: (v: RespostaPrimeiraDose) => void;
  /** "Próximas: 22:00 · 06:00 · 14:00", ja calculada por quem chama. */
  previa: string | null;
  erro: string | null;
  desabilitado: boolean;
}) {
  const atual: RespostaPrimeiraDose = valor ?? { jaTomou: null, dia: 'hoje', hora: '' };

  function escolher(jaTomou: boolean) {
    // Trocar de lado leva o dia junto: "ontem" nao existe em "ainda nao", e
    // "amanha" nao existe em "ja tomei".
    const dia =
      (jaTomou && atual.dia === 'amanha') || (!jaTomou && atual.dia === 'ontem') ? 'hoje' : atual.dia;
    onChange({ ...atual, jaTomou, dia });
  }

  function mudarHora(texto: string) {
    // Aceita "8", "830", "08:30" e normaliza enquanto se digita, como o form.
    const digitos = texto.replace(/\D/g, '').slice(0, 4);
    const hora = digitos.length <= 2 ? digitos : `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
    onChange({ ...atual, hora });
  }

  function agora() {
    const d = new Date();
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    onChange({ ...atual, dia: 'hoje', hora });
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
    <View style={styles.bloco}>
      <Text style={styles.titulo}>A primeira dose já foi tomada?</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        <Chip
          rotulo="Já tomei"
          ativo={atual.jaTomou === true}
          desabilitado={desabilitado}
          onPress={() => escolher(true)}
        />
        <Chip
          rotulo="Ainda não"
          ativo={atual.jaTomou === false}
          desabilitado={desabilitado}
          onPress={() => escolher(false)}
        />
      </View>

      {atual.jaTomou !== null ? (
        <>
          <Text style={styles.rotulo}>{atual.jaTomou ? 'Quando tomou?' : 'Quando vai tomar?'}</Text>
          <View style={styles.chips}>
            {dias.map((d) => (
              <Chip
                key={d.chave}
                rotulo={d.rotulo}
                ativo={atual.dia === d.chave}
                desabilitado={desabilitado}
                onPress={() => onChange({ ...atual, dia: d.chave })}
              />
            ))}
          </View>
          <View style={styles.linhaHora}>
            <View style={styles.campo}>
              <FormField
                label="Hora"
                value={atual.hora}
                onChangeText={mudarHora}
                placeholder="14:00"
                keyboardType="number-pad"
                maxLength={5}
                editable={!desabilitado}
                accessibilityLabel={atual.jaTomou ? 'Hora em que tomou' : 'Hora em que vai tomar'}
              />
            </View>
            <Pressable
              onPress={agora}
              disabled={desabilitado}
              accessibilityRole="button"
              accessibilityLabel="Usar a hora de agora"
              style={({ pressed }) => [styles.agora, (pressed || desabilitado) && styles.pressionado]}
            >
              <Text style={styles.agoraTexto}>Agora</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {erro ? (
        <Text style={styles.erro}>{erro}</Text>
      ) : previa ? (
        <Text style={styles.previa}>{previa}</Text>
      ) : null}
    </View>
  );
}

function Chip({
  rotulo,
  ativo,
  desabilitado,
  onPress,
}: {
  rotulo: string;
  ativo: boolean;
  desabilitado: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="radio"
      accessibilityState={{ selected: ativo, disabled: desabilitado }}
      style={[styles.chip, ativo && styles.chipAtivo, desabilitado && !ativo && styles.chipApagado]}
    >
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bloco: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  titulo: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  rotulo: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.chipMore,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
  },
  chipAtivo: { backgroundColor: colors.chipActive },
  chipApagado: { opacity: 0.5 },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sectionTitle },
  chipTextoAtivo: { color: colors.onAccent },
  linhaHora: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginTop: spacing.sm },
  campo: { flex: 1 },
  agora: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  agoraTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentGreen },
  previa: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.accentGreen,
    marginTop: spacing.sm,
  },
  erro: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textError,
    marginTop: spacing.sm,
  },
  pressionado: { opacity: 0.85 },
});
