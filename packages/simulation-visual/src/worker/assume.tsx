import { OptimisticLock } from "systemic-ts-utils/lock";
import { Vaettir, VaettirReact } from "vaettir-react";
import { Actor, Robot, Sensor } from "../../../common-types/actors";
import {
  PlantControl,
  RobotControl,
  getActor,
  makePlantControl,
  makeRobotControl,
} from "../../../common-types/client";
import { sleep } from "systemic-ts-utils/async-utils";
import { Visualizer } from "./visualizer";

export const ActorAssumerCtx = VaettirReact.Context.make<ActorAssumer>();

export type AssumedActor = AssumedSensor | AssumedRobot;
export type AssumedRobot = {
  actor: Robot.Type;
  control: RobotControl;
};
export type AssumedSensor = {
  actor: Sensor.Type;
  control: PlantControl;
};

const assumedActor = (server: string, actor: Actor.Type) => {
  if (actor.t === "Robot") {
    return {
      actor,
      control: makeRobotControl(server, actor),
    };
  } else if (actor.t === "Sensor") {
    return {
      actor,
      control: makePlantControl(server, actor),
    };
  }
  return null;
};

export type ActorAssumer = ReturnType<typeof ActorAssumer>;
export const ActorAssumer = (server: string, visualizer: Visualizer) =>
  Vaettir.build()
    .api(({ channels, isDestroyed }) => {
      const data = {
        isAssuming: false,
        assumingLock: OptimisticLock.make(),
        assumedActor: null as null | AssumedActor,
        updateLock: OptimisticLock.make(),
      };

      const attemptAutoUpdate = () =>
        data.updateLock.use(async (status) => {
          const assumedActor = data.assumedActor;
          if (!assumedActor) return;
          while (status.isActive() && !isDestroyed()) {
            const newUpdate = visualizer.api
              .actorsMap()
              .get(assumedActor.actor.id);

            if (newUpdate?.t === assumedActor.actor.t) {
              assumedActor.actor = newUpdate;
              channels.change.emit();
            }

            await sleep(2000);
          }
        });

      return {
        isAssuming: () => data.isAssuming,
        assume: (id: string) =>
          data.assumingLock.use(async (status) => {
            data.isAssuming = true;
            channels.change.emit();
            const actor = await getActor(server, id);
            if (status.isActive()) {
              data.assumedActor = assumedActor(server, actor);
              data.isAssuming = false;
              channels.change.emit();
              attemptAutoUpdate();
            }
          }),
        getAssumed: () => data.assumedActor,
      };
    })
    .finish();
