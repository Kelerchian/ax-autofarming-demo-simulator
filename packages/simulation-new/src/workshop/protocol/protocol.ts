import { AppManifest } from "@actyx/sdk";
import { MachineEvent, SwarmProtocol } from "@actyx/machine-runner";
import { Pos } from "../../common/actors";
import * as z from "zod";

export const RequestIdPayload = z.object({ requestId: z.string() });
export const RobotIdPayload = z.object({ robotId: z.string() });
export const PlantIdPayload = z.object({ plantId: z.string() });

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Events {
  export type WaterRequestedPayload = z.TypeOf<
    typeof Events.WaterRequestedPayload
  >;
  export const WaterRequestedPayload =
    Pos.Type.and(RequestIdPayload).and(PlantIdPayload);
  export const WaterRequested = MachineEvent.design("WaterRequested").withZod(
    WaterRequestedPayload
  );

  export const HelpOffered = MachineEvent.design("HelpOffered").withZod(
    Pos.Type.and(RobotIdPayload)
  );

  export const HelpAccepted =
    MachineEvent.design("HelpAccepted").withZod(RobotIdPayload);

  export const WateringDone =
    MachineEvent.design("WateringDone").withoutPayload();

  export const All = [
    WaterRequested,
    HelpOffered,
    HelpAccepted,
    WateringDone,
  ] as const;
}

export const ProtocolName = "WateringRequest" as const;
export const protocol = SwarmProtocol.make("WateringRequest", Events.All);


export const manifest: AppManifest = {
  appId: "com.example.plant-farm",
  displayName: "Plant Farm",
  version: "1.0.0",
};
