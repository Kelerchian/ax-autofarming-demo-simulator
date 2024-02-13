import { Vaettir } from "vaettir";
import {
  Actor,
  Pos,
  Robot,
  Sensor,
  WaterPump,
} from "../../common-types/actors";
import { sleep } from "systemic-ts-utils/async-utils";
import { WINDOW_X_CENTER, WINDOW_Y_CENTER } from "../../common-types/window";

export type Simulation = ReturnType<(typeof Simulation)["make"]>;
export namespace Simulation {
  export const make = () =>
    Vaettir.build()
      .api(({ isDestroyed }) => {
        const actors: Actor.ActorsMap = new Map();

        const addActor = (actor: Actor.Type) => {
          actors.set(actor.id, actor);
          return actor.id;
        };

        const add = {
          robot: () => addActor(Robot.make({ pos: Pos.makeRandom(250) })),
          sensor: () => addActor(Sensor.make({ pos: Pos.makeRandom(250) })),
          waterPump: () =>
            addActor(
              WaterPump.make({
                pos: { pos: { x: WINDOW_X_CENTER, y: WINDOW_Y_CENTER } },
              })
            ),
        };

        const tickRate = 30;
        const tickWait = Math.round(1000 / tickRate);

        (async () => {
          await sleep(tickWait);
          while (!isDestroyed()) {
            for (const x of actors.values()) {
              if (x.t === "Robot") {
                Robot.Step.step(x);
              }
              if (x.t === "Sensor") {
                Sensor.Step.step(x, tickWait);
              }
            }

            await sleep(tickWait);
          }
        })();

        return {
          add,
          getAll: (): Actor.ReadonlyActorsMap => actors,
          getAsArray: () => Array.from(actors.values()),
          getById: (id: string) => actors.get(id),
        };
      })
      .finish();
}
