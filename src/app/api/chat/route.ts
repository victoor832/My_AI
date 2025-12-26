import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60; // Aumentar a 60 segundos (si el plan lo permite)

export async function POST(req: NextRequest) {
  const baseUrl = process.env.LM_STUDIO_URL || 'http://192.168.1.228:1234/v1';
  const body = await req.json();
  const isStreaming = body.stream !== false;

  console.log(`Enviando petición de chat (${isStreaming ? 'stream' : 'json'}) a: ${baseUrl}/chat/completions`);

  if (!isStreaming) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({ error: `Error de LM Studio: ${response.status}`, details: errorText }, { status: response.status });
      }
      
      const data = await response.json();
      return Response.json(data);
    } catch (error: any) {
      return Response.json({ error: 'Error de conexión', details: error.message }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();

  // Creamos un stream que comienza inmediatamente para evitar el timeout de 25s de Vercel
  const stream = new ReadableStream({
    async start(controller) {
      // Enviar un ping inicial para mantener la conexión activa
      controller.enqueue(encoder.encode(': ping\n\n'));

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(180000) 
        });

        if (!response.ok) {
          const errorText = await response.text();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Error de LM Studio: ${response.status}`, details: errorText })}\n\n`));
          controller.close();
          return;
        }

        if (!response.body) {
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (error: any) {
        console.error('Error en el stream de chat:', error);
        const errorMessage = error.name === 'TimeoutError' ? 'El modelo tardó demasiado en responder' : error.message;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Error de conexión', details: errorMessage })}\n\n`));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
