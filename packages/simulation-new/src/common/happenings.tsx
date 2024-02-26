/**
 * List event tags, emission functions, and (later) submission functions that
 * represent the happenings of the simulated world that passes through Actyx.
 */

/* eslint-disable @typescript-eslint/no-namespace */
import { Actyx, Tags } from "@actyx/sdk";
import { Id, Pos, Robot, Sensor } from "./actors";
import * as z from "zod";
import { Events, ProtocolName } from "../workshop/protocol/protocol";
import { v4 } from "uuid";

const World = Tags("World");
export const WorldCreate = World.and(Tags("World:Create"));
export const WorldCreateWithId = (id: string) =>
  World.and(Tags(`World:Create:${id}`));
export const WorldUpdate = World.and(Tags("World:Update"));

// This should probably be moved to a single Plant class with the events and the sensor
// we're not getting much out of this separation
export namespace PlantHappenings {
  // base tags for common subscriptions
  export const TagPlant = Tags("Plant");
  export const TagPlantWithId = (id: string) => Tags(`Plant:${id}`);

  // specific event-based tags
  export const TagPlantCreated = Tags("PlantCreated");
  export const TagPlantWatered = Tags("PlantWatered");
  export const TagPlantWaterLevelUpdate = Tags("TagPlantWaterLevel");
  export const TagPlantWaterRequested = Tags("TagPlantWaterRequested");

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
        .and(WorldCreateWithId(sensor.id))
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
      WorldUpdate.and(TagPlantWithId(waterLevelUpdate.id))
        .and(TagPlantWaterLevelUpdate)
        .apply(waterLevelUpdate)
    );

  export const publishWaterRequest = (sdk: Actyx, sensor: Sensor.Type) => {
    const requestId = v4();
    sdk.publish(
      Tags(ProtocolName)
        .and(TagPlant)
        .and(TagPlantWithId(sensor.id))
        .and(TagPlantWaterRequested)
        .apply(
          Events.WaterRequested.make({
            pos: sensor.pos,
            requestId,
            plantId: sensor.id,
          })
        )
    );
    return requestId;
  };

  export const emitWatered = (sdk: Actyx, watered: Watered.Type) =>
    sdk.publish(
      TagPlant.and(TagPlantWithId(watered.id))
        .and(TagPlantWatered)
        .apply(watered)
    );

  // TODO: subscriptions, will do later after we know the API shape we want
}

export namespace RobotHappenings {
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

  // base tags for common subscriptions
  export const TagRobot = Tags("Robot");
  export const TagRobotWithId = (id: string) => Tags(`Robot:${id}`);

  // specific event-based tags
  export const TagRobotCreated = Tags("RobotCreated");
  export const TagRobotPosUpdate = Tags("RobotPosUpdate");

  export const TagRobotNewMoveTask = Tags("RobotNewMoveTask");

  // PlantWatered event
  export namespace PosUpdate {
    export type Type = z.TypeOf<typeof Type>;
    export const Type = Id.Type.and(Pos.Type);
  }

  // emissions
  export const publishNewMoveTask = (sdk: Actyx, pos: PosUpdate.Type) => {
    sdk.publish(
      TagRobot.and(TagRobotWithId(pos.id)).and(TagRobotNewMoveTask).apply(pos)
    );
  };
}

export type WorldUpdatePayload = z.TypeOf<typeof WorldUpdatePayload>;
export const WorldUpdatePayload = z.union([
  RobotHappenings.PosUpdate.Type,
  PlantHappenings.WaterLevel.Type,
]); // TODO: add robot pos update event here as z.union
