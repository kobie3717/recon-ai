export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain') || '';
  const mode = searchParams.get('mode') || 'standard';

  try {
    const upstream = await fetch(
      `http://localhost:3001/api/report?domain=${encodeURIComponent(domain)}&mode=${mode}`,
      {
        headers: { Accept: 'text/event-stream' },
      }
    );

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch report' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
