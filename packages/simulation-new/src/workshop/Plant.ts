/* eslint-disable @typescript-eslint/no-unused-vars */
import { sleep } from "systemic-ts-utils/async-utils";
import { Events, protocol } from "./protocol";
import { createMachineRunner } from "@actyx/machine-runner";
import { Actyx } from "@actyx/sdk";
import { Pos } from "../common/actors";
import { v4 as v4 } from "uuid";
import { plantNotDoneRequest } from "./queries";
import { PlantCoordinationCode } from "../actors/Plant";

const machine = protocol.makeMachine("plant");

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace States {
  export const Init = machine
    .designState("Init")
    .withPayload<{
      requestId: string;
      pos: { x: number; y: number };
      plantId: string;
    }>()
    .command("request", [Events.WaterRequested], (_) => [
      { pos: _.self.pos, requestId: _.self.requestId, plantId: _.self.plantId },
    ])
    .finish();

  type Offer = {
    robot: string;
    pos: { x: number; y: number };
  };
  export const WaterRequested = machine
    .designState("WaterRequested")
    .withPayload<{ offers: Offer[] }>()
    .command("accept", [Events.HelpAccepted], (_, robotId: string) => [
      { robotId },
    ])
    .finish();

  export const HelpAccepted = machine.designEmpty("HelpAccepted").finish();

  export const WateringDone = machine.designEmpty("WateringDone").finish();

  export const All = [
    Init,
    WaterRequested,
    HelpAccepted,
    WateringDone,
  ] as const;

  // Reactions
  // =========

  Init.react([Events.WaterRequested], WaterRequested, (ctx) => ({
    ...ctx.self,
    offers: [],
  }));

  WaterRequested.react([Events.HelpOffered], WaterRequested, (ctx, e) => ({
    ...ctx.self,
    offers: [
      ...ctx.self.offers,
      { robot: e.payload.robotId, pos: { ...e.payload.pos } },
    ],
  }));

  WaterRequested.react([Events.HelpAccepted], HelpAccepted, () => ({}));

  HelpAccepted.react([Events.WateringDone], WateringDone, () => ({}));
}

const WAIT_OFFER_DELTA = 50;
const DECIDE_OFFER_TIMEOUT = 300;

export const performWateringProtocol = async (
  actyx: Actyx,
  pos: { x: number; y: number },
  requestId: string,
  plantId: string
) => {
  const machine = createMachineRunner(
    actyx,
    protocol.tagWithEntityId(requestId),
    States.Init,
    { requestId, pos, plantId }
  ).refineStateType(States.All);

  let localBiddingTimeout: null | number = null;
  for await (const state of machine) {
    await state.as(States.Init, (state) => state.commands()?.request());

    await state.as(States.WaterRequested, async (requested) => {
      const bestOffer = requested.payload.offers
        .sort((a, b) => Pos.distance(a.pos, pos) - Pos.distance(b.pos, pos))
        .at(0);

      if (!bestOffer) {
        // Wait until an offer has come.
        // !commandsAvailable indicates that the state has expired, which means an offer has been made
        // eslint-disable-next-line no-constant-condition
        while (state.commandsAvailable()) {
          await sleep(WAIT_OFFER_DELTA);
        }
        return;
      }

      // If a best offer is found, set a local timeout
      // wait for 3000 milliseconds before choosing which offer is best
      localBiddingTimeout =
        localBiddingTimeout || Date.now() + DECIDE_OFFER_TIMEOUT;
      const remainingWait = localBiddingTimeout - Date.now();
      await sleep(remainingWait);
      await requested.commands()?.accept(bestOffer.robot);
    });

    if (state.is(States.WateringDone)) {
      break;
    }
  }
};

export const plantCoordinationCode: PlantCoordinationCode = async ({
  actyx,
  getData,
}) => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = getData();
    // sleep to avoid spamming
    await sleep(50);
    if (data.water < 50) {
      const requestId =
        (await plantNotDoneRequest(actyx, data.id))?.requestId || v4();
      await performWateringProtocol(actyx, data.pos, requestId, data.id);
    }
  }
};
