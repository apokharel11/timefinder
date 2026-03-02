import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = new Redis({
  url: process.env.PRIMARY_STORAGE_REDIS_URL || '',
  token: '', // Leave this empty as the token is embedded in the URL
});

// ALTERNATIVE: if the above throws an error, use this "Direct" method:
// const redis = Redis.fromConfig({ url: process.env.PRIMARY_STORAGE_REDIS_URL || '' });

const SYNC_KEY = 'shazam_shared_data_v1';

export async function GET() {
  try {
    const data = await redis.get(SYNC_KEY);
    return NextResponse.json(data || {});
  } catch (error: any) {
    console.error("Redis Connection Error:", error);
    return NextResponse.json({ error: 'Database unreachable' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await redis.set(SYNC_KEY, body);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Redis Save Error:", error);
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
  }
}