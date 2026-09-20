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
        <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.6;color:#39432C;max-width:480px">
          <p>Olá,</p>
          <p>Recebemos um pedido para criar uma nova senha na sua conta do Gestão Saúde.</p>
          <p style="margin:28px 0">
            <a href="${link}" style="background:#B78842;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;display:inline-block">
              Criar nova senha
            </a>
          </p>
          <p style="font-size:14px;color:#5A6449">
            O link vale por <strong>30 minutos</strong> e só pode ser usado uma vez.
            Ao trocar a senha, todos os aparelhos conectados serão desconectados.
          </p>
          <p style="font-size:14px;color:#5A6449">
            Se não foi você quem pediu, ignore esta mensagem — sua senha continua a mesma.
          </p>
          <p style="font-size:12px;color:#878F78;word-break:break-all;margin-top:24px">
            Se o botão não funcionar, copie este endereço no navegador:<br>${link}
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    // Deixa estourar: o handler responde 200 de qualquer forma para nao revelar
    // se a conta existe, mas queremos o erro registrado.
    throw new Error(`Resend respondeu ${response.status}`);
  }
}
