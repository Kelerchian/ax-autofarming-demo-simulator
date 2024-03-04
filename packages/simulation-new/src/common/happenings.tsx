/**
 * List event tags, emission functions, and (later) submission functions that
 * represent the happenings of the simulated world that passes through Actyx.
 */

/* eslint-disable @typescript-eslint/no-namespace */
import { Actyx, AqlEventMessage, Tags } from "@actyx/sdk";
import { PlantData, RobotData } from "./actors";
import * as z from "zod";

const World = Tags("World");
export const WorldCreate = World.and(Tags("World:Create"));
export const WorldCreateWithId = (id: string) =>
  World.and(Tags(`World:Create:${id}`));
export const WorldUpdate = World.and(Tags("World:Update"));

// This should probably be moved to a single Plant class with the events and the plant
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

  // emissions
  export const publishPlantCreated = (sdk: Actyx, plant: PlantData.Type) => {
    return sdk.publish(
      WorldCreate.and(WorldCreateWithId(plant.id))
        .and(TagPlant)
        .and(TagPlantWithId(plant.id))
        .and(TagPlantCreated)
        .apply(PlantData.Type.parse(plant))
    );
  };

  export const publishWaterLevelUpdate = (
    sdk: Actyx,
    waterLevelUpdate: PlantData.WaterLevel.Type
  ) =>
    sdk.publish(
      WorldUpdate.and(TagPlantWithId(waterLevelUpdate.id))
        .and(TagPlantWaterLevelUpdate)
        // NOTE: parse strips out unmatching fields
        .apply(PlantData.WaterLevel.Type.parse(waterLevelUpdate))
    );

  export const retrieveById = async (
    actyx: Actyx,
    id: string
  ): Promise<{ data: PlantData.Type; lamport: number } | undefined> => {
    const actyxEvents = await actyx.queryAql({
      query: `FROM ${WorldCreateWithId(id)} `,
    });
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const parsed = PlantData.Type.safeParse(event?.payload);
    if (parsed.success) {
      return { data: parsed.data, lamport: event?.meta.lamport || 0 };
    }
    return undefined;
  };

  export const retrieveWaterLevelOfId = async (
    actyx: Actyx,
    id: string
  ): Promise<{ data: number; lamport: number } | undefined> => {
    const actyxEvents = await actyx.queryAql({
      query: `
          PRAGMA features := aggregate
          FROM ${PlantHappenings.TagPlantWithId(id)} & ${WorldUpdate}
          AGGREGATE LAST(_.water)
      `,
    });
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const latestWaterValue = event?.payload as number; // should be safe due to the kind of query
    return { data: latestWaterValue, lamport: event?.meta.lamport || 0 };
  };

  export const publishWatered = (
    sdk: Actyx,
    watered: PlantData.Watered.Type
  ) => {
    return sdk.publish(
      TagPlant.and(TagPlantWithId(watered.id))
        .and(TagPlantWatered)
        .apply(PlantData.Watered.Type.parse(watered))
    );
  };

  export const subscribeWaterEventById = (
    actyx: Actyx,
    plantId: string,
    fn: (
      meta: AqlEventMessage["meta"],
      payload: PlantData.Watered.Type
    ) => unknown
  ) => {
    const query = TagPlant.and(TagPlantWithId(plantId)).and(TagPlantWatered);
    return actyx.subscribeAql(`FROM ${query.toString()}`, (e) => {
      if (e.type !== "event") return;
      const parsed = PlantData.Watered.Type.parse(e.payload);
      if (parsed.id !== plantId) return;
      fn(e.meta, parsed);
    });
  };
}

export namespace RobotHappenings {
  // base tags for common subscriptions
  export const TagRobot = Tags("Robot");
  export const TagRobotWithId = (id: string) => Tags(`Robot:${id}`);

  // specific event-based tags
  export const TagRobotCreated = Tags("RobotCreated");
  export const TagRobotPosUpdate = Tags("RobotPosUpdate");

  export const TagRobotNewMoveTask = Tags("RobotNewMoveTask");

  /** Publich a Robot creation event. */
  export const publishCreateRobotEvent = async (
    sdk: Actyx,
    robot: RobotData.Type
  ) =>
    sdk.publish(
      WorldCreate.and(WorldCreateWithId(robot.id))
        .and(RobotHappenings.TagRobot)
        .and(RobotHappenings.TagRobotCreated)
        .apply(RobotData.Type.parse(robot))
    );

  /** Check if the ID exists in Actyx. */
  export const retrieveById = async (
    actyx: Actyx,
    id: string
  ): Promise<RobotData.Type | undefined> => {
    const actyxEvents = await actyx.queryAql(
      `FROM ${WorldCreateWithId(id).and(RobotHappenings.TagRobot)}`
    );
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const parsed = RobotData.Type.safeParse(event?.payload);
    if (parsed.success) {
      return parsed.data;
    }
    return undefined;
  };

  /** Retrieve the latest state from Actyx. */
  export const retrievePositionById = async (
    actyx: Actyx,
    id: string
  ): Promise<RobotData.PosUpdate.Type | undefined> => {
    // NOTE: This is not the full state the robot might be in
    // we still need to take into account the current request it may be fulfilling
    const actyxEvents = await actyx.queryAql(`
            PRAGMA features := aggregate
            FROM ${RobotHappenings.TagRobotWithId(id)} & ${WorldUpdate}
            AGGREGATE LAST(_)
        `);
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const parsed = RobotData.PosUpdate.Type.safeParse(event?.payload);
    if (parsed.success) {
      return parsed.data;
    }
    return undefined;
  };

  // Pos Update
  // ============

  /** Publish a position update. */
  export const publishPosUpdate = async (
    sdk: Actyx,
    posUpdate: RobotData.PosUpdate.Type
  ) =>
    sdk.publish(
      WorldUpdate.and(RobotHappenings.TagRobot)
        .and(RobotHappenings.TagRobotWithId(posUpdate.id))
        .and(RobotHappenings.TagRobotPosUpdate)
        .apply(RobotData.PosUpdate.Type.parse(posUpdate))
    );

  export const subscribeToMovementUpdatesById = (
    sdk: Actyx,
    id: string,
    fn: (pos: RobotData.PosUpdate.Type) => unknown
  ) =>
    sdk.subscribe(
      { query: WorldUpdate.and(TagRobotWithId(id).and(TagRobotPosUpdate)) },
      (event) => {
        const parsed = RobotData.PosUpdate.Type.parse(event);
        if (parsed.id !== id) return;
        fn(parsed);
      }
    );

  // Move Task
  // ============

  export const publishNewMoveTask = (
    sdk: Actyx,
    destination: Parameters<typeof RobotData.Actions.moveToCoordinate>[0]
  ) =>
    sdk.publish(
      TagRobot.and(TagRobotWithId(destination.id))
        .and(TagRobotNewMoveTask)
        .apply(
          RobotData.Actions.MoveToCoordinate.parse(
            RobotData.Actions.moveToCoordinate(
              destination
            ) satisfies RobotData.Actions.MoveToCoordinate
          )
        )
    );

  export const subscribeToNewTasksById = async (
    sdk: Actyx,
    id: string,
    fn: (destination: RobotData.Actions.MoveToCoordinate) => unknown
  ) => {
    return sdk.subscribe(
      {
        query: TagRobot.and(TagRobotWithId(id)).and(TagRobotNewMoveTask),
        lowerBound: await sdk.present(),
      },
      (event) => {
        const parsed = RobotData.Actions.MoveToCoordinate.safeParse(
          event.payload
        );
        if (!parsed.success || parsed.data.id !== id) return;
        fn(parsed.data);
      }
    );
  };
}

export type WorldUpdatePayload = z.TypeOf<typeof WorldUpdatePayload>;
export const WorldUpdatePayload = z.union([
  RobotData.PosUpdate.Type,
  PlantData.WaterLevel.Type,
]); // TODO: add robot pos update event here as z.union
