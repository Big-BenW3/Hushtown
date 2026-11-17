import { createRoomHandler } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createRoomHandler();
