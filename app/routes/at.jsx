// /at - AlternativeTo listing. Short path so directory clicks are attributable without referrer_domain.

import { redirect } from 'react-router';

export function loader() {
  return redirect('/', 302);
}
