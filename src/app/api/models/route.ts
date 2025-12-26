import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.LM_STUDIO_URL || 'http://192.168.1.228:1234/v1';
  
  console.log(`Intentando conectar a LM Studio en: ${baseUrl}/models`);

  try {
    const response = await fetch(`${baseUrl}/models`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000) // Timeout de 5 segundos
    });

    if (!response.ok) {
      throw new Error(`LM Studio respondió con status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error en /api/models:', error.message);
    return NextResponse.json({ 
      error: 'No se pudo conectar con LM Studio',
      details: error.message,
      target: baseUrl
    }, { status: 500 });
  }
}
