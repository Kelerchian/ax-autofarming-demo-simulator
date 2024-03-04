/* eslint-disable @typescript-eslint/no-unused-vars */
import { sleep } from "systemic-ts-utils/async-utils";
import { Events, protocol } from "./protocol";
import * as Queries from "./queries";
import { createMachineRunner } from "@actyx/machine-runner";
import { Pos } from "../common/actors";
import { RobotCoordinationCode, RobotExposedInterface } from "../actors/Robot";

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
      plantId: string;
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

const bidAndWater = async (
  { actyx, getPosition, getId, waterPlant }: RobotExposedInterface,
  request: Events.WaterRequestedPayload
) => {
  const machine = createMachineRunner(
    actyx,
    protocol.tagWithEntityId(request.requestId),
    States.Init,
    { robotId: getId() }
  );

  for await (const state of machine) {
    // nothing is happening???
    const requested = state.as(States.WaterRequested);
    if (requested && !requested.payload.offered) {
      await requested.commands()?.offer(getPosition());
    }

    const accepted = state.as(States.HelpAccepted);
    if (accepted) {
      // if other robot is accepted, exit
      if (accepted.payload.assignedRobotId !== getId()) {
        break;
      }

      await waterPlant({
        id: accepted.payload.plantId,
        pos: accepted.payload.pos,
      });
      await accepted.commands()?.markAsDone();
      break;
    }
  }
};

const pickRequest = async ({
  actyx,
  getId,
  getPosition,
}: RobotExposedInterface) => {
  const previousOpenRequest =
    await Queries.queryPreviouslyAcceptedRequestByRobotId(actyx, getId());

  if (previousOpenRequest) return previousOpenRequest;

  let closest: Events.WaterRequestedPayload | undefined = undefined;

  const requests = await Queries.queryOpenRequest(actyx);
  requests.forEach((request) => {
    const distanceFromRequest = Pos.distance(getPosition(), request.pos);
    const distanceFromCurrentClosest = closest
      ? Pos.distance(getPosition(), closest.pos)
      : Infinity;

    if (distanceFromRequest < distanceFromCurrentClosest) {
      closest = request;
    }
  });
  return closest;
};

export const robotCoordinationCode: RobotCoordinationCode = async (params) => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(50);
    try {
      const request = await pickRequest(params);
      if (request) {
        await bidAndWater(params, request);
      }
    } catch (error) {
      console.error(error);
    }
  }
};
