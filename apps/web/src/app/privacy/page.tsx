import type { Metadata } from "next";
import { LegalDoc, Shell } from "@/components/marketing/Shell";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Muxaris handles call audio, transcripts and clinic data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <Shell>
      <LegalDoc title="Privacy Policy" updated={LEGAL_UPDATED}>
        <p>
          Muxaris (“we”, “us”) is operated from Bengaluru, India. We provide an AI voice
          receptionist that answers calls for clinics. This policy explains what data we handle,
          why, and the choices you have. Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Who is who</h2>
        <p>
          The clinic that uses Muxaris decides why and how its patients’ data is used; we process
          that data on the clinic’s behalf to provide the service. Patient data belongs to the
          clinic. For data about clinic staff who use our dashboard, and for people who fill in our
          website forms, we are responsible for that data ourselves.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Call audio and transcripts.</strong> When someone calls a clinic that uses
            Muxaris (or tries it from a browser), we process the audio and a text transcript so the
            assistant can understand and reply.
          </li>
          <li>
            <strong>Booking details.</strong> Name, phone number, the appointment requested and any
            details the caller gives to book it.
          </li>
          <li>
            <strong>Account details.</strong> For clinic staff: name, email and sign-in information,
            handled through Amazon Cognito.
          </li>
          <li>
            <strong>Website forms.</strong> If you request a demo: your name, clinic, city, phone,
            email, specialty and preferred language.
          </li>
        </ul>

        <h2>Consent at the start of the call</h2>
        <p>
          Every call opens with a short note that an AI assistant is answering and that the call may
          be transcribed to provide the service. A caller who does not want this can ask for a
          person.
        </p>

        <h2>How we use it</h2>
        <p>
          Only to provide Muxaris: understanding the caller, booking and changing appointments,
          sending confirmations, showing the clinic its calls and bookings, keeping the service
          secure, and fixing faults. We do not sell personal data. We do not use patient
          conversations for advertising.
        </p>

        <h2>Where it is stored</h2>
        <p>
          Data is stored in Amazon Web Services’ Mumbai region (ap-south-1), in India. Our service
          providers are listed below.
        </p>

        <h2>Service providers</h2>
        <ul>
          <li>
            <strong>Sarvam AI</strong> for speech recognition and speech synthesis.
          </li>
          <li>
            <strong>Amazon Web Services</strong> for hosting, storage, authentication and the Amazon
            Bedrock language models that power the assistant.
          </li>
        </ul>
        <p>
          These providers process data only to deliver their part of the service. We will update
          this list if it changes.
        </p>

        <h2>Retention</h2>
        <p>
          Call transcripts are kept for 90 days by default. Recording storage and retention controls
          arrive with the call-centre release. Bookings and patient records are kept while the
          clinic’s account is active, and deleted or returned after it ends, unless the law requires
          us to keep something longer.
        </p>

        <h2>Your rights and the DPDP Act, 2023</h2>
        <p>
          We design Muxaris to align with India’s Digital Personal Data Protection Act, 2023:
          purpose-limited processing, notice and consent at the start of every call, data kept in
          India, and a clear route to access, correct or erase your data. Because the clinic
          controls patient data, requests from patients are best sent to the clinic; you can also
          write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will pass
          the request on or act on it. If you are unhappy with our response you may complain to the
          Data Protection Board of India once it is operational.
        </p>

        <h2>Cookies</h2>
        <p>
          We use only the cookies needed to sign you in and keep your session. We do not use
          advertising or cross-site tracking cookies.
        </p>

        <h2>Security</h2>
        <p>
          Data is encrypted in transit and at rest, access is limited to people who need it, and
          each clinic’s data is kept separate from other clinics’. No system is perfectly secure; if
          we learn of a breach affecting your data we will tell the affected clinic without undue
          delay.
        </p>

        <h2>Changes</h2>
        <p>
          If we make a material change we will update the date above and notify clinic account
          owners by email.
        </p>
      </LegalDoc>
    </Shell>
  );
}
