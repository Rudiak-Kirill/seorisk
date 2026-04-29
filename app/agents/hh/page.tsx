import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import HhAgentClient from './hh-agent-client';

export const dynamic = 'force-dynamic';

export default async function HhAgentPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return <HhAgentClient />;
}
