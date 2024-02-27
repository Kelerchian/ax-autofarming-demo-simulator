/* eslint-disable @typescript-eslint/no-unused-vars */
import { sleep } from "systemic-ts-utils/async-utils";
import { Events, protocol } from "./protocol";
import { createMachineRunner } from "@actyx/machine-runner";
import { Actyx } from "@actyx/sdk";
import { Pos } from "../../common/actors";

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

const CHECK_WATER_LEVEL_DELTA = 1000;
const WAIT_OFFER_DELTA = 200;

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

  machine.events.on("next", (e) => {
    console.log("performWateringProtocol:next", e.type);
  });

  let localBiddingTimeout: null | number = null;
  for await (const state of machine) {
    console.log("performWateringProtocol", 1);
    await state.as(States.Init, (state) => state.commands()?.request());
    console.log("performWateringProtocol", 2);

    await state.as(States.WaterRequested, async (requested) => {
      console.log("performWateringProtocol", 3);
      const bestOffer = requested.payload.offers
        .sort((a, b) => Pos.distance(a.pos, pos) - Pos.distance(b.pos, pos))
        .at(0);

      console.log("performWateringProtocol", 4);
      if (!bestOffer) {
        console.log("performWateringProtocol", 5);
        // Wait until an offer has come (this state is expired)
        // eslint-disable-next-line no-constant-condition
        while (state.commandsAvailable()) {
          console.log("performWateringProtocol", 6);
          await sleep(WAIT_OFFER_DELTA);
        }
        console.log("performWateringProtocol", 6, "after");
        return;
      }
      console.log("performWateringProtocol", 7);

      // If a best offer is found, set a local timeout
      // wait for 3000 milliseconds before choosing which offer is best
      localBiddingTimeout = localBiddingTimeout || Date.now() + 3000;
      const remainingWait = localBiddingTimeout - Date.now();
      console.log("performWateringProtocol", 8);
      await sleep(remainingWait);
      console.log("performWateringProtocol", 9);
      await requested.commands()?.accept(bestOffer.robot);
    });

    if (state.is(States.WateringDone)) {
      break;
    }
    console.log("performWateringProtocol", "end");
  }
};
