import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent marketplace',
  description: 'Publish agent services, hire providers, and review job receipts on NEAR testnet.',
};

export default function NearLayout({ children }: { children: React.ReactNode }) {
  return children;
}
