import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { password } = await req.json();
  const correctPassword = process.env.APP_PASSWORD || 'admin123';

  if (password === correctPassword) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false }, { status: 401 });
}
