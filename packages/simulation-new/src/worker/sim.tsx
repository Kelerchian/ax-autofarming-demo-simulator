import { Actor, Id, Pos, Robot, Sensor, WaterPump } from "../common/actors";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { sleep } from "systemic-ts-utils/async-utils";
import {
  PlantControl,
  RobotControl,
  TaskOverridenError,
} from "../common/client";
import { Actyx } from "@actyx/sdk";
import {
  RobotHappenings,
  WorldCreate,
  WorldUpdate,
} from "../common/happenings";

export const GLOBAL_DELTA = Math.round(1000 / 30);

export const SimulatorCtx = VaettirReact.Context.make<Simulator>();

export type Simulator = ReturnType<typeof Simulator>;
export const Simulator = (actyx: Actyx) =>
  Vaettir.build()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .api(({ isDestroyed, channels }) => {
      const data = {
        sims: new Map<string, ActorSim>(),
        legacyActorMap: new Map<string, Actor.Type>(),
        lock: BoolLock.make(),
      };

      const init = () =>
        data.lock.use(async () => {
          // Returns cancel handle
          actyx.subscribe({ query: WorldCreate }, (actyxEvent) => {
            const entity = Actor.Type.safeParse(actyxEvent.payload);
            if (entity.success) {
              const sim = ActorSim(() => data.legacyActorMap, entity.data);
              data.sims.set(entity.data.id, sim);
              channels.change.emit();
            }
          });

          // Returns cancel handle
          actyx.subscribe({ query: WorldUpdate }, (actyxEvent) => {
            const idPayload = Id.Type.safeParse(actyxEvent.payload);
            if (idPayload.success) {
              data.sims.get(idPayload.data.id)?.api.feed(actyxEvent.payload);
              // Just emit the change on the actor
              // channels.change.emit();
            }
          });
        });

      // const add = <T extends Actor.Type>(actor: T): ControlHandleOf<T> => {
      //   const sim = ActorSim(() => data.legacyActorMap, actor);
      //   data.sims.set(actor.id, sim);
      //   data.legacyActorMap.set(actor.id, actor);
      //   channels.change.emit();
      //   return sim.api.controlHandle() as ControlHandleOf<T>;
      // };

      const actorsMap = (): ReadonlyMap<string, ActorSim> => data.sims;

      const actors = (): ActorSim[] => Array.from(data.sims.values());

      return {
        actorsMap,
        actors,
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

      const feed: (eventPayload: unknown) => unknown = (() => {
        console.log("step");
        if (actor.t === "Sensor") {
          return (eventPayload: unknown) => {
            const wateredEvent =
              RobotHappenings.WateredEvent.Type.safeParse(eventPayload);
            if (wateredEvent.success) {
              actor.water = wateredEvent.data.water;
              channels.change.emit();
            }
          };
        }
        if (actor.t === "Robot") {
          return (eventPayload: unknown) => {
            const positionEvent =
              RobotHappenings.PositionEvent.Type.safeParse(eventPayload);
            if (positionEvent.success) {
              actor.pos = positionEvent.data.pos;
              channels.change.emit();
            }
          };
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return (_: unknown) => {};
      })();

      // TODO: keep for the UI
      const controlHandle = (): ControlHandle => {
        const actor = data.actor;
        if (actor.t === "Sensor") {
          return {
            actor,
            control: makePlantControl(actor),
            type: "SensorControlHandle",
          };
        }
        if (actor.t === "Robot") {
          return {
            actor,
            control: makeRobotControl(otherActors, actor),
            type: "RobotControlHandle",
          };
        }
        return {
          actor,
          control: null,
          type: "WaterPumpControlHandle",
        };
      };

      return Object.freeze({
        feed: feed,
        id: data.actor.id,
        t: data.actor.t,
        actor: () => data.actor as Readonly<Actor.Type>,
        controlHandle,
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
  type: "RobotControlHandle";
  actor: Robot.Type;
  control: RobotControl;
};
export type SensorControlHandle = {
  type: "SensorControlHandle";
  actor: Sensor.Type;
  control: PlantControl;
};
export type WaterPumpControlHandle = {
  type: "WaterPumpControlHandle";
  actor: WaterPump.Type;
  control: null;
};

const makePlantControl = (plant: Sensor.Type): PlantControl => ({
  get: async () => plant,
  setWaterLevel: async (x) => {
    plant.water = x;
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
