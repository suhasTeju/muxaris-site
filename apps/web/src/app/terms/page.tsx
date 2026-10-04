import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Shell } from "@/components/marketing/Shell";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Muxaris, including the pilot programme.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <Shell>
      <LegalDoc title="Terms of Service" updated={LEGAL_UPDATED}>
        <p>
          These terms are between Muxaris, Bengaluru, India (“Muxaris”, “we”) and the clinic or
          business that signs up (“you”). By creating an account or using Muxaris you agree to them.
          Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>The service</h2>
        <p>
          Muxaris is an AI voice receptionist: it answers calls, books and changes appointments in
          your calendar, and shows them on your dashboard. You configure your doctors, services,
          hours and the information the assistant may share.
        </p>

        <h2>Pilot</h2>
        <p>
          The pilot is free for 30 days, limited to the first 10 Bengaluru clinics and up to 500
          calls. It is offered so we can learn from real use. During the pilot features may change
          and we may ask for feedback. At the end you can move to a paid plan or stop; we will not
          charge you without your agreement, and you can export your data.
        </p>

        <h2>Acceptable use</h2>
        <ul>
          <li>Use Muxaris only for lawful clinic communication.</li>
          <li>Do not use it to harass, deceive or spam callers, or to impersonate others.</li>
          <li>Do not attempt to disrupt, reverse-engineer or overload the service.</li>
          <li>
            You are responsible for having a lawful basis to handle your patients’ data and for
            telling callers that calls are handled by an AI assistant and may be transcribed.
          </li>
        </ul>

        <h2>No medical advice</h2>
        <p>
          Muxaris is a scheduling and information assistant. It does not diagnose, prescribe or give
          medical advice, and its answers must not be relied on as such. Calls that sound like
          emergencies are transferred to your staff; you must keep the transfer number current and
          staffed. In an emergency, callers should contact emergency services.
        </p>

        <h2>Availability</h2>
        <p>
          We work to keep Muxaris available but do not promise uninterrupted service. Speech
          recognition and language models can make mistakes; you are responsible for reviewing
          bookings. We will tell you about planned maintenance when we can.
        </p>

        <h2>Fees and billing</h2>
        <p>
          Paid plans are priced in Indian rupees (INR) as shown on our pricing page, billed monthly.
          GST is added where applicable. Usage beyond the included call-minutes is billed at the
          per-minute rate agreed with you in advance. Fees are non-refundable for periods already
          started, except where the law says otherwise.
        </p>

        <h2>Your data</h2>
        <p>
          You own your clinic and patient data. You give us permission to process it only to provide
          the service, as described in our <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>Termination</h2>
        <p>
          You can stop using Muxaris and cancel at any time, effective at the end of the billing
          month. We may suspend or end your account for serious breach of these terms, after notice
          where practical. On ending, we will delete your data in line with our Privacy Policy,
          after giving you the chance to export it.
        </p>

        <h2>Liability</h2>
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses, and
          our total liability is limited to the fees you paid us in the three months before the
          claim. Nothing here limits liability that cannot be limited by law.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of India. The courts at Bengaluru, Karnataka have
          exclusive jurisdiction.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms. We will give account owners reasonable notice by email of
          material changes before they apply.
        </p>
      </LegalDoc>
    </Shell>
  );
}
