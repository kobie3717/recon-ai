export async function POST(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 2 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'payload too large' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }
  const body = await request.json();

  try {
    const upstream = await fetch(
      `${process.env.RECON_SERVER_URL || 'http://localhost:3001'}/api/save-report`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: upstream.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Save proxy error:', error);
    return new Response(JSON.stringify({ error: 'Failed to save report' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
