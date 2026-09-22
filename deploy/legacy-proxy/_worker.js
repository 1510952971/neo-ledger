const TARGET_ORIGIN = 'https://ledger.eyeme.online';

export default {
  async fetch(request) {
    const source = new URL(request.url);
    const target = new URL(source.pathname + source.search, TARGET_ORIGIN);
    const acceptsHtml = (request.headers.get('accept') || '').includes('text/html');

    // Move browser and existing native WebViews to the canonical origin.
    if ((request.method === 'GET' || request.method === 'HEAD') && acceptsHtml) {
      return Response.redirect(target.toString(), 307);
    }

    // Existing installed integrations may keep calling the Pages API URL.
    // Forward those calls to the single database without exposing credentials.
    const headers = new Headers(request.headers);
    headers.delete('host');
    const origin = headers.get('origin');
    if (origin === source.origin) headers.set('origin', TARGET_ORIGIN);
    const referer = headers.get('referer');
    if (referer?.startsWith(`${source.origin}/`)) {
      headers.set('referer', TARGET_ORIGIN + referer.slice(source.origin.length));
    }
    const upstream = new Request(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
      redirect: 'manual',
    });
    const response = await fetch(upstream);
    return new Response(response.body, response);
  },
};
