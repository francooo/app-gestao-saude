/**
 * Envio do e-mail de recuperacao de senha.
 *
 * Sem RESEND_API_KEY configurada, o link e apenas registrado no log da funcao —
 * o que basta para desenvolver e testar o fluxo inteiro sem dominio verificado
 * nem conta de e-mail. Em producao, configure a chave.
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const base = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';
  const link = `${base.replace(/\/+$/, '')}/redefinir-senha?token=${token}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Nunca registramos o e-mail junto do link: os logs da Vercel ficam fora do
    // Brasil e o par (conta, token de reset) nao deve viver la.
    console.warn('[auth] RESEND_API_KEY ausente — link de recuperacao:', link);
    return;
  }

  const from = process.env.RESEND_FROM ?? 'Gestao Saude <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Recuperação de senha — Gestão Saúde',
      html: `
        <p>Olá,</p>
        <p>Recebemos um pedido para criar uma nova senha na sua conta.</p>
        <p><a href="${link}">Criar nova senha</a></p>
        <p>Este link vale por 30 minutos e só pode ser usado uma vez.</p>
        <p>Se não foi você quem pediu, ignore esta mensagem — sua senha continua a mesma.</p>
      `,
    }),
  });

  if (!response.ok) {
    // Deixa estourar: o handler responde 200 de qualquer forma para nao revelar
    // se a conta existe, mas queremos o erro registrado.
    throw new Error(`Resend respondeu ${response.status}`);
  }
}
