import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import {
  acompanhantesApi,
  PERMISSOES,
  type Acompanhante,
  type Permissao,
} from '@/api/acompanhantes';
import { ApiRequestError } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { FilterChips } from '@/components/FilterChips';
import { Icone, ICONES } from '@/components/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { ICONE_DO_AVISO, PreviaDeMensagem } from '@/components/PreviaDeMensagem';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsRow } from '@/components/SettingsRow';
import { SurfaceCard } from '@/components/SurfaceCard';
import { primeiroNome, rotuloDoAviso, textoDaDose } from '@/lib/mensagensWhatsapp';
import { telefoneParaExibir } from '@/lib/telefone';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** O que a tela deixa mudar sem abrir o cadastro: o rascunho do "Salvar avisos". */
type Avisos = Pick<Acompanhante, Permissao | 'active'>;

function avisosDe(c: Acompanhante): Avisos {
  return {
    active: c.active,
    notifyDose: c.notifyDose,
    notifyLate: c.notifyLate,
    notifyLowStock: c.notifyLowStock,
    notifyTaken: c.notifyTaken,
  };
}

/**
 * Lembretes por WhatsApp: quem recebe e o que recebe.
 *
 * As escolhas sao POR ACOMPANHANTE, nao da conta — a avo pode querer so o
 * horario da dose e a baba tambem o estoque. Com mais de um acompanhante, os
 * chips no topo escolhem de quem sao o interruptor e as preferencias.
 */
export default function WhatsappScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [lista, setLista] = useState<Acompanhante[]>([]);
  const [configurado, setConfigurado] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  // Espelho do estado para o `carregar`, que e memorizado sem dependencias e
  // leria um selecionadoId velho.
  const selecionadoRef = useRef<string | null>(null);
  const [rascunho, setRascunho] = useState<Avisos | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await acompanhantesApi.listar();
      setLista(r.caregivers);
      setConfigurado(r.whatsappConfigurado);
      setErro(null);
      // Mantem quem estava escolhido se ainda existir (voltou da edicao); se
      // foi removido, cai no primeiro. O rascunho recomeca do servidor: o que
      // estava na tela pode ter mudado na edicao.
      const alvo =
        r.caregivers.find((c) => c.id === selecionadoRef.current) ?? r.caregivers[0] ?? null;
      selecionadoRef.current = alvo?.id ?? null;
      setSelecionadoId(alvo?.id ?? null);
      setRascunho(alvo ? avisosDe(alvo) : null);
    } catch (e) {
      // Falha de carga NAO limpa a lista: o tropeco de rede nao apaga ninguem.
      setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setResultado(null);
      void carregar();
    }, [carregar]),
  );

  const selecionado = lista.find((c) => c.id === selecionadoId) ?? null;
  const mudou =
    selecionado !== null &&
    rascunho !== null &&
    (Object.keys(rascunho) as (keyof Avisos)[]).some((k) => rascunho[k] !== selecionado[k]);

  function escolher(id: string | null) {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    selecionadoRef.current = c.id;
    setSelecionadoId(c.id);
    setRascunho(avisosDe(c));
    setResultado(null);
  }

  function mudar(k: keyof Avisos, v: boolean) {
    setRascunho((r) => (r ? { ...r, [k]: v } : r));
    setResultado(null);
  }

  async function salvar() {
    if (!selecionado || !rascunho) return;
    setSalvando(true);
    setResultado(null);
    try {
      const salvo = await acompanhantesApi.atualizar(selecionado.id, rascunho);
      setLista((l) => l.map((c) => (c.id === salvo.id ? salvo : c)));
      setRascunho(avisosDe(salvo));
      setResultado({ ok: true, texto: 'Avisos salvos.' });
    } catch (e) {
      setResultado({
        ok: false,
        texto: messageForError(e instanceof ApiRequestError ? e.code : undefined),
      });
    } finally {
      setSalvando(false);
    }
  }

  const cadastrar = () => router.push('/conta/acompanhante');

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
        <ScreenHeader
          title="Lembretes por WhatsApp"
          titleLines={2}
          onBack={() => router.back()}
          mostrarSino
        />

        <SurfaceCard style={styles.apresentacao}>
          <View style={styles.circulo}>
            <Icone nome={ICONES.whatsapp} size={34} color={colors.surface} />
          </View>
          <View style={styles.apresentacaoTextos}>
            <Text style={styles.apresentacaoTitulo}>
              Receba lembretes dos medicamentos pelo WhatsApp
            </Text>
            <Text style={styles.apresentacaoAjuda}>
              Uma mensagem será enviada no horário de cada dose.
            </Text>
          </View>
        </SurfaceCard>

        {/*
          Discreto de proposito: nao e erro de quem usa, e nada impede de ja
          cadastrar e escolher. So nao promete uma mensagem que nao vai sair.
        */}
        {!configurado ? (
          <View style={styles.naoConfigurado}>
            <Feather name="info" size={16} color={colors.textSecondary} />
            <Text style={styles.naoConfiguradoTexto}>
              O envio por WhatsApp ainda não foi ativado no servidor. Você já pode cadastrar e
              escolher os avisos; as mensagens começam quando ele for ativado.
            </Text>
          </View>
        ) : null}

        {carregando && lista.length === 0 ? (
          <SurfaceCard style={styles.cartao}>
            <View style={styles.esqueletoLinha}>
              <View style={styles.esqueletoAvatar} />
              <View style={styles.esqueletoTextos}>
                <View style={[styles.esqueletoBarra, { width: 150 }]} />
                <View style={[styles.esqueletoBarra, { width: 100, height: 12, marginTop: 6 }]} />
              </View>
            </View>
          </SurfaceCard>
        ) : erro && lista.length === 0 ? (
          <SurfaceCard style={styles.vazio}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.vazioAjuda}>{erro}</Text>
            <Pressable onPress={() => void carregar()} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.tentarDeNovo}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : lista.length === 0 ? (
          // Vazio leva ao cadastro: sem acompanhante, nada desta tela funciona.
          <SurfaceCard style={styles.vazio}>
            <IconTile icone={ICONES.acompanhante} size={54} {...LADRILHO_NEUTRO} />
            <Text style={styles.vazioTitulo}>Ninguém recebe os avisos ainda</Text>
            <Text style={styles.vazioAjuda}>
              Cadastre alguém de confiança para receber os lembretes dos medicamentos pelo
              WhatsApp.
            </Text>
            <PrimaryButton title="Cadastrar acompanhante" onPress={cadastrar} style={styles.botaoVazio} />
          </SurfaceCard>
        ) : (
          <>
            {/* So aparece com dois ou mais: o FilterChips some com um chip. */}
            <View style={styles.chips}>
              <FilterChips
                chips={lista.map((c) => ({
                  value: c.id,
                  label: `${primeiroNome(c.fullName)} · ${primeiroNome(c.patientName)}`,
                }))}
                selected={selecionadoId}
                onSelect={escolher}
              />
            </View>

            {selecionado && rascunho ? (
              <Pressable
                onPress={() => mudar('active', !rascunho.active)}
                accessibilityRole="switch"
                accessibilityLabel={`Ativar mensagens para ${primeiroNome(selecionado.fullName)}`}
                accessibilityState={{ checked: rascunho.active }}
                style={styles.ativar}
              >
                <Text style={styles.ativarTexto}>Ativar mensagens</Text>
                {/* O toque e da faixa inteira; o Switch e so o desenho. Mesmo
                    motivo do SettingsRow: o Switch nativo e menor que 44 px. */}
                <View pointerEvents="none">
                  <Switch
                    value={rascunho.active}
                    trackColor={{ true: colors.switchOn, false: colors.starEmpty }}
                    thumbColor={colors.surface}
                    ios_backgroundColor={colors.starEmpty}
                  />
                </View>
              </Pressable>
            ) : null}

            <SurfaceCard style={styles.cartao}>
              <Text style={styles.tituloDoCartao}>Quem vai receber?</Text>
              {lista.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() =>
                    router.push({ pathname: '/conta/acompanhante', params: { id: c.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${c.fullName}, acompanha ${primeiroNome(c.patientName)}. Editar`}
                  style={({ pressed }) => [
                    styles.pessoa,
                    c.id === selecionadoId && lista.length > 1 && styles.pessoaEscolhida,
                    pressed && styles.pressionado,
                  ]}
                >
                  <Avatar nome={c.fullName} size={56} />
                  <View style={styles.pessoaTextos}>
                    <View style={styles.pessoaNomeLinha}>
                      <Text style={styles.pessoaNome} numberOfLines={1}>
                        {c.fullName}
                      </Text>
                      {/* O selo diz que o convite CHEGOU, nao so que existe o cadastro. */}
                      {c.invitedAt ? (
                        <Icone nome="mci:check-decagram" size={18} color={colors.accentGreen} />
                      ) : null}
                    </View>
                    <Text style={styles.pessoaApoio} numberOfLines={1}>
                      {[
                        c.relationship ? maiuscula(c.relationship) : 'Acompanhante',
                        `cuida de ${primeiroNome(c.patientName)}`,
                      ].join(' · ')}
                    </Text>
                    <View style={styles.pessoaTelefone}>
                      <Feather name="phone" size={14} color={colors.textSecondary} />
                      <Text style={styles.pessoaApoio}>{telefoneParaExibir(c.phone)}</Text>
                    </View>
                    {!c.active ? <Text style={styles.pausado}>Mensagens pausadas</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                </Pressable>
              ))}

              <Pressable
                onPress={cadastrar}
                accessibilityRole="button"
                style={({ pressed }) => [styles.cadastrar, pressed && styles.pressionado]}
              >
                <Feather name="user-plus" size={18} color={colors.accentGreen} />
                <Text style={styles.cadastrarTexto}>Cadastrar acompanhante</Text>
              </Pressable>
            </SurfaceCard>

            {selecionado && rascunho ? (
              <>
                <SurfaceCard flush style={styles.cartaoLista}>
                  <Text style={[styles.tituloDoCartao, styles.tituloComRecuo]}>
                    Preferências de envio
                  </Text>
                  {PERMISSOES.map((k, i) => (
                    <View key={k}>
                      {i > 0 ? <View style={styles.filete} /> : null}
                      <SettingsRow
                        marcador={<IconTile icone={ICONE_DO_AVISO[k]} {...LADRILHO_NEUTRO} />}
                        rotulo={rotuloDoAviso(k)}
                        acessorio="interruptor"
                        ligado={rascunho.active && rascunho[k]}
                        onChange={(v) => mudar(k, v)}
                        desabilitado={!rascunho.active || salvando}
                        motivoDesabilitado={
                          !rascunho.active ? 'Ative as mensagens para usar' : undefined
                        }
                      />
                    </View>
                  ))}
                </SurfaceCard>

                <SurfaceCard style={styles.cartao}>
                  <Text style={styles.tituloDoCartao}>Prévia da mensagem</Text>
                  {/*
                    Remedio e hora de exemplo: o lembrete real sai um por dose,
                    com o remedio e o horario daquela dose. O nome e o de
                    verdade, porque e ele que vai aparecer na tela de bloqueio.
                  */}
                  <PreviaDeMensagem
                    texto={textoDaDose({
                      paciente: selecionado.patientName,
                      remedio: 'Amoxicilina 500 mg',
                      hora: '14:00',
                    })}
                  />
                  <Text style={styles.exemplo}>
                    Exemplo. O remédio e o horário mudam a cada dose.
                  </Text>

                  {resultado ? (
                    <Text
                      style={[styles.resultado, !resultado.ok && styles.resultadoErro]}
                      accessibilityLiveRegion="polite"
                    >
                      {resultado.texto}
                    </Text>
                  ) : null}

                  <PrimaryButton
                    title="Salvar avisos"
                    onPress={() => void salvar()}
                    loading={salvando}
                    disabled={!mudou}
                    style={styles.botao}
                  />
                  <Text style={styles.rodape}>Você pode alterar essas escolhas quando quiser.</Text>
                </SurfaceCard>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.settings[0] },
  conteudo: { paddingHorizontal: spacing.xl },

  apresentacao: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  circulo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apresentacaoTextos: { flex: 1, marginLeft: spacing.lg },
  apresentacaoTitulo: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.sectionTitle },
  apresentacaoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },

  naoConfigurado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  naoConfiguradoTexto: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  chips: { marginTop: spacing.lg },

  ativar: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.actionGreen,
    borderRadius: radii.card,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: 72,
  },
  ativarTexto: { fontFamily: fonts.bold, fontSize: 19, color: colors.surface },

  cartao: { marginTop: spacing.lg },
  cartaoLista: { marginTop: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  tituloDoCartao: {
    fontFamily: fonts.extrabold,
    fontSize: 19,
    color: colors.sectionTitle,
    marginBottom: spacing.md,
  },
  tituloComRecuo: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  filete: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: spacing.lg + 44 + spacing.md,
    marginRight: spacing.lg,
  },

  pessoa: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.card - 8,
    marginBottom: spacing.sm,
  },
  pessoaEscolhida: { backgroundColor: colors.tabActive },
  pessoaTextos: { flex: 1, marginLeft: spacing.md },
  pessoaNomeLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pessoaNome: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  pessoaApoio: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
  pessoaTelefone: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  pausado: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accent, marginTop: 2 },

  cadastrar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tabActive,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    minHeight: 48,
    marginTop: spacing.xs,
  },
  cadastrarTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.accentGreen },

  exemplo: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginLeft: 40 + spacing.md,
  },
  resultado: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.accentGreen,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  resultadoErro: { color: colors.textError },
  botao: { marginTop: spacing.lg },
  rodape: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  vazio: { padding: spacing.xl, alignItems: 'center', marginTop: spacing.lg },
  vazioTitulo: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sectionTitle,
    marginTop: spacing.md,
  },
  vazioAjuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  botaoVazio: { alignSelf: 'stretch', marginTop: spacing.lg },
  tentarDeNovo: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accentGreen,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },

  pressionado: { opacity: 0.85 },
  esqueletoLinha: { flexDirection: 'row', alignItems: 'center' },
  esqueletoTextos: { flex: 1, marginLeft: spacing.md },
  esqueletoAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
