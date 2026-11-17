import { notFound } from 'next/navigation';
import { GameRoom } from '@/components/GameRoom';
import { roomCodeSchema } from '@/lib/validation/schemas';

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

export const metadata = { title: 'In the town · Hushtown' };

export default async function RoomPage({ params }: RoomPageProps) {
  const parsed = roomCodeSchema.safeParse((await params).code);
  if (!parsed.success) notFound();
  return <GameRoom code={parsed.data} />;
}
