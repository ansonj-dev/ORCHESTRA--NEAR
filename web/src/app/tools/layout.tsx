import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Browser toolbox',
  description: 'Browse Orchestra browser-side utilities and workflow tools.',
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
