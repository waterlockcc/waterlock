// Post dates are calendar days ("2026-11-11"), parsed as UTC midnight.
// Formatting in UTC keeps them on that day for readers west of UTC.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export const formatDate = (date: string) => dateFormat.format(new Date(date));
