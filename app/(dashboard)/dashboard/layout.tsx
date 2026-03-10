import { getUser } from '@/lib/db/queries';
import DashboardShell from './dashboard-shell';

const ADMIN_EMAIL = 'rudyak.kirill@gmail.com';

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  return <DashboardShell isAdmin={isAdmin}>{children}</DashboardShell>;
}
