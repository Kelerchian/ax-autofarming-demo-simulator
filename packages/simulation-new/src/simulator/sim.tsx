/* eslint-disable @typescript-eslint/no-unused-vars */
import { ActorData, Pos, RobotData, PlantData, Id } from "../common/actors";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { Actyx } from "@actyx/sdk";
import {
  PlantHappenings,
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
    .api(({ channels }) => {
      const data = {
        sims: new Map<string, ActorSim>(),
        legacyActorMap: new Map<string, ActorData.Type>(),
        lock: BoolLock.make(),
      };

      const init = () =>
        data.lock.use(async () => {
          // Returns cancel handle
          actyx.subscribe({ query: WorldCreate }, (actyxEvent) => {
            const entity = ActorData.Type.safeParse(actyxEvent.payload);
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
export const ActorSim = (actor: ActorData.Type, actyx: Actyx) =>
  Vaettir.build()
    .api(({ channels }) => {
      const feed: (eventPayload: WorldUpdatePayload) => void = (() => {
        switch (actor.t) {
          case "Robot":
            return (eventPayload: WorldUpdatePayload) => {
              const positionEvent =
                RobotData.PosUpdate.Type.safeParse(eventPayload);
              if (positionEvent.success) {
                actor.pos = positionEvent.data.pos;
                channels.change.emit();
              }
            };
          case "Plant":
            return (eventPayload: WorldUpdatePayload) => {
              const waterUpdate =
                PlantData.WaterLevel.Type.safeParse(eventPayload);
              if (waterUpdate.success) {
                actor.water = waterUpdate.data.water;
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
          case "Plant":
            return {
              actor,
              control: makePlantControl(actor),
              type: "PlantControlHandle",
            };
        }
      };

      return Object.freeze({
        feed: feed,
        id: actor.id,
        t: actor.t,
        actor: () => actor as Readonly<ActorData.Type>,
        controlHandle,
      });
    })
    .finish();

export type ControlHandle = PlantControlHandle | RobotControlHandle;

export type ControlHandleOf<T extends ActorData.Type> = T extends RobotData.Type
  ? RobotControlHandle
  : PlantControlHandle;

export type RobotControlHandle = {
  type: "RobotControlHandle";
  actor: RobotData.Type;
  control: RobotControl;
};
export type PlantControlHandle = {
  type: "PlantControlHandle";
  actor: PlantData.Type;
  control: PlantControl;
};

export type PlantControl = {
  get: () => Promise<PlantData.Type>;
  setWaterLevel: (value: number) => Promise<unknown>;
};

const makePlantControl = (plant: PlantData.Type): PlantControl => ({
  get: async () => plant,
  setWaterLevel: async (x) => {
    plant.water = x;
  },
});

export type RobotControl = {
  get: () => Promise<RobotData.Type>;
  moveToCoord: (
    pos: Pos.Type["pos"],
    REFRESH_TIME?: number
  ) => Promise<unknown>;
  waterPlant: (
    data: Id.Type & Pos.Type,
    REFRESH_TIME?: number
  ) => Promise<unknown>;
};

const makeRobotControl = (
  robot: RobotData.Type,
  actyx: Actyx
): RobotControl => ({
  get: async () => robot,
  moveToCoord: async (pos) =>
    RobotHappenings.publishNewMoveTask(actyx, { id: robot.id, to: { pos } }),
  waterPlant: async (data, REFRESH_TIME?: number) =>
    PlantHappenings.publishWatered(actyx, data),
});
