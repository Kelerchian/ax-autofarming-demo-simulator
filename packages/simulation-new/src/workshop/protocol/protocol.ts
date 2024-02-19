import { Actyx, AppManifest, AqlEventMessage } from "@actyx/sdk";
import { MachineEvent, SwarmProtocol } from "@actyx/machine-runner";
import { Pos } from "../../common/actors";
import * as z from "zod";

export const RequestIdPayload = z.object({ requestId: z.string() });
export const RobotIdPayload = z.object({ robotId: z.string() });

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Events {
  export type WaterRequestedPayload = z.TypeOf<
    typeof Events.WaterRequestedPayload
  >;
  export const WaterRequestedPayload = Pos.Type.and(RequestIdPayload);
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

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Helper {
  export const openRequests = (
    actyx: Actyx
  ): Promise<Events.WaterRequestedPayload[]> =>
    actyx
      .queryAql({
        query: `
          FROM '${ProtocolName}' ORDER DESC
          FILTER _.type = '${Events.HelpAccepted.type}'
          LET done_events = FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.WateringDone.type}' END ?? []
          LET is_done = isDefined(done_events[0])
          FILTER !is_done
          `.trim(),
      })
      .then((events): Events.WaterRequestedPayload[] =>
        events
          .filter((event): event is AqlEventMessage => event.type === "event")
          .map((event) => {
            const parsed = Events.WaterRequestedPayload.safeParse(
              event.payload
            );
            if (parsed.success) return parsed.data;
            return null;
          })
          .filter((x): x is Events.WaterRequestedPayload => x !== null)
      );
}

export const manifest: AppManifest = {
  appId: "com.example.plant-farm",
  displayName: "Plant Farm",
  version: "1.0.0",
};
