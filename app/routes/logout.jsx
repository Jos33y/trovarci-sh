/**
 * POST /logout
 *
 * Action-only route. GET requests redirect to home; real logout requires
 * a POST form submission (cross-site forgery protection: a browser will not
 * POST cross-origin without the user's cooperation, and SameSite=Lax on the
 * session cookie further constrains this).
 *
 * The frontend posts to this route via a <Form method="post" action="/logout">
 * button or a programmatic fetcher.submit(null, { method: 'post', action: '/logout' }).
 */

import { redirect } from 'react-router';
import { logoutAction } from '~/actions/logout.server.js';

export const action = logoutAction;

export function loader() {
  return redirect('/');
}
