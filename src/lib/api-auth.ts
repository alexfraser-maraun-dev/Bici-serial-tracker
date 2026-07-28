import 'server-only';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function getAuthenticatedEmail() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  return email?.endsWith('@bici.cc') ? email : null;
}

export function apiError(error: unknown, fallback: string) {
  console.error(fallback, error);
  return Response.json({ error: fallback }, { status: 500 });
}
