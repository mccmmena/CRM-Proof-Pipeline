import { DateTime } from "luxon";

export default {
  name: "Calculate Minutes Until 1 Hour Before",
  version: "0.0.2",
  key: "utils-minutes-until-pre-hour",
  description: "Calculates the number of minutes remaining until 1 hour before the specified target time, handling timezones correctly.",
  type: "action",
  props: {
    targetTime: {
      type: "string",
      label: "Target Time",
      description: "ISO 8601 date string, e.g. 2025-12-22T17:25:00. If no timezone is specified in the string, the Timezone prop will be applied.",
    },
    timezone: {
      type: "string",
      label: "Timezone",
      description: "IANA timezone identifier (e.g. America/New_York) to use if the target time doesn't specify one.",
      default: "America/New_York",
    },
  },
  async run({ $ }) {
    // Parse the input time. 
    // fromISO will use the specified zone if the input string doesn't contain an offset.
    // If the input string DOES contain an offset, that offset takes precedence unless we set setZone later,
    // but here we want to interpret the "raw" time as being in the target timezone if ambiguous.
    let target = DateTime.fromISO(this.targetTime, { zone: this.timezone });

    if (!target.isValid) {
      throw new Error(`Invalid date format: ${this.targetTime} (${target.invalidReason})`);
    }

    // Subtract 1 hour
    const oneHourBefore = target.minus({ hours: 1 });
    
    // Get current time in the same timezone for accurate comparison (though diff is absolute)
    const now = DateTime.now().setZone(this.timezone);
    
    // Calculate difference in minutes
    const diffMinutes = oneHourBefore.diff(now, "minutes").minutes;
    const roundedMinutes = Math.round(diffMinutes);

    $.export("$summary", `Calculated ${roundedMinutes} minutes from ${now.toISO()} until ${oneHourBefore.toISO()}`);
    
    return roundedMinutes;
  },
};
