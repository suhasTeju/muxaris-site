import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES, NOTIFICATION_KINDS } from "@muxaris/shared";
import {
  displayPhone,
  escapeHtml,
  formatEmailWhen,
  formatWhen,
  renderEmailHtml,
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
        expect(r).not.toHaveProperty("html");
        const html = renderEmailHtml(kind, lang, full);
        expect(html, `${lang}/${kind} html`).toContain("Sunrise Dental");
        expect(html).toContain(`<html lang="${lang}">`);
        expect(html).not.toMatch(/\{[a-z]+\}|undefined|null/);
      }
    }
  });

  it("keeps the text body as it always was: one paragraph, full name, phone as stored", () => {
    const r = renderNotification("appointment_confirmed", "en-IN", vars);
    expect(r.body).toBe(
      "Namaste Ravi Kumar. Your Cleaning with Dr. Rao at Sunrise Dental is booked for Mon, 6 Oct 2026, 11:00 am. To change it, call +918040001234.",
    );
    expect(
      renderNotification("appointment_confirmed", "en-IN", { ...vars, patientName: null }).body,
    ).toMatch(/^Namaste\. Your/);
    expect(renderNotification("appointment_cancelled", "en-IN", vars).body).toMatch(
      / Call the clinic to book again\.$/,
    );
    // The email's own date format and first-name greeting stay out of the text body.
    expect(renderNotification("appointment_confirmed", "en-IN", full).body).toContain(vars.when);
  });

  it("writes the email's sentence as the design does: first name, design date, grouped phone", () => {
    const html = renderEmailHtml("appointment_confirmed", "en-IN", full);
    expect(html).toContain("Namaste Ravi.");
    expect(html).toContain(
      "Your cleaning with Dr. Rao at Sunrise Dental is booked for Fri, 9 Oct 2026, 4:30 pm.",
    );
    expect(html).toContain("To change it, call +91 80 4000 1234.");
    // Without a start time the sentence falls back to the text body's `when`.
    expect(renderEmailHtml("appointment_confirmed", "en-IN", vars)).toContain(
      "booked for Mon, 6 Oct 2026, 11:00 am.",
    );
  });

  it("lowers only common-word service names in the email; brands and other languages keep case", () => {
    const sentence = (serviceName: string, lang: "en-IN" | "hi-IN" = "en-IN") =>
      renderEmailHtml("appointment_confirmed", lang, { ...full, serviceName });
    expect(sentence("Root Canal (RCT)")).toContain("Your root canal (RCT) with");
    expect(sentence("Teeth Cleaning")).toContain("Your teeth cleaning with");
    expect(sentence("Invisalign Consultation")).toContain("Your Invisalign Consultation with");
    expect(sentence("Root Canal (RCT)", "hi-IN")).toContain("Root Canal (RCT)");
    // The text body never changes the name's case.
    expect(
      renderNotification("appointment_confirmed", "en-IN", { ...vars, serviceName: "Root Canal" })
        .body,
    ).toContain("Your Root Canal with");
  });

  it("includes the clinic phone only when present", () => {
    expect(renderNotification("appointment_confirmed", "hi-IN", vars).body).toContain(
      "+918040001234",
    );
    const none = { ...vars, clinicPhone: null };
    expect(renderNotification("appointment_confirmed", "hi-IN", none).body).not.toContain("+91");
    expect(renderEmailHtml("appointment_confirmed", "hi-IN", none)).not.toContain("tel:");
  });

  it("groups Indian numbers for reading and leaves others as stored", () => {
    expect(displayPhone("+918041234567")).toBe("+91 80 4123 4567");
    expect(displayPhone("+919845123210")).toBe("+91 98451 23210");
    expect(displayPhone("+914712345678")).toBe("+914712345678");
    expect(displayPhone("+14155550100")).toBe("+14155550100");
  });

  it("builds the designed email: header, chip, date card, call button and footer", () => {
    const html = renderEmailHtml("appointment_confirmed", "en-IN", full);
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
    const cancelled = renderEmailHtml("appointment_cancelled", "en-IN", full);
    expect(cancelled.match(/text-decoration:line-through/g)).toHaveLength(2);
    expect(cancelled).toContain("background-color:#eef2f6;border-radius:15px 0 0 15px");
    expect(renderEmailHtml("appointment_rescheduled", "en-IN", full)).toContain(
      "border:1px solid #f3dfb8",
    );
    expect(renderEmailHtml("reminder_2h", "en-IN", full)).toContain("Appointment today");
    expect(renderEmailHtml("reminder_24h", "en-IN", full)).not.toContain("line-through");
  });

  it("leaves the date card out without a start time", () => {
    const html = renderEmailHtml("appointment_confirmed", "en-IN", vars);
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
    const html = renderEmailHtml("appointment_confirmed", "en-IN", evil);
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Smile &amp; &quot;Co&quot;");
    expect(html).toContain("Namaste &lt;b&gt;Ravi&lt;/b&gt;.");
    expect(escapeHtml(`<a href='x'>&</a>`)).toBe("&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("formats times in the clinic zone and language", () => {
    const at = new Date("2026-10-06T05:30:00Z");
    // The text body's format is Intl's, as before the redesign.
    expect(formatWhen(at, "Asia/Kolkata", "en-IN")).toBe(
      new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }).format(at),
    );
    expect(formatWhen(at, "Asia/Kolkata", "en-IN")).toMatch(/6 Oct,? 2026/);
    expect(formatWhen(at, "Asia/Kolkata", "hi-IN")).toMatch(/2026/);
    // The email's sentence reads as the design writes it.
    expect(formatEmailWhen(at, "Asia/Kolkata", "en-IN")).toBe("Tue, 6 Oct 2026, 11:00 am");
    expect(formatEmailWhen(new Date("2026-09-10T10:30:00Z"), "Asia/Kolkata", "en-IN")).toBe(
      "Thu, 10 Sep 2026, 4:00 pm",
    );
    expect(formatEmailWhen(at, "Asia/Kolkata", "hi-IN")).toBe(
      formatWhen(at, "Asia/Kolkata", "hi-IN"),
    );
  });

  it("falls back to English for unknown codes", () => {
    expect(templateLanguage("fr-FR")).toBe("en-IN");
    expect(templateLanguage("ta-IN")).toBe("ta-IN");
    expect(templateLanguage(null)).toBe("en-IN");
  });
});
