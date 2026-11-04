// /download - moved to /sender, where Trovarcis Sender is described and sold.

import { redirect } from 'react-router';

export function loader() {
  return redirect('/sender', 301);
}
