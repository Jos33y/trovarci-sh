// Catch-all route — handles any URL that doesn't match a defined route.
// Returns a clean 404 instead of spamming the console with stack traces.

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export default function CatchAll() {
  return null;
}
