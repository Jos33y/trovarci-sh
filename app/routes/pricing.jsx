// /pricing - old URL still known to Google. Permanent redirect to the Credits page.

import { redirect } from 'react-router';

export function loader() {
  return redirect('/credits', 301);
}
