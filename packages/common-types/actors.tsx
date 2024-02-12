import * as z from "zod";
import { v4 as uuid } from "uuid";
import { pipe } from "effect";
import { WINDOW_X_CENTER, WINDOW_Y_CENTER } from "./window";

export namespace Pos {
  const RANDOM_MINIMUM_DEVIATION = 100;
  export const Type = z.object({
    pos: z.object({
      x: z.number(),
      y: z.number(),
    }),
  });
  export type Type = z.TypeOf<typeof Type>;
  export const makeRandom = (inputRadius: number = 0): Type =>
    pipe(
      {
        angle: pipe(
          Math.random() * Math.PI * 2,
          (degreeRad) => Math.round(degreeRad * 1000) / 1000
        ),
        radius: pipe(inputRadius, (r) => Math.max(r, RANDOM_MINIMUM_DEVIATION)), // normalize
      },
      ({ angle, radius: radius }): Type => ({
        pos: {
          x: WINDOW_X_CENTER + radius * Math.sin(angle),
          y: WINDOW_Y_CENTER + radius * Math.cos(angle),
        },
      })
    );

  export const distance = (a: Type["pos"], b: Type["pos"]) => {
    const x = a.x - b.x;
    const y = a.y - b.y;
    return Math.sqrt(x * x + y * y);
  };
}

export const Id = z.object({ id: z.string() });
export type Id = z.TypeOf<typeof Id>;
export const id = (): Id => ({ id: uuid() });

/// Actors
/// ===================

const ActorBase = z.object({}).and(Pos.Type).and(Id);

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

    export const apply = (
      actors: Actor.ReadonlyActorsMap,
      robot: Type,
      action: Actions
    ) => {
      robot.data.task = (() => {
        if (action.t === "MoveToCoordinate") {
          return {
            t: "MoveToCoordinate",
            start: Date.now(),
            from: { pos: robot.pos },
            to: action.to,
          };
        }
        if (action.t === "WaterPlant") {
          const sensor = actors.get(action.sensorId);
          if (sensor?.t === "Sensor") {
            const distance = Pos.distance(robot.pos, sensor.pos);
            if (Sensor.WaterLevel.withinWateringProximity(distance)) {
              return {
                t: "WaterPlant",
                start: Date.now(),
                sensor,
              };
            }
          }
        }
        return null;
      })();
    };

    export namespace Step {
      const ROBOT_SPEED = 0.5; // unit / milliseconds
      const WATERING_DURATION = 3000; // milliseconds

      export const step = (robot: Type) => {
        const task = robot.data.task;
        if (task?.t === "MoveToCoordinate") {
          return moveToCoord(robot, task);
        }
        if (task?.t === "WaterPlant") {
          return waterPlant(robot, task);
        }
      };

      export const moveToCoord = (robot: Type, task: Task.MoveToCoordinate) => {
        const { from, to, start } = task;
        const deltaX = to.pos.x - from.pos.x;
        const deltaY = to.pos.y - from.pos.y;
        const totalDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const currentDist = (Date.now() - start) * ROBOT_SPEED;

        // hasn't reached destination
        if (currentDist < totalDist) {
          robot.pos = pipe(Math.atan2(deltaY, deltaX), (angle) => ({
            x: from.pos.x + currentDist * Math.cos(angle),
            y: from.pos.y + currentDist * Math.sin(angle),
          }));
          return;
        }

        // robot reached destination
        robot.pos = { ...to.pos };
        robot.data.task = null;
      };

      export const waterPlant = (robot: Type, task: Task.WaterPlant) => {
        const sensor = task.sensor;
        if (Date.now() < task.start + WATERING_DURATION) {
          return;
        }
        Sensor.WaterLevel.applyWater(sensor);
        robot.data.task = null;
      };
    }
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
      data: z.object({
        task: z.null().or(Task.Type),
      }),
    })
  );

  export const make = ({ pos }: { pos: Pos.Type }): Type => ({
    t: "Robot",
    data: {
      task: null,
    },
    ...id(),
    ...pos,
  });
}

export namespace Sensor {
  export const WaterMinimumProximity = 50;

  export const Type = ActorBase.and(
    z.object({
      t: z.literal("Sensor"),
      data: z.object({
        // 100-150 - overwatered
        // 40-100 - ideal
        // 0-40 -  underwatered
        water: z.number(),

        /**
         * water level drop per millisecond
         */
        decay: z.number(),
      }),
    })
  );
  export type Type = z.TypeOf<typeof Type>;
  export const make = ({
    pos,
    decay,
  }: {
    pos: Pos.Type;
    decay?: number;
  }): Type => ({
    t: "Sensor",
    ...id(),
    ...pos,
    data: { water: 100, decay: Math.max(0.002 || decay, 0.002) },
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
      robot.data.water = action.value;
    };
  }

  export namespace Decay {
    export const step = (plant: Sensor.Type, deltaMs: number) => {
      plant.data.water = Math.max(
        plant.data.water - deltaMs * plant.data.decay,
        0
      );
    };
  }

  export namespace WaterLevel {
    export const withinWateringProximity = (dist: number) =>
      dist < WaterMinimumProximity;

    export const isUnderwatered = (plant: Type) => plant.data.water < 40;
    export const isNormal = (plant: Type) =>
      plant.data.water >= 40 && plant.data.water <= 100;
    export const isOverwatered = (plant: Type) => plant.data.water > 100;

    export const applyWater = (plant: Type) => {
      if (isUnderwatered(plant)) {
        plant.data.water = 100;
        return;
      }
      if (isNormal(plant)) {
        plant.data.water = 120;
        return;
      }
      if (isOverwatered(plant)) {
        plant.data.water = Math.min(plant.data.water + 20, 100);
        return;
      }
    };
  }
}

export namespace WaterPump {
  export const Type = ActorBase.and(z.object({ t: z.literal("WaterPump") }));
  export type Type = z.TypeOf<typeof Type>;
  export const make = ({ pos }: { pos: Pos.Type }): Type => ({
    t: "WaterPump",
    ...id(),
    ...pos,
  });
}

export namespace Actor {
  export type Type = z.TypeOf<typeof Type>;
  export const Type = z.union([Robot.Type, Sensor.Type, WaterPump.Type]);

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
