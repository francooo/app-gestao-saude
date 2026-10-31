# Gestão Saúde — plano do vídeo (Reels)

- **Formato:** 1080×1920 (9:16), 30 fps, 55 s, H.264 + AAC — especificação do Instagram Reels.
- **Tom:** app-store — cartões limpos, transições suaves, acolhedor (a identidade do app é aquarela sage + mãe e bebê).
- **Duração:** o usuário pediu ≥ 50 s (a skill sugere 15–25 s; o pedido explícito prevalece).
- **Ângulo:** "Muita coisa pra lembrar?" → o app lembra por você. Um passeio pelo fluxo real: família → receita com IA → doses → estoque → WhatsApp → assistente → médicos → sintomas.
- **Fonte visual:** as 19 telas finais de `assets-source/familia-saude-telas-selecionadas/telas/` (1440×2560, as telas que o app implementa), animadas com toques, digitação, varredura de IA e recortes ampliados. Fonte Nunito (a do app), cores dos tokens de `packages/shared/src/theme.ts`, ilustração e folhas de `apps/mobile/assets/images/`.
- **Dados pessoais:** nenhum dado real. Os nomes nas telas (Ana Clara, Lucas, Dra. Ana Costa, Marina Rocha, telefone (11) 99999-1234) já são fictícios do design.
- **Textos de WhatsApp:** usam os modelos reais de `apps/api/src/lib/mensagens-whatsapp.ts`.
- **Sem promessas inventadas:** nada de "grátis", "nº 1", loja ou números que o app não afirma.

## Música
D maior, **96 BPM** (tempo = 0,625 s; compasso = 2,5 s; 55 s = 22 compassos exatos). Progressão D–A–Bm–G. Intro só com pad e pluck (0–5 s), bumbo e baixo entram na revelação (5 s), groove completo de 10 s a 50 s, sino de melodia a partir de 30 s, bateria sai em 52,5 s e o acorde final soa até 55 s. Efeitos no mesmo tom e na grade de colcheias (0,3125 s): toques = clique de madeira suave; troca de cena = sopro filtrado baixinho; IA pronta = arpejo D–F#–A; notificações = sinos.

## Storyboard (s)

| # | Tempo | Cena | Texto na tela | Ação / SFX |
|---|---|---|---|---|
| 1 | 0–5 | **Gancho** — três notificações do app empilham no fundo sage | "Muita coisa pra lembrar?" (entra 2,8) | sinos em 0,31 / 1,25 / 2,19 |
| 2 | 5–10 | **Revelação** — ilustração mãe e bebê em tela cheia, zoom lento | "Gestão Saúde" + "Cuidando de quem você ama" | celular sobe a partir de 8,75 |
| 3 | 10–15 | **Início** | eyebrow "Família" · "Toda a família num só lugar" | recorte da faixa de membros; toques nos avatares 11,25 / 12,5; toque em "Fotografar receita" 13,75 |
| 4 | 15–22,5 | **Receita com IA** | eyebrow "IA" · "Fotografe a receita. A IA preenche pra você." | toque "Tirar foto" 16,25 + flash; varredura; campos aparecem 17,5 / 18,125 / 18,75; "Pronto para revisar" 19,375 + arpejo; recorte ampliado |
| 5 | 22,5–27,5 | **Doses de hoje** | eyebrow "Remédios" · "Cada dose marcada com um toque" | toque no círculo da Amoxicilina 23,75 → check verde + "Tomado hoje às 14:00" |
| 6 | 27,5–32,5 | **Estoque** | eyebrow "Estoque" · "Saiba antes do remédio acabar" | recorte do cartão com "Estoque baixo" pulsando |
| 7 | 32,5–37,5 | **WhatsApp** | eyebrow "Lembretes" · "O lembrete chega no WhatsApp" / "pra você e pra quem ajuda a cuidar" | balões reais aparecem 33,75 / 35,0 / 36,25 |
| 8 | 37,5–42,5 | **Assistente** | eyebrow "Assistente" · "Tire dúvidas a qualquer hora" | digita "Qual remédio posso dar para febre?"; envia 40,625; recorte do aviso "não substituem uma consulta médica" |
| 9 | 42,5–47,5 | **Médicos** | eyebrow "Médicos" · "Médicos perto de você, no mapa" | pulso no pino; toque "Agendar" 45,0; recorte do cartão da médica |
| 10 | 47,5–50 | **Sintomas** | eyebrow "Diário" · "Registre como cada um se sente" | toques Febre 48,125 / intensidade 48,75 / Salvar 49,375 |
| 11 | 50–55 | **Encerramento** — três celulares em leque, ícone do app | "Gestão Saúde" · "Cuidando de quem você ama" · pílulas dos recursos | bateria sai em 52,5; acorde final |

Transições: dentro do celular, push lateral de navegação (0,4 s); legendas saem para cima e depois as novas entram (escalonado, sem dupla exposição).
Área segura do Reels: texto principal entre y 230 e y 1500; o rodapé (≈ 350 px) só tem a barra de abas do app.
