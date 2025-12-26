import { NextRequest } from 'next/server';

export const runtime = 'edge'; // Opcional: para mejor rendimiento en streaming

export async function POST(req: NextRequest) {
  const baseUrl = process.env.LM_STUDIO_URL || 'http://192.168.1.228:1234/v1';
  const body = await req.json();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Si no es streaming, devolvemos el JSON normal
    if (!body.stream) {
      const data = await response.json();
      return Response.json(data);
    }

    // Si es streaming, devolvemos el stream directamente
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return Response.json({ error: 'Error en la conexión con el servidor de IA' }, { status: 500 });
  }
}
