/**
 * List event tags, emission functions, and (later) submission functions that
 * represent the happenings of the simulated world that passes through Actyx.
 */

/* eslint-disable @typescript-eslint/no-namespace */
import { Actyx, Tags, Metadata } from "@actyx/sdk";
import { Id, Pos, Robot, Sensor } from "./actors";
import * as z from "zod";

const World = Tags("World");
export const WorldCreate = World.and(Tags("World:Create"));
export const WorldUpdate = World.and(Tags("World:Update"));

export namespace PlantHappenings {
  // base tags for common subscriptions
  export const TagPlant = Tags("Plant");
  export const TagPlantWithId = (id: string) =>
    TagPlant.and(Tags(`Plant:${id}`));

  // specific event-based tags
  export const TagPlantCreated = Tags("PlantCreated");
  export const TagPlantWatered = Tags("PlantWatered");
  export const TagPlantWaterLevelUpdate = Tags("TagPlantWaterLevel");

  // PlantWatered event
  export namespace WaterLevel {
    export type Type = z.TypeOf<typeof Type>;
    export const Type = Id.Type.and(z.object({ water: z.number() }));
  }

  // PlantWatered event
  export namespace Watered {
    export type Type = z.TypeOf<typeof Type>;
    export const Type = Id.Type.and(Pos.Type);
  }

  // emissions
  export const publishPlantCreated = (sdk: Actyx, sensor: Sensor.Type) => {
    return sdk.publish(
      WorldCreate.and(TagPlant)
        .and(TagPlantWithId(sensor.id))
        .and(TagPlantCreated)
        .apply(sensor)
    );
  };

  export const publishWaterLevelUpdate = (
    sdk: Actyx,
    waterLevelUpdate: WaterLevel.Type
  ) =>
    sdk.publish(
      TagPlantWithId(waterLevelUpdate.id)
        .and(TagPlantWaterLevelUpdate)
        .apply(waterLevelUpdate)
    );

  export const emitWatered = (sdk: Actyx, watered: Watered.Type) =>
    sdk.publish(TagPlantWithId(watered.id).and(TagPlantWatered).apply(watered));

  // TODO: subscriptions, will do later after we know the API shape we want
}

export namespace RobotHappenings {
  export const publishCreateRobotEvent = (sdk: Actyx, robot: Robot.Type) => {
    const taggedEvent = WorldCreate.and(TagRobot)
      .and(TagRobotCreated)
      .apply(Robot.make({ pos: robot.pos, id: robot.id }));

    return sdk.publish(taggedEvent);
  };

  export namespace WateredEvent {
    export const Type = Id.Type.and(
      // TODO: double check this
      z.object({
        id: z.string(),
        water: z.number(),
      })
    );
    export type Type = z.TypeOf<typeof Type>;
  }

  export namespace PositionEvent {
    export const Type = Id.Type.and(Pos.Type).and(
      z.object({ type: z.enum(["Robot", "Plant"]), pos: Pos.Type })
    );
    export type Type = z.TypeOf<typeof Type>;
  }

  // base tags for common subscriptions
  const TagRobot = Tags("Robot");
  const TagRobotWithId = (id: string) => TagRobot.and(Tags(`Robot:${id}`));

  // specific event-based tags
  export const TagRobotCreated = Tags("RobotCreated");
  const TagRobotPosUpdate = Tags("RobotPosUpdate");

  // PlantWatered event
  export namespace PosUpdate {
    export type Type = z.TypeOf<typeof Type>;
    export const Type = Id.Type.and(Pos.Type);
  }

  // emissions
  export const emitRobotCreated = (sdk: Actyx, robot: Robot.Type) =>
    sdk.publish(TagRobotWithId(robot.id).and(TagRobotCreated).apply(robot));

  export const emitPosUpdate = (sdk: Actyx, posUpdate: PosUpdate.Type) =>
    sdk.publish(
      TagRobotWithId(posUpdate.id).and(TagRobotPosUpdate).apply(posUpdate)
    );
}
