/**
 * Format a date string into a readable format.
 * "2026-03-15" -> "March 15, 2026"
 */
export function formatDate(dateString) {
  if (!dateString) return "";
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const [year, month, day] = dateString.split("-");
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

/**
 * Format a date string into a short format.
 * "2026-03-15" -> "Mar 15, 2026"
 */
export function formatDateShort(dateString) {
  if (!dateString) return "";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const [year, month, day] = dateString.split("-");
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}
