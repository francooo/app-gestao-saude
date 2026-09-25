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

/**
 * Molde comum das mensagens transacionais.
 *
 * Sem RESEND_API_KEY o envio vira log, no mesmo contrato de
 * sendPasswordResetEmail: da para exercitar o fluxo inteiro sem dominio
 * verificado. NUNCA registramos o endereco junto do token — os logs da Vercel
 * ficam fora do Brasil, e o par (conta, token) nao pode viver la.
 */
async function enviar(para: string, assunto: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[conta] RESEND_API_KEY ausente — e-mail nao enviado:', assunto);
    return;
  }

  const from = process.env.RESEND_FROM ?? 'Gestao Saude <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [para], subject: assunto, html }),
  });

  if (!response.ok) throw new Error(`Resend respondeu ${response.status}`);
}

const ESTILO =
  "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.6;color:#39432C;max-width:480px";

/** Esconde o miolo do endereco: "ana@exemplo.com" vira "a***@exemplo.com". */
function mascarar(email: string): string {
  const [conta, dominio] = email.split('@');
  if (!conta || !dominio) return email;
  return `${conta.slice(0, 1)}***@${dominio}`;
}

/** O link que efetiva a troca. Vai para o endereco NOVO. */
export async function sendEmailChangeConfirmation(novoEmail: string, token: string): Promise<void> {
  const base = (process.env.APP_PUBLIC_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const link = `${base}/confirmar-email?token=${token}`;

  await enviar(
    novoEmail,
    'Confirme seu novo e-mail — Gestão Saúde',
    `<div style="${ESTILO}">
      <p>Olá,</p>
      <p>Você pediu para usar este endereço na sua conta do Gestão Saúde.</p>
      <p style="margin:28px 0">
        <a href="${link}" style="background:#B78842;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;display:inline-block">
          Confirmar este e-mail
        </a>
      </p>
      <p style="font-size:14px;color:#5A6449">
        O link vale por <strong>30 minutos</strong> e só pode ser usado uma vez.
        Até você abri-lo, o endereço antigo continua valendo.
        Depois da troca, todos os aparelhos conectados serão desconectados.
      </p>
      <p style="font-size:14px;color:#5A6449">
        Se não foi você quem pediu, ignore esta mensagem — nada muda.
      </p>
      <p style="font-size:12px;color:#878F78;word-break:break-all;margin-top:24px">
        Se o botão não funcionar, copie este endereço no navegador:<br>${link}
      </p>
    </div>`,
  );
}

/**
 * Aviso ao endereco ANTIGO.
 *
 * E a chance de reagir de quem nao pediu a troca — por isso o endereco novo
 * aparece mascarado: o suficiente para reconhecer se foi voce, insuficiente
 * para entregar o endereco de alguem a quem tenha invadido a caixa antiga.
 */
export async function sendEmailChangeNotice(emailAtual: string, novoEmail: string): Promise<void> {
  await enviar(
    emailAtual,
    'Pedimos confirmação de um novo e-mail — Gestão Saúde',
    `<div style="${ESTILO}">
      <p>Olá,</p>
      <p>
        Alguém pediu para trocar o e-mail da sua conta do Gestão Saúde para
        <strong>${mascarar(novoEmail)}</strong>.
      </p>
      <p style="font-size:14px;color:#5A6449">
        A troca só acontece quando o novo endereço confirmar o pedido.
        Até lá, <strong>este endereço continua valendo</strong>.
      </p>
      <p style="font-size:14px;color:#5A6449">
        Se não foi você, <strong>troque sua senha agora</strong> pelo aplicativo,
        em Ajustes › E-mail e senha. Trocar a senha cancela o pedido.
      </p>
    </div>`,
  );
}

/**
 * Aviso ao dono de um endereco que outra pessoa tentou usar.
 *
 * Existe porque a rota responde 204 mesmo quando o endereco ja tem conta — se
 * respondesse "ja existe", viraria um verificador de quem tem conta num
 * aplicativo de saude. Quem precisa saber da tentativa e o dono do endereco.
 */
export async function sendEmailTakenNotice(email: string): Promise<void> {
  await enviar(
    email,
    'Alguém tentou usar seu e-mail — Gestão Saúde',
    `<div style="${ESTILO}">
      <p>Olá,</p>
      <p>
        Alguém tentou usar este endereço em outra conta do Gestão Saúde.
        <strong>Nada mudou</strong>: este e-mail continua sendo seu.
      </p>
      <p style="font-size:14px;color:#5A6449">
        Você não precisa fazer nada. Se não reconhece a tentativa e quer mais
        segurança, troque sua senha pelo aplicativo.
      </p>
    </div>`,
  );
}
