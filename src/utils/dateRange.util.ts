/**
 * Helper function to get UTC date from timezone-specific date
 */
function getUTCDateFromTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string
): Date {
  // Create a date string in ISO format
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;

  // Parse this as if it were a local date in server's timezone
  const localDate = new Date(dateStr);

  // Get what this date would be in the target timezone
  const targetDate = new Date(localDate.toLocaleString("en-US", { timeZone }));

  // Calculate the offset between them
  const offset = localDate.getTime() - targetDate.getTime();

  // Create a UTC date that represents this time in the user's timezone
  return new Date(localDate.getTime() + offset);
}

/**
 * Get date ranges based on period and timezone
 * Handles timezone conversion properly for accurate filtering
 *
 * @param period - "today" | "weekly" | "earlier"
 * @param timeZone - User's timezone (e.g., "Asia/Kolkata" for India)
 * @returns MongoDB date query object
 */
export const getDateRangesByPeriod = (
  period: "today" | "weekly" | "earlier",
  timeZone: string = "Asia/Kolkata"
) => {
  // Get current time
  const now = new Date();

  // Get the current date components in user's timezone using Intl API
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value);
  const day = parseInt(parts.find((p) => p.type === "day")!.value);

  // Get start of today (00:00:00.000) in user's timezone as UTC
  const startOfTodayUTC = getUTCDateFromTimezone(year, month, day, 0, 0, 0, 0, timeZone);

  // Get end of today (23:59:59.999) in user's timezone as UTC
  const endOfTodayUTC = getUTCDateFromTimezone(year, month, day, 23, 59, 59, 999, timeZone);

  // Calculate start of week (Monday) in user's timezone
  const tempDate = new Date(year, month - 1, day);
  const dayOfWeek = tempDate.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekMonday = new Date(year, month - 1, day + daysToMonday);
  const startOfWeekUTC = getUTCDateFromTimezone(
    weekMonday.getFullYear(),
    weekMonday.getMonth() + 1,
    weekMonday.getDate(),
    0,
    0,
    0,
    0,
    timeZone
  );

  console.log(`[DateRange] Timezone: ${timeZone}, Period: ${period}`);
  console.log(`[DateRange] User date: ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  console.log(`[DateRange] Start of today UTC: ${startOfTodayUTC.toISOString()}`);
  console.log(`[DateRange] End of today UTC: ${endOfTodayUTC.toISOString()}`);
  console.log(`[DateRange] Start of week UTC: ${startOfWeekUTC.toISOString()}`);

  switch (period) {
    case "today":
      // Leads created today (in user's timezone)
      return {
        $gte: startOfTodayUTC,
        $lte: endOfTodayUTC,
      };

    case "weekly":
      // Leads created this week excluding today (in user's timezone)
      return {
        $gte: startOfWeekUTC,
        $lt: startOfTodayUTC,
      };

    case "earlier":
      // Leads created before this week (in user's timezone)
      return {
        $lt: startOfWeekUTC,
      };

    default:
      return {};
  }
};
