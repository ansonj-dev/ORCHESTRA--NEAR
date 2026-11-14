import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent workflows',
  description: 'Compose browser-tool workflow previews in Orchestra.',
};

export default function RosterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
