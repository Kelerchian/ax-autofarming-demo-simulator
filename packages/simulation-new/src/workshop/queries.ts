import { Actyx, AqlEventMessage, AqlResponse } from "@actyx/sdk";
import { Events, ProtocolName } from "./protocol";

export const queryUnderwatered = async (
  actyx: Actyx
): Promise<Events.WaterRequestedPayload[]> => {
  const query = `
      PRAGMA features := subQuery interpolation

      FROM '${ProtocolName}' ORDER DESC
      FILTER _.type = '${Events.WaterRequested.type}'
      
      LET this_time := _.time

      LET ok_events := FROM '${ProtocolName}' FILTER (_.type ?? "") != '${Events.OkNow.type}' & (_.time ?? 0) > this_time  END ?? []
      LET is_not_ok := IsDefined(ok_events)
      
      FILTER is_not_ok
  `;

  return intoWaterRequests(await actyx.queryAql(query));
};

export const publishWaterRequest = (
  actyx: Actyx,
  payload: Events.WaterRequestedPayload
) =>
  actyx.publish({
    tags: [ProtocolName],
    event: Events.WaterRequested.make(payload),
  });

export const publishWaterOk = (actyx: Actyx, payload: Events.OkNowPayload) =>
  actyx.publish({
    tags: [ProtocolName],
    event: Events.OkNow.make(payload),
  });

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
