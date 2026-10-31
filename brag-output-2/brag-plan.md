# Gestão Saúde — Login, cadastro e tela inicial (Reels com narração)

- **Formato:** 1080×1920 (9:16), 30 fps, ~53,6 s, H.264 + AAC.
- **Tom:** comercial animado (preset mais próximo: `app-store`, com mais energia na voz e nos cortes).
- **Voz:** Kokoro `pf_dora` (pt-BR), velocidade 1,08, gerada por `npx hyperframes tts`.
- **Escopo pedido:** só login, recuperação de senha, criação de conta e a tela inicial.
- **Fidelidade:** as telas de entrada são reconstruídas a partir do código real (`app/(auth)/login.tsx`, `cadastro.tsx`, `esqueci-senha.tsx`, `PillInput`, `GlassCard`, `PrimaryButton`, `ConsentCheckbox`), porque o design difere do app (login real pede **E-mail**, não "Usuário"; cadastro real tem **Nome completo** e aceite da política). A tela inicial é a do design (`home-screen-prescription-ai-entry.png`), corrigida para o app real: textos reais do Assistente, cartão **Diário de sintomas** e seção **Médicos** inseridos na ordem de `app/(app)/inicio.tsx`.
- **Fatos verificados no código:** sessão salva no aparelho (SecureStore, restaurada ao abrir); link de redefinição vale 30 minutos; cadastro já entra direto (signUp salva os tokens); tocar num membro filtra a tela ("Medicamentos de hoje · Nome").
- **Dados:** e-mail e nomes fictícios (ana.clara@email.com, Ana Clara Souza).

## Voiceover script

| # | Início (s) | Fala | Duração |
|---|---|---|---|
| 01 | 0,40 | A saúde da família inteira, na palma da sua mão! | 2,79 |
| 02 | 3,60 | Tudo começa aqui. Para entrar, é só digitar o seu e-mail e a sua senha. | 3,93 |
| 03 | 7,85 | E o aplicativo guarda o seu acesso: abriu, já está dentro. | 3,33 |
| 04 | 11,90 | Esqueceu a senha? Relaxa! A gente manda um link para o seu e-mail, válido por trinta minutos. | 5,03 |
| 05 | 18,60 | Primeira vez por aqui? Toque em criar conta. Seu nome, seu e-mail, uma senha... | 4,10 |
| 06 | 22,95 | aceite a política de privacidade, e pronto! Você já entra direto. | 3,99 |
| 07 | 27,20 | E olha só a tela inicial! | 1,62 |
| 08 | 29,10 | No topo, a família toda. Toque em alguém, e a tela mostra só o que é dela. | 3,99 |
| 09 | 33,40 | Fotografe a receita, e a inteligência artificial preenche o cadastro para você. | 4,42 |
| 10 | 38,10 | Ficou com dúvida? Pergunte ao Assistente de Saúde. E anote febre, dor, humor e sono no diário de sintomas. | 6,08 |
| 11 | 44,50 | Logo abaixo, os remédios de hoje, os seus médicos e as próximas consultas. | 4,31 |
| 12 | 49,40 | Gestão Saúde. Cuidando de quem você ama! | 2,56 |

("e-mail" é escrito "imeil" no texto enviado ao Kokoro, para a pronúncia brasileira.)

## Storyboard

| Tempo | Tela | Legenda | Ação |
|---|---|---|---|
| 0–3,3 | Ilustração mãe e bebê | "A saúde da família na palma da mão" | celular sobe com o login a partir de 2,9 |
| 3,3–7,7 | Login | Login · "Entre com e-mail e senha" | digita e-mail e senha |
| 7,7–11,5 | Login | Seguro · "Abriu, já está dentro" | selo "Acesso guardado no aparelho"; toque em "Esqueci minha senha" |
| 11,5–17,5 | Esqueci minha senha | "Link de redefinição no seu e-mail" | digita e-mail, envia, "Confira seu e-mail" |
| 17,5–26,3 | Login → Criar sua conta | Primeira vez? · "Crie sua conta" | toque "Criar conta"; nome, e-mail, senhas, aceite; "Criar conta" |
| 26,3–49 | Tela inicial | Tela inicial / Família / IA / Assistente / Diário / Resumo | recortes ampliados, toques, rolagem |
| 49–53,6 | Ilustração + ícone | "Gestão Saúde · Cuidando de quem você ama" | sino final |

## Áudio
Música `happy-beats-business-moves-vol-1` (120 BPM, preset de cues da skill) a 0,32, abaixada para ~0,13 sob a voz (sidechain), sobe no fim. SFX da skill: teclas por caractere, clique nos toques, deslize nas trocas de tela, `bong_001` no envio, `switch_002` no aceite, `impactBell_heavy_000` na conta criada, `impactBell_heavy_003` no encerramento.
