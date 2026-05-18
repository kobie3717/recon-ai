export const runtime = 'edge';
export const maxDuration = 60;

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://ui-beta-green.vercel.app,http://localhost:3000,http://localhost:3001').split(',');
  if (origin && !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain') || '';
  const mode = searchParams.get('mode') || 'standard';

  if (!['standard', 'deep', 'person', 'redteam', 'seo', 'bundle'].includes(mode)) {
    return new Response(JSON.stringify({ error: 'invalid mode' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const upstream = await fetch(
      `${process.env.RECON_SERVER_URL || 'http://localhost:3001'}/api/report?domain=${encodeURIComponent(domain)}&mode=${mode}`,
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
