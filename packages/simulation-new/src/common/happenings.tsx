/**
 * List event tags, emission functions, and (later) submission functions that
 * represent the happenings of the simulated world that passes through Actyx.
 */

/* eslint-disable @typescript-eslint/no-namespace */
import { Actyx, Tags } from "@actyx/sdk";
import { Id, Pos, Robot, Sensor } from "./actors";
import * as z from "zod";

export namespace PlantHappenings {
  // base tags for common subscriptions
  const TagPlant = Tags("Plant");
  const TagPlantWithId = (id: string) => TagPlant.and(Tags(`Plant:${id}`));

  // specific event-based tags
  const TagPlantCreated = Tags("PlantCreated");
  const TagPlantWatered = Tags("PlantWatered");
  const TagPlantWaterLevelUpdate = Tags("TagPlantWaterLevel");

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
  export const emitPlantCreated = (sdk: Actyx, sensor: Sensor.Type) =>
    sdk.publish(TagPlantWithId(sensor.id).and(TagPlantCreated).apply(sensor));

  export const emitWaterLevelUpdate = (
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
  // base tags for common subscriptions
  const TagRobot = Tags("Robot");
  const TagRobotWithId = (id: string) => TagRobot.and(Tags(`Robot:${id}`));

  // specific event-based tags
  const TagRobotCreated = Tags("RobotCreated");
  const TagRobotPosUpdate = Tags("RobotPosUpdate");

  // PlantWatered event
  export namespace PosUpdate {
    export type Type = z.TypeOf<typeof Type>;
    export const Type = Id.Type.and(Pos.Type);
  }

  // emissions
  export const emitPlantCreated = (sdk: Actyx, robot: Robot.Type) =>
    sdk.publish(TagRobotWithId(robot.id).and(TagRobotCreated).apply(robot));

  export const emitPosUpdate = (sdk: Actyx, posUpdate: PosUpdate.Type) =>
    sdk.publish(
      TagRobotWithId(posUpdate.id).and(TagRobotPosUpdate).apply(posUpdate)
    );
}
