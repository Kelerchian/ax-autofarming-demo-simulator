import { Actor, Pos } from "../../../common-types/actors";
import "../App.scss";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { sleep } from "systemic-ts-utils/async-utils";
import { Effect, Exit } from "effect";
import { getAllActors } from "../../../common-types/client";

const COORD_MULTIPLIER = 10;
const COORD_PADDING = 100;

export const VisualizerCtx = VaettirReact.Context.make<Visualizer>();

export type ActorCoord = { actor: Actor.Type; pos: Pos.Type["pos"] };

const fetchState = (SERVER: string) =>
  Effect.runPromiseExit(Effect.tryPromise(() => getAllActors(SERVER)));

export type Visualizer = ReturnType<typeof Visualizer>;
export const Visualizer = (SERVER: string) =>
  Vaettir.build()
    .api(({ isDestroyed, channels }) => {
      const data = {
        taskLock: BoolLock.make(),
        actors: null as null | Actor.Actors, // actor population
        lastFetch: null as null | Awaited<ReturnType<typeof fetchState>>, // error reporting purposoe
        dimension: {
          frameContainer: { x: -Infinity, y: -Infinity } as Pos.Type["pos"],
          frameRawEdgeDistance: { x: 0, y: 0 } as Pos.Type["pos"],
          frameInner: { x: 0, y: 0 } as Pos.Type["pos"],
          frameOuter: { x: 0, y: 0 } as Pos.Type["pos"],
        },
      };

      const init = () =>
        data.taskLock.use(async () => {
          while (!isDestroyed()) {
            const lastFetch = await fetchState(SERVER);
            data.lastFetch = lastFetch;

            if (Exit.isSuccess(lastFetch)) {
              data.actors = lastFetch.value;

              let maxX = 0;
              let maxY = 0;

              // calculate data.dimension
              lastFetch.value.forEach((item) => {
                maxX = Math.max(Math.abs(item.pos.x), maxX);
                maxY = Math.max(Math.abs(item.pos.y), maxY);
              });
              //
              data.dimension.frameRawEdgeDistance = {
                x: maxX,
                y: maxY,
              };
              data.dimension.frameInner = {
                x: data.dimension.frameRawEdgeDistance.x * 2 * COORD_MULTIPLIER,
                y: data.dimension.frameRawEdgeDistance.y * 2 * COORD_MULTIPLIER,
              };

              data.dimension.frameOuter = {
                x: data.dimension.frameInner.x + COORD_PADDING * 2,
                y: data.dimension.frameInner.y + COORD_PADDING * 2,
              };
            }

            channels.change.emit();
            await sleep(30);
          }
        });

      const frame = (): Readonly<Pos.Type["pos"]> => data.dimension.frameOuter;

      const actorsMap = (): Actor.ActorsMap =>
        (data.actors || []).reduce((acc, x) => {
          acc.set(x.id, x);
          return acc;
        }, new Map());

      const coords = (): ActorCoord[] => {
        const xCenteringDiff = (() => {
          if (
            data.dimension.frameContainer.x > data.dimension.frameOuter.x &&
            data.dimension.frameContainer.x !== 0
          ) {
            const screenCenterX = data.dimension.frameContainer.x / 2;
            const prerenderCenterX = data.dimension.frameOuter.x / 2;
            const diff = screenCenterX - prerenderCenterX;
            return diff;
          }
          return 0;
        })();

        return (data.actors || []).map((actor) => ({
          actor,
          pos: {
            x:
              (actor.pos.x + data.dimension.frameRawEdgeDistance.x) *
                COORD_MULTIPLIER +
              COORD_PADDING +
              xCenteringDiff,
            y:
              (actor.pos.y + data.dimension.frameRawEdgeDistance.y) *
                COORD_MULTIPLIER +
              COORD_PADDING,
          },
        }));
      };

      const setFrameContainerPos = (pos: Pos.Type["pos"]) =>
        (data.dimension.frameContainer = pos);

      return { init, frame, coords, setFrameContainerPos, actorsMap };
    })
    .finish();
