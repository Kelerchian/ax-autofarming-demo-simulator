/* eslint-disable @typescript-eslint/no-unused-vars */
import { Actor, Robot, Sensor, WaterPump } from "../common/actors";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { PlantControl, RobotControl } from "../common/client";
import { Actyx, AqlEventMessage } from "@actyx/sdk";
import {
  RobotHappenings,
  WorldCreate,
  WorldCreateWithId,
  WorldUpdate,
  WorldUpdatePayload,
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
              const sim = ActorSim(entity.data, actyx);
              data.sims.set(entity.data.id, sim);
              channels.change.emit();
            }
          });

          // Returns cancel handle
          actyx.subscribe({ query: WorldUpdate }, (actyxEvent) => {
            const idPayload = WorldUpdatePayload.safeParse(actyxEvent.payload);
            if (!idPayload.success) return;
            data.sims.get(idPayload.data.id)?.api.feed(idPayload.data);
          });
        });

      const queryActorById = (
        id: string
      ): Promise<Robot.Type | Sensor.Type | null> =>
        actyx
          .queryAql({
            query: `FROM ${WorldCreateWithId(id)}`,
          })
          .then((events) => {
            const firstEvent = events
              .filter((e): e is AqlEventMessage => e.type === "event")
              .at(0);
            if (!firstEvent) return null;
            const parsed = Actor.Type.safeParse(firstEvent.payload);
            if (!parsed.success) return null;
            return parsed.data;
          });

      const actorsMap = (): ReadonlyMap<string, ActorSim> => data.sims;

      const actors = (): ActorSim[] => Array.from(data.sims.values());

      return {
        simsMap: actorsMap,
        actors,
        init,
        queryActorIdExistence: queryActorById,
      };
    })
    .finish();

export type ActorSim = ReturnType<typeof ActorSim>;
export const ActorSim = (actor: Actor.Type, actyx: Actyx) =>
  Vaettir.build()
    .api(({ channels, onDestroy }) => {
      const feed: (eventPayload: WorldUpdatePayload) => unknown = (() => {
        if (actor.t === "Sensor") {
          return (eventPayload: WorldUpdatePayload) => {
            const wateredEvent =
              RobotHappenings.WateredEvent.Type.safeParse(eventPayload);
            if (wateredEvent.success) {
              actor.water = wateredEvent.data.water;
              channels.change.emit();
            }
          };
        }
        if (actor.t === "Robot") {
          return (eventPayload: WorldUpdatePayload) => {
            const positionEvent =
              RobotHappenings.PosUpdate.Type.safeParse(eventPayload);
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
            control: makeRobotControl(actor, actyx),
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
        id: actor.id,
        t: actor.t,
        actor: () => actor as Readonly<Actor.Type>,
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

const makeRobotControl = (robot: Robot.Type, actyx: Actyx): RobotControl => ({
  get: async () => robot,
  moveToCoord: async (pos) => {
    // const parsedPos = Pos.Type.shape.pos.safeParse(pos);
    // if (!parsedPos.success) return;
    // localReality.task = {
    //   t: "MoveToCoordinate",
    //   from: { pos: localReality.pos },
    //   to: { pos: parsedPos.data },
    //   start: Date.now(),
    // };

    RobotHappenings.publishNewMoveTask(actyx, { id: robot.id, pos });
  },
  waterPlant: async (plantId: string, REFRESH_TIME?: number) => {
    return;
  },
});
