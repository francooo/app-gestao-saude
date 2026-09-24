import { Feather } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { colors, fonts, radii } from '@/theme';

/**
 * Area autenticada. O guard tambem cobre a expiracao da sessao: quando o
 * refresh token e rejeitado, o AuthContext zera o usuario e o redirect dispara.
 */
export default function AppLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentGreen,
        tabBarInactiveTintColor: colors.textSecondary,
        /**
         * A margem inferior precisa somar a area do sistema.
         *
         * Antes eu usava um valor fixo (12 no Android), e a barra flutuante
         * ficava POR CIMA dos botoes de voltar/home/recentes — atrapalhando
         * tanto a navegacao do app quanto a do celular. insets.bottom e a
         * altura real reservada pelo sistema, que varia entre aparelhos com
         * botoes e aparelhos com gestos.
         */
        tabBarStyle: [styles.barra, { bottom: insets.bottom + 12 }],
        tabBarLabelStyle: styles.rotulo,
        tabBarItemStyle: styles.item,
        // Retangulo claro atras do icone da aba ativa, como na referencia.
        tabBarActiveBackgroundColor: colors.tabActive,
        sceneStyle: { backgroundColor: colors.homeBackgroundTop },
      }}
    >
      <Tabs.Screen
        name="inicio"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="remedios"
        options={{
          title: 'Remédios',
          // O Feather nao tem icone de capsula; "thermometer" e o mais proximo
          // do campo da saude sem recorrer a outra familia de icones.
          tabBarIcon: ({ color, size }) => (
            <Feather name="thermometer" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="medicos"
        options={{
          title: 'Médicos',
          tabBarIcon: ({ color, size }) => <Feather name="map-pin" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistente"
        options={{
          title: 'Assistente',
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-square" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Feather name="sliders" size={size} color={color} />,
        }}
      />

      {/*
        Formularios: ficam dentro de (app) para herdar o guard de sessao, mas
        href: null os tira da barra. A barra tambem some na tela, porque abas
        embaixo de um formulario longo dividem a atencao e convidam a sair no
        meio do preenchimento.

        O DETALHE DO MEDICAMENTO SAIU DESTA LISTA. Ele virou uma pilha dentro
        da propria aba Remedios (ver remedios/_layout.tsx), que e a unica forma
        de a barra aparecer com "Remedios" aceso, como o mockup pede. Aqui,
        como rota irma, nenhuma aba acenderia.
      */}
      <Tabs.Screen
        name="medico/[id]"
        options={{ href: null, tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="consulta/nova"
        options={{ href: null, tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="mapa"
        options={{ href: null, tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="medicamento/form/[id]"
        options={{ href: null, tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="membro/[id]"
        options={{ href: null, tabBarStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barra: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    // Barra flutuante, como no mockup, em vez de colada na borda da tela.
    position: 'absolute',
    left: 12,
    right: 12,
    height: 68,
    borderRadius: radii.card,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: '#2C3520',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  rotulo: {
    fontFamily: fonts.semibold,
    fontSize: 11,
  },
  item: {
    paddingVertical: 4,
    marginHorizontal: 4,
    marginVertical: 6,
    borderRadius: 18,
  },
});
