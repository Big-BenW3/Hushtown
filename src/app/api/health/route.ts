import { healthHandler } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = healthHandler();
