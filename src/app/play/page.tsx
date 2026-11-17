import { JoinScreen } from '@/components/JoinScreen';

interface PlayPageProps {
  searchParams: Promise<{ code?: string; create?: string }>;
}

export const metadata = { title: 'Enter the town · Hushtown' };

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const { code, create } = await searchParams;
  return <JoinScreen code={typeof code === 'string' ? code : undefined} create={create === '1'} />;
}
