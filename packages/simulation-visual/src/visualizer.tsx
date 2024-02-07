import { Actor, Pos } from "../../common-types/actors";
import * as z from "zod";
import "./App.scss";
import { Vaettir } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { sleep } from "systemic-ts-utils/async-utils";
import { Effect, Exit } from "effect";

type Actors = z.TypeOf<typeof Actors>;
const Actors = z.array(Actor.Type);

const COORD_MULTIPLIER = 10;

export type ActorCoord = { actor: Actor.Type; pos: Pos.Type["pos"] };

const fetchState = (SERVER: string) =>
  Effect.runPromiseExit(
    Effect.tryPromise(
      (): Promise<Actors> =>
        fetch(`${SERVER}/state`)
          .then((res) => res.json())
          .then((json) => Actors.parse(json))
    )
  );

export const Visualizer = (SERVER = "http://localhost:3000") =>
  Vaettir.build()
    .api(({ isDestroyed, channels }) => {
      const data = {
        taskLock: BoolLock.make(),
        actors: null as null | Actors, // actor population
        lastFetch: null as null | Awaited<ReturnType<typeof fetchState>>, // error reporting purposoe
        dimension: {
          max: { x: 0, y: 0 } as Pos.Type["pos"],
          min: { x: 0, y: 0 } as Pos.Type["pos"],
          calculated: { x: 0, y: 0 } as Pos.Type["pos"],
        },
      };

      const init = () =>
        data.taskLock.use(async () => {
          while (!isDestroyed()) {
            const lastFetch = await fetchState(SERVER);
            data.lastFetch = lastFetch;

            if (Exit.isSuccess(lastFetch)) {
              data.actors = lastFetch.value;

              // calculate data.dimension
              lastFetch.value.forEach((item) => {
                data.dimension.max.x = Math.max(
                  item.pos.x,
                  data.dimension.max.x
                );
                data.dimension.max.y = Math.max(
                  item.pos.y,
                  data.dimension.max.y
                );
                data.dimension.min.x = Math.min(
                  item.pos.x,
                  data.dimension.min.x
                );
                data.dimension.min.y = Math.min(
                  item.pos.y,
                  data.dimension.min.y
                );
              });
              data.dimension.calculated = {
                x:
                  (data.dimension.max.x - data.dimension.min.x) *
                  COORD_MULTIPLIER,
                y:
                  (data.dimension.max.y - data.dimension.min.y) *
                  COORD_MULTIPLIER,
              };
            }

            channels.change.emit();
            await sleep(30);
          }
        });

      const dimension = (): Readonly<Pos.Type["pos"]> =>
        data.dimension.calculated;

      const coords = (): ActorCoord[] =>
        (data.actors || []).map((actor) => ({
          actor,
          pos: {
            x: (actor.pos.x - data.dimension.min.x) * COORD_MULTIPLIER,
            y: (actor.pos.y - data.dimension.min.y) * COORD_MULTIPLIER,
          },
        }));

      return { init, dimension, coords };
    })
    .finish();
