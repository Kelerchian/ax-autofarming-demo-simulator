/* eslint-disable @typescript-eslint/no-unused-vars */
import { Actyx } from "@actyx/sdk";
import { Events, Helper, protocol } from "./protocol";
import { sleep } from "systemic-ts-utils/async-utils";
import { Pos } from "../../common/actors";
import { createMachineRunner } from "@actyx/machine-runner";

const machine = protocol.makeMachine("robot");

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace States {
  export const Init = machine
    .designState("Init")
    .withPayload<{ selfId: string }>()
    .finish();

  export const WaterRequested = machine
    .designState("WaterRequested")
    .withPayload<{
      selfId: string;
      pos: { x: number; y: number };
      offered: boolean;
    }>()
    .command(
      "offer",
      [Events.HelpOffered],
      (_, robotPos: { x: number; y: number }) => [
        { robotId: _.self.selfId, pos: robotPos },
      ]
    )
    .finish();

  export const HelpAccepted = machine
    .designState("HelpAccepted")
    .withPayload<{
      selfId: string;
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
    })
  );

  WaterRequested.reactIntoSelf([Events.HelpOffered], (ctx, e) => ({
    ...ctx.self,
    offered: e.payload.robotId === ctx.self.selfId,
  }));

  WaterRequested.react([Events.HelpAccepted], HelpAccepted, (ctx, e) => ({
    ...ctx.self,
    assignedRobotId: e.payload.robotId,
  }));

  HelpAccepted.react([Events.WateringDone], WateringDone, () => ({}));
}

export const main = async (
  actyx: Actyx,
  selfId: () => string,
  pos: () => { x: number; y: number },
  doWateringTask: (pos: { x: number; y: number }) => Promise<unknown>
) => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const task = await waitForRequest(actyx, pos);
    await executeRequest(actyx, selfId, pos, doWateringTask, task);
  }
};

export const waitForRequest = async (
  actyx: Actyx,
  pos: () => { x: number; y: number }
) => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const bestOpenReq = (await Helper.openRequests(actyx))
      .sort((a, b) => Pos.distance(a.pos, pos()) - Pos.distance(b.pos, pos()))
      .at(0);
    if (bestOpenReq) return bestOpenReq;
    await sleep(500);
  }
};

export const executeRequest = async (
  actyx: Actyx,
  selfId: () => string,
  pos: () => { x: number; y: number },
  doWateringTask: (pos: { x: number; y: number }) => Promise<unknown>,
  request: Events.WaterRequestedPayload
) => {
  const machine = createMachineRunner(
    actyx,
    protocol.tagWithEntityId(request.requestId),
    States.Init,
    { selfId: selfId() }
  );

  for await (const state of machine) {
    const requested = state.as(States.WaterRequested);
    if (requested && !requested.payload.offered) {
      await requested.commands()?.offer(pos());
    }

    const accepted = state.as(States.HelpAccepted);
    if (accepted) {
      // if someone else is accepted, exit from the loop
      if (accepted.payload.assignedRobotId !== selfId()) {
        break;
      }

      await doWateringTask(accepted.payload.pos);
      await accepted.commands()?.markAsDone();
      break;
    }
  }
};
