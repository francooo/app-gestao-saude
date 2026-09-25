import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Profile } from '@/api/health';
import { Avatar } from '@/components/Avatar';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsGroup } from '@/components/SettingsGroup';
import { SettingsRow } from '@/components/SettingsRow';
import { SurfaceCard } from '@/components/SurfaceCard';
import { idadeDescrita } from '@/lib/pessoa';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/**
 * A familia, em lista.
 *
 * Ate agora as pessoas so apareciam na faixa horizontal da tela Inicio, que
 * cabe tres e meia por vez. Numa casa com avos e mais de um filho, a faixa
 * vira rolagem lateral as cegas.
 */
export default function FamiliaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const lista = await healthApi.listProfiles();
      /**
       * Lista vazia e ERRO, nao "familia vazia".
       *
       * Uma conta sempre tem ao menos o titular, criado na mesma transacao do
       * cadastro — entao lista vazia e sempre falha de carga. Mostrar a
       * familia vazia faria alguem recadastrar todo mundo. Mesma decisao ja
       * registrada no FamilyMemberStrip, pelo mesmo motivo.
       */
      if (lista.length === 0) {
        setErro('Não consegui carregar as pessoas da sua família.');
      } else {
        setErro(null);
        setPerfis(lista);
      }
    } catch (e) {
      setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  // Titular primeiro; o resto na ordem que o servidor mandou.
  const ordenados = [...perfis].sort(
    (a, b) => Number(b.isAccountHolder) - Number(a.isAccountHolder),
  );

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.settings} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              void carregar();
            }}
            tintColor={colors.accentGreen}
          />
        }
      >
        <ScreenHeader title="Membros da família" titleLines={2} onBack={() => router.back()} />

        {carregando && perfis.length === 0 ? (
          <SettingsGroup style={{ marginTop: spacing.xl }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.esqueletoLinha}>
                <View style={styles.esqueletoAvatar} />
                <View style={styles.esqueletoTextos}>
                  <View style={[styles.esqueletoBarra, { width: 160 }]} />
                  <View style={[styles.esqueletoBarra, { width: 100, height: 12, marginTop: 6 }]} />
                </View>
              </View>
            ))}
          </SettingsGroup>
        ) : erro && perfis.length === 0 ? (
          <SurfaceCard style={styles.aviso}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.avisoTexto}>{erro}</Text>
            <Pressable onPress={() => void carregar()} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.tentarDeNovo}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <SettingsGroup style={{ marginTop: spacing.xl }}>
            {ordenados.map((p) => (
              <SettingsRow
                key={p.id}
                marcador={
                  <Avatar
                    nome={p.fullName}
                    photo={p.photo}
                    color={p.avatarColor ?? undefined}
                    recyclingKey={p.id}
                    size={44}
                  />
                }
                rotulo={p.fullName}
                valor={linhaDeApoio(p)}
                onPress={() => router.push(`/membro/${p.id}`)}
              />
            ))}
          </SettingsGroup>
        )}

        {/* O botao permanece mesmo com a lista falhando: cadastrar nao depende
            de listar. */}
        <Pressable
          onPress={() => router.push('/membro/novo')}
          accessibilityRole="button"
          accessibilityLabel="Adicionar membro da família"
          style={({ pressed }) => [styles.adicionar, pressed && styles.pressionado]}
        >
          <Feather name="plus" size={20} color={colors.onAccent} />
          <Text style={styles.adicionarTexto}>Adicionar membro</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * "Conta principal · 33 anos", "filho(a) · 5 anos", ou nada.
 *
 * Campo ausente simplesmente nao aparece — nunca "sem parentesco", que seria
 * ocupar uma linha para dizer um nada.
 */
function linhaDeApoio(p: Profile): string | undefined {
  const partes = [
    p.isAccountHolder ? 'Conta principal' : maiuscula(p.relationship),
    idadeDescrita(p.birthDate),
  ].filter(Boolean);

  return partes.length > 0 ? partes.join(' · ') : undefined;
}

function maiuscula(texto: string | null | undefined): string | null {
  if (!texto) return null;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.settings[0] },
  conteudo: { paddingHorizontal: spacing.xl },

  adicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    minHeight: 56,
    marginTop: spacing.xl,
  },
  adicionarTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
  pressionado: { opacity: 0.85 },

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
    paddingVertical: spacing.sm,
  },

  esqueletoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 68,
  },
  esqueletoTextos: { flex: 1, marginLeft: spacing.md },
  esqueletoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.starEmpty,
    opacity: 0.5,
  },
  esqueletoBarra: {
    height: 16,
    borderRadius: 6,
    backgroundColor: colors.starEmpty,
    opacity: 0.5,
  },
});
