import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES, NOTIFICATION_KINDS } from "@muxaris/shared";
import {
  displayPhone,
  escapeHtml,
  formatWhen,
  renderNotification,
  templateLanguage,
  type TemplateVars,
} from "./templates.js";

const vars: TemplateVars = {
  patientName: "Ravi Kumar",
  clinicName: "Sunrise Dental",
  doctorName: "Dr. Rao",
  serviceName: "Cleaning",
  when: "Mon, 6 Oct 2026, 11:00 am",
  clinicPhone: "+918040001234",
};

const full: TemplateVars = {
  ...vars,
  startsAt: new Date("2026-10-09T11:00:00Z"),
  timezone: "Asia/Kolkata",
  clinicAddress: "41, 9th Block, Jayanagar, Bengaluru",
  clinicCity: "Bengaluru",
};

describe("notification templates", () => {
  it("renders every kind in every language with the variables filled", () => {
    for (const lang of LANGUAGE_CODES) {
      for (const kind of NOTIFICATION_KINDS) {
        const r = renderNotification(kind, lang, full);
        expect(r.subject.length, `${lang}/${kind} subject`).toBeGreaterThan(5);
        expect(r.body, `${lang}/${kind} body`).toContain("Sunrise Dental");
        expect(r.body).toContain(vars.when);
        expect(r.body).not.toMatch(/\{[a-z]+\}/);
        expect(r.subject).not.toMatch(/\{[a-z]+\}/);
        // subjects never carry the patient's name
        expect(r.subject).not.toContain("Ravi");
        expect(r.html, `${lang}/${kind} html`).toContain("Sunrise Dental");
        expect(r.html).toContain(`<html lang="${lang}">`);
        expect(r.html).not.toMatch(/\{[a-z]+\}|undefined|null/);
      }
    }
  });

  it("writes the text body as three paragraphs, greeting by first name", () => {
    const r = renderNotification("appointment_confirmed", "en-IN", vars);
    expect(r.body).toBe(
      "Namaste Ravi.\n\nYour cleaning with Dr. Rao at Sunrise Dental is booked for Mon, 6 Oct 2026, 11:00 am.\n\nTo change it, call +91 80 4000 1234.",
    );
    expect(
      renderNotification("appointment_confirmed", "en-IN", { ...vars, patientName: null }).body,
    ).toMatch(/^Namaste\.\n\n/);
    expect(renderNotification("appointment_cancelled", "en-IN", vars).body).toMatch(
      /\n\nCall the clinic to book again\.$/,
    );
  });

  it("keeps acronyms in an English service name and leaves other languages' names alone", () => {
    const rct = { ...vars, serviceName: "Root Canal (RCT)" };
    expect(renderNotification("appointment_confirmed", "en-IN", rct).body).toContain(
      "Your root canal (RCT) with",
    );
    expect(renderNotification("appointment_confirmed", "hi-IN", rct).body).toContain(
      "Root Canal (RCT)",
    );
  });

  it("includes the clinic phone only when present", () => {
    expect(renderNotification("appointment_confirmed", "hi-IN", vars).body).toContain(
      "+91 80 4000 1234",
    );
    const none = renderNotification("appointment_confirmed", "hi-IN", {
      ...vars,
      clinicPhone: null,
    });
    expect(none.body).not.toContain("+91");
    expect(none.html).not.toContain("tel:");
  });

  it("groups Indian numbers for reading and leaves others as stored", () => {
    expect(displayPhone("+918041234567")).toBe("+91 80 4123 4567");
    expect(displayPhone("+919845123210")).toBe("+91 98451 23210");
    expect(displayPhone("+914712345678")).toBe("+914712345678");
    expect(displayPhone("+14155550100")).toBe("+14155550100");
  });

  it("builds the designed email: header, chip, date card, call button and footer", () => {
    const { html } = renderNotification("appointment_confirmed", "en-IN", full);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("JAYANAGAR · BENGALURU");
    expect(html).toContain("Appointment confirmed</td>");
    expect(html).toContain("Namaste Ravi.");
    expect(html).toContain(">OCT<");
    expect(html).toContain(">9<");
    expect(html).toContain(">FRI<");
    expect(html).toContain(">4:30 pm<");
    expect(html).toContain("Cleaning with Dr. Rao");
    expect(html).toContain('href="tel:+918040001234"');
    expect(html).toContain("+91 80 4000 1234</a>");
    expect(html).toContain("Sunrise Dental · 41, 9th Block, Jayanagar, Bengaluru");
    expect(html).toContain("Sent with");
    // Email-safe: tables and inline styles, no stylesheet, no classes, no scripts, no images.
    expect(html).toContain('role="presentation"');
    // Fluid single column: full width on a phone, the design's 560px on a desktop client.
    expect(html).toContain("width:100%;max-width:560px;");
    expect(html).not.toMatch(/<style|class=|<script|<img|<link/);
  });

  it("strikes the time through on a cancellation and colours the card per kind", () => {
    const cancelled = renderNotification("appointment_cancelled", "en-IN", full).html;
    expect(cancelled.match(/text-decoration:line-through/g)).toHaveLength(2);
    expect(cancelled).toContain("background-color:#eef2f6;border-radius:15px 0 0 15px");
    expect(renderNotification("appointment_rescheduled", "en-IN", full).html).toContain(
      "border:1px solid #f3dfb8",
    );
    expect(renderNotification("reminder_2h", "en-IN", full).html).toContain("Appointment today");
    expect(renderNotification("reminder_24h", "en-IN", full).html).not.toContain("line-through");
  });

  it("leaves the date card out without a start time", () => {
    const { html } = renderNotification("appointment_confirmed", "en-IN", vars);
    expect(html).not.toContain(">OCT<");
    expect(html).toContain("Namaste Ravi.");
  });

  it("escapes every value it prints", () => {
    const evil = {
      ...full,
      patientName: "<b>Ravi</b>",
      clinicName: 'Smile & "Co"',
      clinicAddress: "<script>x</script>, Bengaluru",
    };
    const { html } = renderNotification("appointment_confirmed", "en-IN", evil);
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Smile &amp; &quot;Co&quot;");
    expect(html).toContain("Namaste &lt;b&gt;Ravi&lt;/b&gt;.");
    expect(escapeHtml(`<a href='x'>&</a>`)).toBe("&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("formats times in the clinic zone and language", () => {
    const at = new Date("2026-10-06T05:30:00Z");
    expect(formatWhen(at, "Asia/Kolkata", "en-IN")).toBe("Tue, 6 Oct 2026, 11:00 am");
    expect(formatWhen(new Date("2026-09-10T10:30:00Z"), "Asia/Kolkata", "en-IN")).toBe(
      "Thu, 10 Sep 2026, 4:00 pm",
    );
    expect(formatWhen(at, "Asia/Kolkata", "hi-IN")).toMatch(/2026/);
  });

  it("falls back to English for unknown codes", () => {
    expect(templateLanguage("fr-FR")).toBe("en-IN");
    expect(templateLanguage("ta-IN")).toBe("ta-IN");
    expect(templateLanguage(null)).toBe("en-IN");
  });
});
