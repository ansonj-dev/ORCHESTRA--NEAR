import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interactive demo',
  description: 'Explore the Orchestra browser-tool sandbox.',
};

export default function DemoTargetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
