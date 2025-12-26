import { NextRequest } from 'next/server';

export const runtime = 'edge'; // Opcional: para mejor rendimiento en streaming

export async function POST(req: NextRequest) {
  const baseUrl = process.env.LM_STUDIO_URL || 'http://192.168.1.228:1234/v1';
  const body = await req.json();

  console.log(`Enviando petición de chat a: ${baseUrl}/chat/completions`);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error de LM Studio (${response.status}):`, errorText);
      return Response.json({ error: `Error de LM Studio: ${response.status}` }, { status: response.status });
    }

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
  } catch (error: any) {
    console.error('Error en /api/chat:', error.message);
    return Response.json({ error: 'Error en la conexión con el servidor de IA', details: error.message }, { status: 500 });
  }
}
