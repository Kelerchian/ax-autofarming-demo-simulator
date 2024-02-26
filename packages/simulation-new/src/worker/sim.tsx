/* eslint-disable @typescript-eslint/no-unused-vars */
import { Actor, Pos, Robot, Sensor } from "../common/actors";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { Actyx } from "@actyx/sdk";
import {
  RobotHappenings,
  WorldCreate,
  WorldUpdate,
  WorldUpdatePayload,
} from "../common/happenings";

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

      const getActorById = (id: string): ActorSim | undefined =>
        data.sims.get(id);

      const actors = (): ActorSim[] => Array.from(data.sims.values());

      return { init, actors, getActorById };
    })
    .finish();

export type ActorSim = ReturnType<typeof ActorSim>;
export const ActorSim = (actor: Actor.Type, actyx: Actyx) =>
  Vaettir.build()
    .api(({ channels, onDestroy }) => {
      const feed: (eventPayload: WorldUpdatePayload) => void = (() => {
        switch (actor.t) {
          case "Robot":
            return (eventPayload: WorldUpdatePayload) => {
              const positionEvent =
                RobotHappenings.PosUpdate.Type.safeParse(eventPayload);
              if (positionEvent.success) {
                actor.pos = positionEvent.data.pos;
                channels.change.emit();
              }
            };
          case "Sensor":
            return (eventPayload: WorldUpdatePayload) => {
              const wateredEvent =
                RobotHappenings.WateredEvent.Type.safeParse(eventPayload);
              if (wateredEvent.success) {
                actor.water = wateredEvent.data.water;
                channels.change.emit();
              }
            };
        }
      })();

      // TODO: keep for the UI
      const controlHandle = (): ControlHandle => {
        switch (actor.t) {
          case "Robot":
            return {
              actor,
              control: makeRobotControl(actor, actyx),
              type: "RobotControlHandle",
            };
          case "Sensor":
            return {
              actor,
              control: makePlantControl(actor),
              type: "SensorControlHandle",
            };
        }
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

export type ControlHandle = SensorControlHandle | RobotControlHandle;

export type ControlHandleOf<T extends Actor.Type> = T extends Robot.Type
  ? RobotControlHandle
  : SensorControlHandle;

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

export type PlantControl = {
  get: () => Promise<Sensor.Type>;
  setWaterLevel: (value: number) => Promise<unknown>;
};

const makePlantControl = (plant: Sensor.Type): PlantControl => ({
  get: async () => plant,
  setWaterLevel: async (x) => {
    plant.water = x;
  },
});

export type RobotControl = {
  get: () => Promise<Robot.Type>;
  moveToCoord: (
    pos: Pos.Type["pos"],
    REFRESH_TIME?: number
  ) => Promise<unknown>;
  waterPlant: (plantId: string, REFRESH_TIME?: number) => Promise<unknown>;
};

const makeRobotControl = (robot: Robot.Type, actyx: Actyx): RobotControl => ({
  get: async () => robot,
  moveToCoord: async (pos) => {
    RobotHappenings.publishNewMoveTask(actyx, { id: robot.id, pos });
  },
  waterPlant: async (plantId: string, REFRESH_TIME?: number) => {
    return;
  },
});
