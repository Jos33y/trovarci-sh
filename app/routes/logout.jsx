/* POST /logout - action-only, GET redirects home (CSRF guard relies on POST + SameSite=Lax). */

import { redirect } from 'react-router';
import { logoutAction } from '~/actions/logout.server.js';

export const action = logoutAction;

export function loader() {
  return redirect('/');
}
