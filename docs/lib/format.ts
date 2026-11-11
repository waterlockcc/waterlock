// Post dates are ISO strings in UTC ("2026-11-11T00:00:00.000Z").
// Formatting in UTC keeps them on that day for readers west of UTC.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export const formatDate = (date: string) => dateFormat.format(new Date(date));
