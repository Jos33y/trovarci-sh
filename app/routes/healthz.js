// GET /healthz - liveness probe for Coolify. Answers once the server is up; checks nothing else.

export function loader() {
  return new Response('ok', {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}
