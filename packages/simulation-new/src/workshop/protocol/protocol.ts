import { Actyx, AppManifest, AqlEventMessage } from "@actyx/sdk";
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

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Helper {
  export const openRequests = (
    actyx: Actyx
  ): Promise<Events.WaterRequestedPayload[]> =>
    actyx
      .queryAql({
        query: `
      PRAGMA features := subQuery interpolation

      FROM '${ProtocolName}' ORDER DESC FILTER _.type = '${Events.WaterRequested.type}'

      LET accepted_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.HelpAccepted.type}' END ?? []
      LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.WateringDone.type}' END ?? []

      FILTER !IsDefined(accepted_events[0]) & !IsDefined(done_events[0])
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

  export const plantNotDoneRequest = async (
    actyx: Actyx,
    plantId: string
  ): Promise<Events.WaterRequestedPayload | undefined> => {
    const query = `
    PRAGMA features := subQuery interpolation

    FROM '${ProtocolName}' ORDER DESC FILTER _.plantId = '${plantId}' & _.type = '${Events.WaterRequested.type}'

    LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.WateringDone.type}' END ?? []

    FILTER !IsDefined(done_events[0])
    `.trim();
    return actyx
      .queryAql({ query })
      .then((aqlMessages): Events.WaterRequestedPayload | undefined => {
        const events = aqlMessages.filter(
          (event): event is AqlEventMessage => event.type === "event"
        );
        if (events.length === 0) {
          return undefined;
        }
        if (events.length > 1) {
          console.log("something is probably wrong");
        }
        return events
          .map((event) => {
            const parsed = Events.WaterRequestedPayload.safeParse(
              event.payload
            );
            if (parsed.success) return parsed.data;
            return null;
          })
          .filter((x): x is Events.WaterRequestedPayload => x !== null)[0];
      });
  };
}

export const manifest: AppManifest = {
  appId: "com.example.plant-farm",
  displayName: "Plant Farm",
  version: "1.0.0",
};
