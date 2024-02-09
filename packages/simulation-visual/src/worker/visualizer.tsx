import { Actor, Pos } from "../../../common-types/actors";
import "../App.scss";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { sleep } from "systemic-ts-utils/async-utils";
import { Effect, Exit, pipe } from "effect";
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
        lastFetch: null as null | Awaited<ReturnType<typeof fetchState>>, // error reporting purpose
        measurements: {
          fromViewport: { x: 0, y: 0 } as Pos.Type["pos"],
          containerPos: { x: 0, y: 0 } as Pos.Type["pos"],
          containerDimension: { x: -Infinity, y: -Infinity } as Pos.Type["pos"],
          frameUnscaled: { x: 0, y: 0 } as Pos.Type["pos"],
          frameScaled: { x: 0, y: 0 } as Pos.Type["pos"],
          frameScaledAndPadded: { x: 0, y: 0 } as Pos.Type["pos"],
          xCenteringDiff: 0,
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
              data.measurements.frameUnscaled = { x: maxX, y: maxY };

              data.measurements.frameScaled = {
                x: data.measurements.frameUnscaled.x * 2 * COORD_MULTIPLIER,
                y: data.measurements.frameUnscaled.y * 2 * COORD_MULTIPLIER,
              };

              data.measurements.frameScaledAndPadded = {
                x: data.measurements.frameScaled.x + COORD_PADDING * 2,
                y: data.measurements.frameScaled.y + COORD_PADDING * 2,
              };

              data.measurements.xCenteringDiff = (() => {
                if (
                  data.measurements.containerDimension.x >
                    data.measurements.frameScaledAndPadded.x &&
                  data.measurements.containerDimension.x !== 0
                ) {
                  const screenCenterX =
                    data.measurements.containerDimension.x / 2;
                  const prerenderCenterX =
                    data.measurements.frameScaledAndPadded.x / 2;
                  const diff = screenCenterX - prerenderCenterX;
                  return diff;
                }
                return 0;
              })();
            }

            channels.change.emit();
            await sleep(30);
          }
        });

      const frame = (): Readonly<Pos.Type["pos"]> =>
        data.measurements.frameScaledAndPadded;

      const actorsMap = (): Actor.ActorsMap =>
        (data.actors || []).reduce((acc, x) => {
          acc.set(x.id, x);
          return acc;
        }, new Map());

      const coords = (): ActorCoord[] =>
        (data.actors || []).map((actor) => ({
          actor,
          pos: {
            x:
              (actor.pos.x + data.measurements.frameUnscaled.x) *
                COORD_MULTIPLIER +
              COORD_PADDING +
              data.measurements.xCenteringDiff,
            y:
              (actor.pos.y + data.measurements.frameUnscaled.y) *
                COORD_MULTIPLIER +
              COORD_PADDING,
          },
        }));

      const viewportCoordinateToMapCoordinate = (
        pos: Pos.Type["pos"]
      ): Pos.Type["pos"] => {
        const {
          fromViewport: { x, y },
          containerDimension: { x: width, y: height },
        } = data.measurements;
        const center = {
          x: x + width / 2,
          y: y + height / 2,
        };
        const relativeToCenter = {
          x: pos.x - center.x,
          y: pos.y - center.y,
        };
        const descaled = {
          x: relativeToCenter.x / COORD_MULTIPLIER,
          y: relativeToCenter.y / COORD_MULTIPLIER,
        };
        return descaled;
      };

      const setFrameContainerPos = ({
        x,
        y,
        width,
        height,
        boundingX,
        boundingY,
      }: {
        x: number;
        y: number;
        width: number;
        height: number;
        boundingX: number;
        boundingY: number;
      }) => {
        data.measurements.containerDimension = { x: width, y: height };
        data.measurements.containerPos = { x, y };
        data.measurements.fromViewport = { x: boundingX, y: boundingY };
      };

      return {
        init,
        frame,
        coords,
        setFrameContainerPos,
        actorsMap,
        viewportCoordinateToMapCoordinate,
      };
    })
    .finish();
