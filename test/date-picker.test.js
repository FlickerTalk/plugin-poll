// The seam in front of the calendar (plan-plugins-nuevos §12): days chosen in, a change out. Today
// it is cally's `calendar-multi`; if cally does not work with a finger in the phone's frame, plan B
// (`<input type="date">`) replaces this one file and keeps this interface:
//   datePicker({ lang, dir, days, min, today, labels }) → { element, days, setDays(days), onChange(fn) }
// happy-dom draws cally's month but does not run its tap (its context needs a real browser), so
// the tap is simulated the way cally reports it: the calendar's value changes and it fires
// `change`. That a finger really does this on a phone is still to be checked there.
import { afterEach, describe, expect, it } from "vitest";
import { datePicker, firstDayOf } from "../src/date-picker.js";

const LABELS = { previous: "Mes anterior", next: "Mes siguiente" };

afterEach(() => {
  document.body.innerHTML = "";
});

/** What cally does when the user taps days: its value becomes the days, then `change`. */
function tap(picker, value) {
  const calendar = picker.element.querySelector("calendar-multi");
  calendar.value = value;
  calendar.dispatchEvent(new Event("change"));
}

describe("the date picker", () => {
  it("is cally's multi-day calendar with one month, in the phone's language and direction", () => {
    const picker = datePicker({ lang: "es", dir: "ltr", days: ["2026-10-14", "2026-10-12"], min: "2026-10-02", today: "2026-10-02", labels: LABELS });
    document.body.append(picker.element);
    const calendar = picker.element.querySelector("calendar-multi");
    expect(customElements.get("calendar-multi")).toBeDefined();
    expect(calendar.querySelectorAll("calendar-month")).toHaveLength(1);
    expect(calendar.getAttribute("locale")).toBe("es");
    expect(calendar.getAttribute("dir")).toBe("ltr");
    expect(calendar.getAttribute("min")).toBe("2026-10-02");
    expect(calendar.getAttribute("today")).toBe("2026-10-02");
    expect(calendar.getAttribute("focused-date")).toBe("2026-10-12");
    expect(calendar.getAttribute("first-day-of-week")).toBe("1");
    expect(calendar.value).toBe("2026-10-12 2026-10-14");
    expect(picker.days).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("labels the month arrows in the phone's language, and points them the other way in Arabic", () => {
    const ltr = datePicker({ lang: "es", dir: "ltr", labels: LABELS });
    expect(ltr.element.querySelector('[slot="previous"]').getAttribute("aria-label")).toBe("Mes anterior");
    expect(ltr.element.querySelector('[slot="next"]').getAttribute("aria-label")).toBe("Mes siguiente");
    expect(ltr.element.querySelector('[slot="previous"]').textContent).toBe("‹");
    const rtl = datePicker({ lang: "ar", dir: "rtl", labels: LABELS });
    expect(rtl.element.querySelector("calendar-multi").getAttribute("dir")).toBe("rtl");
    expect(rtl.element.querySelector('[slot="previous"]').textContent).toBe("›");
  });

  it("starts the week where the language does", () => {
    expect(firstDayOf("es")).toBe(1);
    expect(firstDayOf("en")).toBe(0);
    expect(firstDayOf("ar")).toBe(6);
    expect(firstDayOf("not a tag!")).toBe(1);
  });

  it("tells the days the user chose, sorted, and only real days", () => {
    const picker = datePicker({ lang: "en", dir: "ltr", labels: LABELS });
    document.body.append(picker.element);
    const heard = [];
    const stop = picker.onChange((days) => heard.push(days));
    tap(picker, "2026-10-20 2026-10-12  nonsense 2026-02-30");
    expect(heard).toEqual([["2026-10-12", "2026-10-20"]]);
    expect(picker.days).toEqual(["2026-10-12", "2026-10-20"]);
    stop();
    tap(picker, "2026-10-12");
    expect(heard).toHaveLength(1);
  });

  it("takes the days from the poll without telling them back as a change", () => {
    const picker = datePicker({ lang: "en", dir: "ltr", labels: LABELS });
    const heard = [];
    picker.onChange((days) => heard.push(days));
    picker.setDays(["2026-11-02", "2026-11-01", "bad"]);
    expect(picker.element.querySelector("calendar-multi").value).toBe("2026-11-01 2026-11-02");
    expect(picker.days).toEqual(["2026-11-01", "2026-11-02"]);
    expect(heard).toEqual([]);
  });
});
