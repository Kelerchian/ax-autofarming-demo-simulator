/* eslint-disable @typescript-eslint/no-namespace */
import * as z from "zod";
import { v4 as uuid } from "uuid";
import { pipe } from "effect";

export namespace Pos {
  const RANDOM_MINIMUM_DEVIATION = 5;
  const RANDOM_MAXIMUM_DEVIATION = 20;
  export const Type = z.object({
    pos: z.object({
      x: z.number(),
      y: z.number(),
    }),
  });
  export type Type = z.TypeOf<typeof Type>;

  export const make = (pos: Type["pos"]): Type => ({ pos });

  export const makeRandom = (inputRadius?: number): Type =>
    pipe(
      {
        angle: pipe(
          Math.random() * Math.PI * 2,
          (degreeRad) => Math.round(degreeRad * 1000) / 1000
        ),
        radius: pipe(
          inputRadius !== undefined
            ? inputRadius
            : Math.round(Math.random() * RANDOM_MAXIMUM_DEVIATION),
          (r) => Math.max(r, RANDOM_MINIMUM_DEVIATION)
        ), // normalize
      },
      ({ angle, radius: radius }): Type => ({
        pos: {
          x: radius * Math.sin(angle),
          y: radius * Math.cos(angle),
        },
      })
    );

  export const equal = (a: Type["pos"], b: Type["pos"]) =>
    a.x === b.x && a.y === b.y;

  export const distance = (a: Type["pos"], b: Type["pos"]) => {
    const x = a.x - b.x;
    const y = a.y - b.y;
    return Math.sqrt(x * x + y * y);
  };
}

export namespace Id {
  export const Type = z.object({ id: z.string() });
  export type Type = z.TypeOf<typeof Type>;
  export const make = (val?: string): Type => ({ id: val || uuid() });
}

/// Actors
/// ===================

const ActorBase = z.object({}).and(Pos.Type).and(Id.Type);

export namespace Robot {
  export namespace Actions {
    export type MoveToCoordinate = z.TypeOf<typeof MoveToCoordinate>;
    export const MoveToCoordinate = z.object({
      t: z.literal("MoveToCoordinate"),
      to: Pos.Type,
    });

    export type WaterPlant = z.TypeOf<typeof WaterPlant>;
    export const WaterPlant = z.object({
      t: z.literal("WaterPlant"),
      sensorId: z.string(),
    });

    export const Cancel = z.null();

    export type Actions = z.TypeOf<typeof Actions>;
    export const Actions = z.union([MoveToCoordinate, WaterPlant]);
  }

  export namespace Task {
    export type MoveToCoordinate = z.TypeOf<typeof MoveToCoordinate>;
    export const MoveToCoordinate = Actions.MoveToCoordinate.and(
      z.object({
        start: z.number(),
        from: Pos.Type,
      })
    );

    export type WaterPlant = z.TypeOf<typeof WaterPlant>;
    export const WaterPlant = z.lazy(() =>
      z.object({
        t: z.literal("WaterPlant"),
        start: z.number(),
        sensor: Sensor.Type,
      })
    );

    export type Type = z.TypeOf<typeof Type>;
    export const Type = z.union([MoveToCoordinate, WaterPlant]);
  }

  export type Type = z.TypeOf<typeof Type>;
  export const Type = ActorBase.and(
    z.object({
      t: z.literal("Robot"),
    })
  );

  export const make = ({ pos, id }: Pos.Type & { id?: string }): Type => ({
    t: "Robot",
    ...Id.make(id),
    pos,
  });
}

export namespace Sensor {
  export const WaterMinimumProximity = 50;

  export const Type = ActorBase.and(
    z.object({
      t: z.literal("Sensor"),
      // 100-150 - overwatered
      // 40-100 - ideal
      // 0-40 -  underwatered
      water: z.number(),
    })
  );
  export type Type = z.TypeOf<typeof Type>;
  export const make = ({
    pos,
    id,
  }: Pos.Type & {
    id?: string;
  }): Type => ({
    t: "Sensor",
    pos,
    ...Id.make(id),
    water: 100,
  });

  export namespace Actions {
    export type SetWaterLevel = z.TypeOf<typeof SetWaterLevel>;
    export const SetWaterLevel = z.object({
      t: z.literal("SetWaterLevel"),
      value: z.number(),
    });

    export type WaterPlant = z.TypeOf<typeof WaterPlant>;
    export const WaterPlant = z.object({
      t: z.literal("WaterPlant"),
      sensorId: z.string(),
    });

    export const Cancel = z.null();

    export type Actions = z.TypeOf<typeof Actions>;
    export const Actions = SetWaterLevel;

    export const apply = (
      _: Actor.ReadonlyActorsMap,
      robot: Type,
      action: Actions
    ) => {
      robot.water = action.value;
    };
  }

  export namespace WaterLevel {
    export const withinWateringProximity = (dist: number) =>
      dist < WaterMinimumProximity;

    export const isUnderwatered = (plant: Type) => plant.water < 40;
    export const isNormal = (plant: Type) =>
      plant.water >= 40 && plant.water <= 100;
    export const isOverwatered = (plant: Type) => plant.water > 100;

    export const applyWater = (plant: Type) => {
      if (isUnderwatered(plant)) {
        plant.water = 100;
        return;
      }
      if (isNormal(plant)) {
        plant.water = 120;
        return;
      }
      if (isOverwatered(plant)) {
        plant.water = Math.min(plant.water + 20, 100);
        return;
      }
    };
  }
}

export namespace Actor {
  export type Type = z.TypeOf<typeof Type>;
  export const Type = z.union([Robot.Type, Sensor.Type]);

  export type ActorsMap = Map<string, Type>;
  export type ReadonlyActorsMap = ReadonlyMap<string, Type>;

  export type Actors = z.TypeOf<typeof Actors>;
  export const Actors = z.array(Type);

  export type Actions = z.TypeOf<typeof Actions>;
  export const Actions = z.object({
    id: z.string(),
    action: z.union([Robot.Actions.Actions, Sensor.Actions.Actions]),
  });
}
