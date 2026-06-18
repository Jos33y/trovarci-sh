/**
 * Logout action.
 *
 * Revokes the current session server-side, then clears the cookie on the
 * client. Both steps matter: clearing the cookie without revoking would let
 * a stolen cookie keep working; revoking without clearing would force the
 * user to re-authenticate but leave a dead cookie on their machine.
 */

import { redirect } from 'react-router';
import {
  parseSessionCookie,
  revokeSession,
  clearSessionCookie,
} from '~/utils/session.server.js';

export async function logoutAction({ request }) {
  const token = parseSessionCookie(request.headers.get('Cookie'));
  if (token) {
    await revokeSession(token);
  }

  throw redirect('/', {
    headers: { 'Set-Cookie': clearSessionCookie() },
  });
}
