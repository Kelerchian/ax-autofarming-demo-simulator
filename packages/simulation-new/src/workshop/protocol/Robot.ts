/* eslint-disable @typescript-eslint/no-unused-vars */
import { Events, protocol } from "./protocol";

const machine = protocol.makeMachine("robot");

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace States {
  export const Init = machine
    .designState("Init")
    .withPayload<{ robotId: string }>()
    .finish();

  export const WaterRequested = machine
    .designState("WaterRequested")
    .withPayload<{
      robotId: string;
      plantId: string;
      pos: { x: number; y: number };
      offered: boolean;
    }>()
    .command(
      "offer",
      [Events.HelpOffered],
      (_, robotPos: { x: number; y: number }) => [
        { robotId: _.self.robotId, pos: robotPos },
      ]
    )
    .finish();

  export const HelpAccepted = machine
    .designState("HelpAccepted")
    .withPayload<{
      robotId: string;
      pos: { x: number; y: number };
      assignedRobotId: string;
    }>()
    .command("markAsDone", [Events.WateringDone], () => [{}])
    .finish();

  export const WateringDone = machine.designEmpty("WateringDone").finish();

  export const All = [
    Init,
    WaterRequested,
    HelpAccepted,
    WateringDone,
  ] as const;

  // Reactions
  // =========

  Init.react(
    [Events.WaterRequested],
    States.WaterRequested,
    (ctx, requested) => ({
      ...ctx.self,
      offered: false,
      pos: requested.payload.pos,
      plantId: requested.payload.plantId,
    })
  );

  WaterRequested.react([Events.HelpOffered], WaterRequested, (ctx, e) => ({
    ...ctx.self,
    offered: ctx.self.offered || e.payload.robotId === ctx.self.robotId,
  }));

  WaterRequested.react([Events.HelpAccepted], HelpAccepted, (ctx, e) => ({
    ...ctx.self,
    assignedRobotId: e.payload.robotId,
  }));

  HelpAccepted.react([Events.WateringDone], WateringDone, () => ({}));
}
