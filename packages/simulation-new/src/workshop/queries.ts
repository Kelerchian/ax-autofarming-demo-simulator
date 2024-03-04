import { Actyx, AqlEventMessage, AqlResponse } from "@actyx/sdk";
import { Events, ProtocolName } from "./protocol";

export const queryPreviouslyAcceptedRequestByRobotId = async (
  actyx: Actyx,
  robotId: string
): Promise<Events.WaterRequestedPayload | undefined> => {
  // TODO: on tab being accidentally closed, restore previously accepted task
  const query = `
      PRAGMA features := subQuery interpolation

      FROM '${ProtocolName}' ORDER DESC
      FILTER _.type = '${Events.WaterRequested.type}'
      
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

      FROM '${ProtocolName}' ORDER DESC 
      FILTER _.type = '${Events.WaterRequested.type}'

      LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER (_.type ?? "") = '${Events.WateringDone.type}' END
      FILTER !IsDefined(done_events[0])

      LET accepted_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER (_.type ?? "") = '${Events.HelpAccepted.type}' END
      FILTER !IsDefined(accepted_events[0])
  `;

  return intoWaterRequests(await actyx.queryAql(query));
};

export const plantNotDoneRequest = async (
  actyx: Actyx,
  plantId: string
): Promise<Events.WaterRequestedPayload | undefined> => {
  const query = `
  PRAGMA features := subQuery interpolation

  FROM '${ProtocolName}' ORDER DESC 
  FILTER _.type = '${Events.WaterRequested.type}' & _.plantId = '${plantId}'

  LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.WateringDone.type}' END

  FILTER !IsDefined(done_events[0])
  `.trim();

  const events = intoWaterRequests(await actyx.queryAql({ query }));
  if (events.length > 1) {
    console.error("something is probably wrong");
  }

  return events.at(0);
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
