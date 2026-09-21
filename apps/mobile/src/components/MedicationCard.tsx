import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { DoseButton } from '@/components/DoseButton';
import { SurfaceCard } from '@/components/SurfaceCard';
import type { Medication } from '@/api/health';
import {
  diaCurto,
  estadoHoje,
  formaVisual,
  hora,
  posologia,
  tituloDoMedicamento,
  type FormaVisual,
} from '@/lib/posologia';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  medicamento: Medication;
  /** Momento de referencia. Vem de fora para a tela inteira concordar. */
  agora: Date;
  /** Some quando um so perfil esta selecionado. */
  mostrarPerfil?: boolean;
  onPress?: () => void;
  onMarcar?: () => void;
  enviando?: boolean;
};

/** Ladrilho e traco por forma farmaceutica. */
const LADRILHO: Record<FormaVisual, { fundo: string; traco: string; icone: keyof typeof Feather.glyphMap }> = {
  capsula: { fundo: colors.surfaceWarm, traco: colors.accent, icone: 'aperture' },
  comprimido: { fundo: colors.pillTablet, traco: colors.pillTabletIcon, icone: 'circle' },
  gotas: { fundo: colors.surfaceWarm, traco: colors.accent, icone: 'droplet' },
  ml: { fundo: colors.pillTablet, traco: colors.pillTabletIcon, icone: 'thermometer' },
};

export function MedicationCard({
  medicamento: m,
  agora,
  mostrarPerfil = false,
  onPress,
  onMarcar,
  enviando = false,
}: Props) {
  const estado = estadoHoje(m, agora);
  const visual = LADRILHO[formaVisual(m.form)];
  const titulo = tituloDoMedicamento(m);

  const status = linhaDeStatus(estado);
  const repetivel = m.scheduleType === 'as_needed';
  const marcado = estado.tipo === 'tomado' && !repetivel;
  const semAcao =
    estado.tipo === 'inativo' || estado.tipo === 'encerrado' || estado.tipo === 'nao_comecou';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}, ${posologia(m)}`}
      style={({ pressed }) => (pressed ? styles.pressionado : undefined)}
    >
      <SurfaceCard style={styles.card}>
        <View style={styles.linha}>
          <View style={[styles.ladrilho, { backgroundColor: visual.fundo }]}>
            <Feather name={visual.icone} size={24} color={visual.traco} />
          </View>

          <View style={styles.meio}>
            <Text style={styles.nome} numberOfLines={1}>
              {titulo}
            </Text>
            <Text style={styles.posologia} numberOfLines={1}>
              {posologia(m)}
            </Text>

            <View style={styles.status}>
              <Feather name={status.icone} size={13} color={status.cor} />
              <Text style={[styles.statusTexto, { color: status.cor }]} numberOfLines={1}>
                {status.texto}
              </Text>
            </View>
          </View>

          <View style={styles.direita}>
            {onMarcar ? (
              <DoseButton
                checked={marcado}
                repetivel={repetivel}
                disabled={semAcao}
                enviando={enviando}
                label={rotuloDaDose(titulo, estado, repetivel)}
                onPress={onMarcar}
              />
            ) : null}

            {mostrarPerfil && m.profileName ? (
              <Avatar
                nome={m.profileName}
                color={m.profileColor ?? undefined}
                recyclingKey={m.profileId}
                size={26}
              />
            ) : null}
          </View>

          <Feather name="chevron-right" size={20} color={colors.textSecondary} style={styles.seta} />
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

type Status = { icone: keyof typeof Feather.glyphMap; texto: string; cor: string };

function linhaDeStatus(estado: ReturnType<typeof estadoHoje>): Status {
  switch (estado.tipo) {
    case 'tomado':
      return {
        icone: 'check-circle',
        cor: colors.doseTaken,
        texto:
          estado.quantas > 1
            ? `${estado.quantas} doses hoje · última às ${hora(estado.quando)}`
            : `Tomado hoje às ${hora(estado.quando)}`,
      };
    case 'pendente':
      return { icone: 'clock', cor: colors.textSecondary, texto: `Próxima dose ${hora(estado.quando)}` };
    case 'se_necessario':
      return { icone: 'info', cor: colors.textSecondary, texto: 'Somente se necessário' };
    case 'nao_comecou':
      return { icone: 'calendar', cor: colors.textSecondary, texto: `Começa em ${diaCurto(estado.em)}` };
    case 'encerrado':
      return { icone: 'flag', cor: colors.textSecondary, texto: `Encerrado em ${diaCurto(estado.em)}` };
    case 'inativo':
      return { icone: 'pause-circle', cor: colors.textSecondary, texto: 'Tratamento pausado' };
    default:
      return { icone: 'clock', cor: colors.textSecondary, texto: 'Sem dose prevista hoje' };
  }
}

function rotuloDaDose(titulo: string, estado: ReturnType<typeof estadoHoje>, repetivel: boolean) {
  if (repetivel) return `Registrar uma dose de ${titulo} agora`;
  if (estado.tipo === 'tomado') return `Dose de ${titulo}, tomada às ${hora(estado.quando)}`;
  if (estado.tipo === 'pendente') return `Dose de ${titulo} das ${hora(estado.quando)}`;
  return `Dose de ${titulo}`;
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, marginBottom: spacing.md },
  pressionado: { opacity: 0.9 },
  linha: { flexDirection: 'row', alignItems: 'center' },
  ladrilho: {
    width: 54,
    height: 54,
    borderRadius: radii.card - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meio: { flex: 1, marginHorizontal: spacing.lg },
  nome: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sectionTitle,
  },
  posologia: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  statusTexto: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    flexShrink: 1,
  },
  direita: { alignItems: 'center', gap: spacing.xs },
  seta: { marginLeft: spacing.sm },
});
