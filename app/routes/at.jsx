// /at - AlternativeTo listing. Short path that hands the visit to the homepage tagged with its source.

import { redirect } from 'react-router';

export function loader() {
  return redirect('/?utm_source=alternativeto&utm_medium=directory', 302);
}
