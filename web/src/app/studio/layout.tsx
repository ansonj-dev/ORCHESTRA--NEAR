import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tool studio',
  description: 'Create and evaluate browser-side tool definitions.',
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
