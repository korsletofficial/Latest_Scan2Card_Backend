/**
 * Helper functions for filling missing dates/months/years in statistics
 */

/**
 * Fill missing dates with 0 counts
 * @param data - Array of {_id: date, count: number}
 * @param days - Number of days to fill
 * @returns Array with all dates filled
 */
export function fillMissingDates(data: any[], days: number) {
  const result = [];
  const map = new Map(data.map((item) => [item._id, item.count]));

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    result.push({
      date: dateStr,
      count: map.get(dateStr) || 0,
    });
  }
  return result;
}

/**
 * Fill missing months with 0 counts
 * @param data - Array of {_id: month, count: number}
 * @param months - Number of months to fill
 * @returns Array with all months filled
 */
export function fillMissingMonths(data: any[], months: number) {
  const result = [];
  const map = new Map(data.map((item) => [item._id, item.count]));

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
    result.push({
      month: monthStr,
      count: map.get(monthStr) || 0,
    });
  }
  return result;
}

/**
 * Fill missing years with 0 counts
 * @param data - Array of {_id: year, count: number}
 * @param years - Number of years to fill
 * @returns Array with all years filled
 */
export function fillMissingYears(data: any[], years: number) {
  const result = [];
  const map = new Map(data.map((item) => [item._id, item.count]));
  const currentYear = new Date().getFullYear();

  for (let i = years - 1; i >= 0; i--) {
    const year = currentYear - i;
    result.push({
      year: year.toString(),
      count: map.get(year.toString()) || 0,
    });
  }
  return result;
}
