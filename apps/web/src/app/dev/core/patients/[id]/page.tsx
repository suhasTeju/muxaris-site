import { notFound } from "next/navigation";
import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { doctors, services } from "@/components/dev/fixtures";
import { PatientDetailView } from "@/components/app/PatientDetailView";
import { FixtureApi } from "../../_lib/FixtureApi";
import { TZ, param, patientDetail } from "../../_data";

/**
 * /dev/core/patients/p1    Ananya Krishnan: visits, a call, messages ("Show number" reveals)
 * /dev/core/patients/p10   unnamed patient with no email, date of birth or messages
 * /dev/core/patients/p3    no calls
 * /dev/core/patients/p2    a failed confirmation with Retry
 *   ?edit=1   the inline editor open
 */
export default async function PatientPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const data = patientDetail(id);
  if (!data) notFound();
  return (
    <DevAppFrame role={param(q, "role") === "front_desk" ? "front_desk" : "owner"}>
      <FixtureApi>
        <PatientDetailView
          key={id}
          detail={data.detail}
          doctors={doctors}
          services={services}
          notifications={data.notifications}
          tz={TZ}
          initialEditing={param(q, "edit") === "1"}
        />
      </FixtureApi>
    </DevAppFrame>
  );
}
