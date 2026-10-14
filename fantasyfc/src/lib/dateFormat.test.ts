import { describe, expect, it } from "vitest";
import { formatCountdown, formatKickoff } from "./dateFormat";

describe("formatKickoff", () => {
  it("formats a kickoff as weekday, month, day and 12-hour time", () => {
    expect(
      formatKickoff("2026-10-10T13:30:00Z", {
        locale: "en-US",
        timeZone: "UTC",
      }),
    ).toBe("Sat, Oct 10, 01:30 PM");
  });

  it("renders the timestamp in the given time zone, not UTC", () => {
    expect(
      formatKickoff("2026-10-10T13:30:00Z", {
        locale: "en-US",
        timeZone: "Africa/Johannesburg",
      }),
    ).toBe("Sat, Oct 10, 03:30 PM");
  });

  it("returns the fallback when a fixture has no confirmed kickoff", () => {
    expect(formatKickoff(null)).toBe("Kickoff TBC");
    expect(formatKickoff(null, { fallback: "TBC" })).toBe("TBC");
  });

  it("returns the fallback rather than 'Invalid Date' for junk input", () => {
    expect(formatKickoff("not-a-date", { fallback: "TBC" })).toBe("TBC");
  });
});

describe("formatCountdown", () => {
  const now = Date.parse("2026-10-10T00:00:00Z");

  it("shows days, hours and minutes when more than a day away", () => {
    expect(formatCountdown("2026-10-12T03:04:05Z", now)).toBe("2d 03h 04m");
  });

  it("drops to hours, minutes and seconds inside a day", () => {
    expect(formatCountdown("2026-10-10T05:06:07Z", now)).toBe("5h 06m 07s");
  });

  it("drops to minutes and seconds inside an hour", () => {
    expect(formatCountdown("2026-10-10T00:09:08Z", now)).toBe("9m 08s");
  });

  it("shows seconds alone in the last minute", () => {
    expect(formatCountdown("2026-10-10T00:00:45Z", now)).toBe("45s");
  });

  it("says Underway at the deadline itself, not '0s'", () => {
    expect(formatCountdown("2026-10-10T00:00:00Z", now)).toBe("Underway");
  });

  it("says Underway once the deadline has passed", () => {
    expect(formatCountdown("2026-10-09T23:00:00Z", now)).toBe("Underway");
  });
});
