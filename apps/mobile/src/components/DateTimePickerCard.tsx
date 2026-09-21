import { addMinutes, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { colors, fonts, radii, spacing } from '@/theme';

/**
 * Calendario em JavaScript puro — sem modulo nativo, entao chega por
 * atualizacao OTA. O seletor nativo do Android exigiria mais um APK.
 */
LocaleConfig.locales['pt-br'] = {
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ],
  monthNamesShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'pt-br';

type Props = {
  /** Instante escolhido, no fuso do aparelho. */
  value: Date;
  onChange: (value: Date) => void;
};

/** Horarios de 30 em 30 minutos, das 6h as 21h30. */
const PRIMEIRO_MINUTO = 6 * 60;
const ULTIMO_MINUTO = 21 * 60 + 30;
const PASSO = 30;

export function DateTimePickerCard({ value, onChange }: Props) {
  const horarios = useMemo(() => {
    const base = startOfDay(value);
    const lista: Date[] = [];
    for (let m = PRIMEIRO_MINUTO; m <= ULTIMO_MINUTO; m += PASSO) {
      lista.push(addMinutes(base, m));
    }
    return lista;
  }, [value]);

  const diaSelecionado = format(value, 'yyyy-MM-dd');
  const horaSelecionada = format(value, 'HH:mm');

  function escolherDia(iso: string) {
    // Mantem a hora ja escolhida ao trocar de dia — trocar a data nao deveria
    // zerar o horario que a pessoa acabou de selecionar.
    const [ano, mes, dia] = iso.split('-').map(Number);
    const novo = new Date(value);
    novo.setFullYear(ano!, mes! - 1, dia!);
    onChange(novo);
  }

  return (
    <View>
      <Calendar
        current={diaSelecionado}
        minDate={format(new Date(), 'yyyy-MM-dd')}
        onDayPress={(d) => escolherDia(d.dateString)}
        markedDates={{
          [diaSelecionado]: { selected: true, selectedColor: colors.accentGreen },
        }}
        firstDay={0}
        enableSwipeMonths
        theme={{
          calendarBackground: 'transparent',
          textSectionTitleColor: colors.textSecondary,
          monthTextColor: colors.sectionTitle,
          dayTextColor: colors.textPrimary,
          todayTextColor: colors.accentGreen,
          selectedDayTextColor: colors.onAccent,
          arrowColor: colors.accentGreen,
          textDayFontFamily: fonts.regular,
          textMonthFontFamily: fonts.bold,
          textDayHeaderFontFamily: fonts.semibold,
          textMonthFontSize: 17,
          textDayFontSize: 15,
        }}
      />

      <Text style={styles.subtitulo}>
        {format(value, "EEEE',' d 'de' MMMM", { locale: ptBR })}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horas}>
        {horarios.map((h) => {
          const rotulo = format(h, 'HH:mm');
          const ativo = rotulo === horaSelecionada;
          return (
            <Pressable
              key={rotulo}
              onPress={() => onChange(h)}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              style={[styles.hora, ativo && styles.horaAtiva]}
            >
              <Text style={[styles.horaTexto, ativo && styles.horaTextoAtivo]}>{rotulo}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  subtitulo: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.sectionTitle,
    textTransform: 'capitalize',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  horas: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  hora: {
    backgroundColor: colors.onAccent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
  },
  horaAtiva: {
    backgroundColor: colors.accentGreen,
    borderColor: colors.accentGreen,
  },
  horaTexto: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.sectionTitle,
  },
  horaTextoAtivo: {
    color: colors.onAccent,
  },
});
