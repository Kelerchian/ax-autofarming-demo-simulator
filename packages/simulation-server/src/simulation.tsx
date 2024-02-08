import { Vaettir } from "vaettir";
import {
  Actor,
  Pos,
  Robot,
  Sensor,
  WaterPump,
} from "../../common-types/actors";
import { sleep } from "systemic-ts-utils/async-utils";

export type Simulation = ReturnType<(typeof Simulation)["make"]>;
export namespace Simulation {
  export const make = () =>
    Vaettir.build()
      .api(({ isDestroyed }) => {
        const actors: Actor.Actors = new Map();

        const addActor = (actor: Actor.Type) => {
          actors.set(actor.id, actor);
          return actor.id;
        };

        const add = {
          robot: () => addActor(Robot.make({ pos: Pos.makeRandom() })),
          sensor: () => addActor(Sensor.make({ pos: Pos.makeRandom() })),
          waterPump: () =>
            addActor(WaterPump.make({ pos: { pos: { x: 0, y: 0 } } })),
        };

        const tickRate = 30;
        const tickWait = Math.round(1000 / tickRate);

        (async () => {
          await sleep(tickWait);
          while (!isDestroyed()) {
            for (const x of actors.values()) {
              if (x.t === "Robot") {
                Robot.Actions.Step.step(x);
              }
              if (x.t === "Sensor") {
                Sensor.Decay.step(x, tickWait);
              }
            }

            await sleep(tickWait);
          }
        })();

        return {
          add,
          getAll: (): Actor.ReadonlyActors => actors,
          getAsArray: () => Array.from(actors.values()),
          getById: (id: string) => actors.get(id),
        };
      })
      .finish();
}
