import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.LM_STUDIO_URL || 'http://192.168.1.228:1234/v1';
  
  try {
    const response = await fetch(`${baseUrl}/models`, {
      cache: 'no-store'
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'No se pudo conectar con LM Studio' }, { status: 500 });
  }
}
