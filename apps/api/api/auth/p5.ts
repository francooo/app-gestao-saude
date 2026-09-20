import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loginRequestSchema } from '../../src/contracts';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const r = loginRequestSchema.safeParse({ email: 'a@b.com', password: 'x' });
  res.status(200).json({ modulo: 'contracts', zodFunciona: r.success });
}
