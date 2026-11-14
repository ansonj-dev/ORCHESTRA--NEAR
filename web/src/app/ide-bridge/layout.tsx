import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Developer guide',
  description: 'Developer integrations and local browser-tool examples for Orchestra.',
};

export default function IdeBridgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
