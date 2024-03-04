import { MachineEvent } from "@actyx/machine-runner";
import { Pos } from "../common/actors";
import * as z from "zod";

export const PlantIdPayload = z.object({ plantId: z.string() });
export const HasTimePayload = z.object({ time: z.number() });

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Events {
  export type WaterRequestedPayload = z.TypeOf<
    typeof Events.WaterRequestedPayload
  >;
  export const WaterRequestedPayload =
    Pos.Type.and(PlantIdPayload).and(HasTimePayload);

  export const WaterRequested = MachineEvent.design("WaterRequested").withZod(
    WaterRequestedPayload
  );

  export const OkNowPayload = PlantIdPayload.and(HasTimePayload);
  export type OkNowPayload = z.TypeOf<typeof Events.OkNowPayload>;
  export const OkNow = MachineEvent.design("OkNow").withZod(
    PlantIdPayload.and(HasTimePayload)
  );
}

export const ProtocolName = "WateringRequest" as const;
