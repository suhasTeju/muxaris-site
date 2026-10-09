import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { patients } from "@/components/dev/fixtures";
import { PatientsView } from "@/components/app/PatientsView";
import { FixtureApi } from "../_lib/FixtureApi";
import { TZ, param } from "../_data";

/**
 * /dev/core/patients
 *   ?state=empty    a clinic with no patients yet
 *   ?add=1          the Add patient dialog open (Save with a short number shows the phone error)
 *   ?role=front_desk
 * Typing in the search box filters through the in-memory fixture API.
 */
export default async function PatientsPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const list = param(q, "state") === "empty" ? [] : patients;
  return (
    <DevAppFrame role={param(q, "role") === "front_desk" ? "front_desk" : "owner"}>
      <FixtureApi>
        <PatientsView
          initial={list}
          initialTotal={list.length}
          tz={TZ}
          initialAdding={param(q, "add") === "1"}
        />
      </FixtureApi>
    </DevAppFrame>
  );
}
