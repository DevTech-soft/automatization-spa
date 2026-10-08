import { describe, expect, it } from "vitest";
import { formatTime12h, parseTimeInput } from "../../src/utils/datetime.js";
import { createAgentAppointmentSchema } from "../../src/validators/agent.validator.js";

describe("formatTime12h", () => {
  it.each([
    ["00:00", "12:00 a. m."],
    ["00:15", "12:15 a. m."],
    ["09:05", "9:05 a. m."],
    ["11:59", "11:59 a. m."],
    ["12:00", "12:00 p. m."],
    ["14:30", "2:30 p. m."],
    ["23:45", "11:45 p. m."],
  ])("%s → %s", (input, expected) => {
    expect(formatTime12h(input)).toBe(expected);
  });
});

describe("parseTimeInput", () => {
  it.each([
    ["14:30", "14:30"],
    ["9:00", "09:00"],
    // Sin sufijo se lee como 24 h: "2:30" es de madrugada, no se adivina la tarde.
    ["2:30", "02:30"],
    ["2:30 p. m.", "14:30"],
    ["2:30 P. M.", "14:30"],
    ["2:30pm", "14:30"],
    ["02:30 p.m.", "14:30"],
    ["12:00 p. m.", "12:00"],
    ["12:15 a. m.", "00:15"],
    ["9:05 a.m.", "09:05"],
  ])("%s → %s", (input, expected) => {
    expect(parseTimeInput(input)).toBe(expected);
  });

  it.each(["24:00", "13:00 p. m.", "0:30 a. m.", "dos y media", "2:7 pm", ""])("rechaza %j", (input) => {
    expect(parseTimeInput(input)).toBeNull();
  });

  it("es la inversa de formatTime12h", () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 5) {
      const hhmm = `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
      expect(parseTimeInput(formatTime12h(hhmm))).toBe(hhmm);
    }
  });
});

describe("createAgentAppointmentSchema.startTime", () => {
  const base = {
    businessId: "f07de9b2-7f40-4b15-9f9f-baf78f569e01",
    serviceId: "2b51da99-e5e9-43b3-b228-014345152976",
    date: "2026-10-09",
    customerName: "Ana",
    customerPhone: "573001234567",
  };

  it("normaliza la hora en 12 horas a HH:mm", () => {
    expect(createAgentAppointmentSchema.parse({ ...base, startTime: "3:00 p. m." }).startTime).toBe("15:00");
  });

  it("sigue aceptando HH:mm", () => {
    expect(createAgentAppointmentSchema.parse({ ...base, startTime: "15:00" }).startTime).toBe("15:00");
  });

  it("rechaza una hora inválida", () => {
    expect(createAgentAppointmentSchema.safeParse({ ...base, startTime: "tarde" }).success).toBe(false);
  });
});
