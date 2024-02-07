import * as z from "zod";
import { Vaettir } from "vaettir";
import { pipe } from "effect";
import {
  Actor,
  Pos,
  Robot,
  Sensor,
  WaterPump,
} from "../../common-types/actors";
import { sleep } from "systemic-ts-utils/async-utils";

// Robot
// Plant

export type Simulation = ReturnType<(typeof Simulation)["make"]>;
export namespace Simulation {
  type Actors = Map<string, z.TypeOf<typeof Actor.Type>>;

  export namespace Behavior {
    const THINKING_PERIOD = 2000;
    const ROBOT_SPEED = 0.003; // unit / milliseconds

    export const think = (robot: Robot.Type, actors: Actors) => {
      if (robot.data.task === null) {
        robot.data.task = { t: "Thinking", start: Date.now() };
        console.log(robot.id, "is thinking now");
        return;
      }

      if (
        robot.data.task.t === "Thinking" &&
        Date.now() > robot.data.task.start + THINKING_PERIOD
      ) {
        if (robot.data.lastTask?.t === "DrawWater") {
          robot.data.task = (() => {
            const sensor = pipe(
              Array.from(actors.values()).filter(
                (x): x is Sensor.Type => x.t === "Sensor"
              ),
              (sensors) =>
                sensors[Math.round(Math.random() * (sensors.length - 1))] ||
                undefined
            );

            if (!sensor) {
              console.log(robot.id, "cannot find sensor");
              return null;
            }

            console.log(robot.id, "is delivering to sensor", sensor.id);
            return {
              t: "DeliverWater",
              start: Date.now(),
              from: { pos: { ...robot.pos } },
              to: { pos: { ...sensor.pos } },
            };
          })();
          return;
        }

        if (
          robot.data.lastTask === null ||
          robot.data.lastTask?.t === "DeliverWater"
        ) {
          robot.data.task = (() => {
            const waterPump = pipe(
              Array.from(actors.values()).filter(
                (x): x is WaterPump.Type => x.t === "WaterPump"
              ),
              (pumps) =>
                pumps[Math.round(Math.random() * (pumps.length - 1))] ||
                undefined
            );

            if (!waterPump) {
              console.log(robot.id, "cannot find water pump");
              return null;
            }

            console.log(robot.id, "is moving to pump", waterPump.id);
            return {
              t: "DrawWater",
              start: Date.now(),
              from: { pos: { ...robot.pos } },
              to: { pos: { ...waterPump.pos } },
            };
          })();
          return;
        }
      }
    };

    const stepCalculatePos = (
      robot: Robot.Type,
      task: Robot.Task.DrawWater | Robot.Task.DeliverWater
    ) => {
      const { from, to, start } = task;
      const deltaX = to.pos.x - from.pos.x;
      const deltaY = to.pos.y - from.pos.y;
      const totalDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const currentDist = (Date.now() - start) * ROBOT_SPEED;

      // hasn't reached destination
      if (currentDist < totalDist) {
        robot.pos = pipe(Math.atan2(deltaY, deltaX), (angle) => ({
          x: from.pos.x + currentDist * Math.cos(angle),
          y: from.pos.y + currentDist * Math.sin(angle),
        }));
        return;
      }

      // robot reached destination
      console.log(robot.id, "reached destination for", robot.data.task?.t);
      robot.pos = { ...to.pos };
      robot.data.lastTask = task;
      robot.data.task = null;
    };

    export const step = (robot: Robot.Type, actors: Actors) => {
      if (robot.data.task?.t === "Thinking" || robot.data.task === null) {
        return think(robot, actors);
      }

      if (
        robot.data.task?.t === "DeliverWater" ||
        robot.data.task?.t === "DrawWater"
      ) {
        return stepCalculatePos(robot, robot.data.task);
      }
    };
  }

  export const make = () =>
    Vaettir.build()
      .api(({ isDestroyed }) => {
        const actors: Actors = new Map();

        const addActor = (actor: Actor.Type) => {
          actors.set(actor.id, actor);
          return actor.id;
        };

        const add = {
          robot: () => addActor(Robot.make({ pos: Pos.makeRandom() })),
          sensor: () => addActor(Sensor.make({ pos: Pos.makeRandom() })),
          waterPump: () => addActor(WaterPump.make({ pos: Pos.makeRandom() })),
        };

        const tickRate = 30;
        const tickWait = Math.round(1000 / tickRate);

        (async () => {
          await sleep(tickWait);
          while (!isDestroyed()) {
            for (const x of actors.values()) {
              if (x.t === "Robot") {
                Behavior.step(x, actors);
              }
            }

            await sleep(tickWait);
          }
        })();

        return { add, getAll: () => Array.from(actors.values()) };
      })
      .finish();
}
