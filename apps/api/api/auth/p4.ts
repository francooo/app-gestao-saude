import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSession } from '../../src/auth/session';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ modulo: 'auth/session', carregou: typeof createSession });
}
