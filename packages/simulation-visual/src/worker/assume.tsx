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

export const ActorAssumerCtx = VaettirReact.Context.make<ActorAssumer>();

type AssumedActor =
  | {
      actor: Sensor.Type;
      control: PlantControl;
    }
  | {
      actor: Robot.Type;
      control: RobotControl;
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
export const ActorAssumer = (server: string) =>
  Vaettir.build()
    .api(({ channels }) => {
      const data = {
        isAssuming: false,
        assumingLock: OptimisticLock.make(),
        assumedActor: null as null | AssumedActor,
      };

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
            }
          }),
        getAssumed: () => data.assumedActor,
      };
    })
    .finish();
