import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Credits and activity',
  description: 'Review browser-tool demo credits and execution activity.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
