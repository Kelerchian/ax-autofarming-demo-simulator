import {
  Actor,
  Pos,
  Robot,
  Sensor,
  WaterPump,
} from "../common/actors";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { sleep } from "systemic-ts-utils/async-utils";
import {
  PlantControl,
  RobotControl,
  TaskOverridenError,
} from "../common/client";

export const GLOBAL_DELTA = Math.round(1000 / 30);

export const SimulatorCtx = VaettirReact.Context.make<Simulator>();

export type Simulator = ReturnType<typeof Simulator>;
export const Simulator = () =>
  Vaettir.build()
    .api(({ isDestroyed, channels }) => {
      const data = {
        sims: new Map<string, ActorSim>(),
        legacyActorMap: new Map<string, Actor.Type>(),
        lock: BoolLock.make(),
      };

      const init = () =>
        data.lock.use(async () => {
          while (!isDestroyed()) {
            for (const actor of data.sims.values()) {
              actor.api.step(GLOBAL_DELTA);
            }
            await sleep(GLOBAL_DELTA);
          }
        });

      const actorsMap = (): ReadonlyMap<string, ActorSim> => data.sims;

      const legacyActorsMap = (): Actor.ReadonlyActorsMap =>
        data.legacyActorMap;

      const add = <T extends Actor.Type>(actor: T): ControlHandleOf<T> => {
        const sim = ActorSim(() => data.legacyActorMap, actor);
        data.sims.set(actor.id, sim);
        data.legacyActorMap.set(actor.id, actor);
        channels.change.emit();
        return sim.api.controlHandle() as ControlHandleOf<T>;
      };

      const actors = (): ActorSim[] => Array.from(data.sims.values());

      return {
        legacyActorsMap,
        actorsMap,
        actors,
        add,
        init,
      };
    })
    .finish();

export type ActorSim = ReturnType<typeof ActorSim>;
export const ActorSim = (
  otherActors: () => Actor.ReadonlyActorsMap,
  actor: Actor.Type
) =>
  Vaettir.build()
    .api(({ channels }) => {
      const data = { actor };

      const step: (delta: number) => unknown = (() => {
        if (actor.t === "Sensor") {
          return (delta: number) => {
            Sensor.Step.step(actor, delta);
            channels.change.emit();
          };
        }
        if (actor.t === "Robot") {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          return (_: number) => {
            Robot.Step.step(actor);
            channels.change.emit();
          };
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return (_: number) => {};
      })();

      const controlHandle = (): ControlHandle => {
        const actor = data.actor;
        if (actor.t === "Sensor") {
          return {
            actor,
            control: makePlantControl(actor),
          };
        }
        if (actor.t === "Robot") {
          return {
            actor,
            control: makeRobotControl(otherActors, actor),
          };
        }
        return {
          actor,
          control: null,
        };
      };

      return Object.freeze({
        id: data.actor.id,
        t: data.actor.t,
        actor: () => data.actor as Readonly<Actor.Type>,
        controlHandle,
        step,
      });
    })
    .finish();

export type ControlHandle =
  | SensorControlHandle
  | RobotControlHandle
  | WaterPumpControlHandle;

export type ControlHandleOf<T extends Actor.Type> = T extends Robot.Type
  ? RobotControlHandle
  : T extends Sensor.Type
  ? SensorControlHandle
  : WaterPumpControlHandle;

export type RobotControlHandle = {
  actor: Robot.Type;
  control: RobotControl;
};
export type SensorControlHandle = {
  actor: Sensor.Type;
  control: PlantControl;
};
export type WaterPumpControlHandle = {
  actor: WaterPump.Type;
  control: null;
};

const makePlantControl = (plant: Sensor.Type): PlantControl => ({
  get: async () => plant,
  setWaterLevel: async (x) => {
    plant.data.water = x;
  },
});

const makeRobotControl = (
  actors: () => Actor.ReadonlyActorsMap,
  robot: Robot.Type
): RobotControl => ({
  get: async () => robot,
  moveToCoord: async (pos, REFRESH_TIME) => {
    Robot.Actions.apply(actors(), robot, {
      t: "MoveToCoordinate",
      to: { pos },
    });
    const currentTask = robot.data.task;
    if (!currentTask) return;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (robot.data.task === null && Pos.equal(robot.pos, pos)) {
        if (Pos.equal(robot.pos, pos)) {
          return;
        } else {
          throw TaskOverridenError;
        }
      }

      if (robot.data.task !== null && robot.data.task !== currentTask) {
        throw TaskOverridenError;
      }

      await sleep(Math.max(REFRESH_TIME || GLOBAL_DELTA, GLOBAL_DELTA));
    }
  },
  waterPlant: async (plantId: string, REFRESH_TIME?: number) => {
    Robot.Actions.apply(actors(), robot, {
      t: "WaterPlant",
      sensorId: plantId,
    });
    const currentTask = robot.data.task;
    if (!currentTask) return;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (robot.data.task === null) return;

      if (robot.data.task !== null && robot.data.task !== currentTask) {
        throw TaskOverridenError;
      }
      await sleep(Math.max(REFRESH_TIME || GLOBAL_DELTA, GLOBAL_DELTA));
    }
  },
});
