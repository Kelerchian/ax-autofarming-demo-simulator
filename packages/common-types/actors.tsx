import * as z from "zod";
import { v4 as uuid } from "uuid";
import { pipe } from "effect";

export namespace Pos {
  const RANDOM_MINIMUM_DEVIATION = 20;
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
          x: radius * Math.sin(angle),
          y: radius * Math.cos(angle),
        },
      })
    );
}

export const Id = z.object({ id: z.string() });
export type Id = z.TypeOf<typeof Id>;
export const id = (): Id => ({ id: uuid() });

/// Actors
/// ===================

const ActorBase = z.object({}).and(Pos.Type).and(Id);

export namespace Robot {
  export namespace Task {
    export type DrawWater = z.TypeOf<typeof DrawWater>;
    export const DrawWater = z.object({
      t: z.literal("DrawWater"),
      start: z.number(),
      from: Pos.Type,
      to: Pos.Type,
    });

    export type DeliverWater = z.TypeOf<typeof DeliverWater>;
    export const DeliverWater = z.object({
      t: z.literal("DeliverWater"),
      start: z.number(),
      from: Pos.Type,
      to: Pos.Type,
    });

    export type Thinking = z.TypeOf<typeof Thinking>;
    export const Thinking = z.object({
      t: z.literal("Thinking"),
      start: z.number(),
    });

    export type Type = z.TypeOf<typeof Type>;
    export const Type = z.union([DrawWater, DeliverWater, Thinking]);
  }

  export type Type = z.TypeOf<typeof Type>;
  export const Type = ActorBase.and(
    z.object({
      t: z.literal("Robot"),
      data: z.object({
        task: z.null().or(Task.Type),
        lastTask: z.null().or(Task.DeliverWater).or(Task.DrawWater),
      }),
    })
  );

  export const make = ({ pos }: { pos: Pos.Type }): Type => ({
    t: "Robot",
    data: {
      task: null,
      lastTask: null,
    },
    ...id(),
    ...pos,
  });
}

export namespace Sensor {
  export const Type = ActorBase.and(z.object({ t: z.literal("Sensor") }));
  export type Type = z.TypeOf<typeof Type>;
  export const make = ({ pos }: { pos: Pos.Type }): Type => ({
    t: "Sensor",
    ...id(),
    ...pos,
  });
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
  export const Type = z.union([Robot.Type, Sensor.Type, WaterPump.Type]);
  export type Type = z.TypeOf<typeof Type>;
}
