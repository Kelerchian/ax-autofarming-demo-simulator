import { Actyx, AppManifest, AqlEventMessage, AqlResponse } from "@actyx/sdk";
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

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Queries {
  export const queryPreviouslyAcceptedRequestByRobotId = async (
    actyx: Actyx,
    robotId: string
  ): Promise<Events.WaterRequestedPayload | undefined> => {
    // TODO: on tab being accidentally closed, restore previously accepted task
    const query = `
        PRAGMA features := subQuery interpolation

        FROM '${ProtocolName}' ORDER DESC FILTER _.type = '${Events.WaterRequested.type}'
        
        LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER (_.type ?? "") = '${Events.WateringDone.type}' END
        FILTER !IsDefined(done_events[0])
        
        LET accepted_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER (_.type ?? "") = '${Events.HelpAccepted.type}' FILTER (_.robotId ?? "") = '${robotId}' END
        FILTER IsDefined(accepted_events[0])
    `;

    return intoWaterRequests(await actyx.queryAql(query)).at(0);
  };

  export const queryOpenRequest = async (
    actyx: Actyx
  ): Promise<Events.WaterRequestedPayload[]> => {
    const query = `
        PRAGMA features := subQuery interpolation

        FROM '${ProtocolName}' ORDER DESC FILTER _.type = '${Events.WaterRequested.type}'

        LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER (_.type ?? "") = '${Events.WateringDone.type}' END
        FILTER !IsDefined(done_events[0])

        LET accepted_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER (_.type ?? "") = '${Events.HelpAccepted.type}' END
        FILTER IsDefined(accepted_events[0])
    `;

    return intoWaterRequests(await actyx.queryAql(query));
  };

  export const intoWaterRequests = (
    arr: AqlResponse[]
  ): Events.WaterRequestedPayload[] =>
    arr
      .filter((e): e is AqlEventMessage => e.type === "event")
      .map((e) => {
        const parsed = Events.WaterRequestedPayload.safeParse(e.payload);
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter((p): p is Events.WaterRequestedPayload => p !== null);
}

export const ProtocolName = "WateringRequest" as const;
export const protocol = SwarmProtocol.make("WateringRequest", Events.All);

export const manifest: AppManifest = {
  appId: "com.example.plant-farm",
  displayName: "Plant Farm",
  version: "1.0.0",
};
