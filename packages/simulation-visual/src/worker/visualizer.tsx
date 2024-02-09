import { Actor, Pos } from "../../../common-types/actors";
import "../App.scss";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { sleep } from "systemic-ts-utils/async-utils";
import { Effect, Exit } from "effect";
import { getAllActors } from "../../../common-types/client";
import {
  WINDOW_X_CENTER,
  WINDOW_X_SIZE,
  WINDOW_Y_SIZE,
} from "../../../common-types/window";

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
          containerDimension: {
            x: WINDOW_X_SIZE,
            y: WINDOW_Y_SIZE,
          } as Pos.Type["pos"],
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

              data.measurements.frameUnscaled = {
                x: WINDOW_X_SIZE,
                y: WINDOW_Y_SIZE,
              };

              data.measurements.frameScaled = {
                x: data.measurements.frameUnscaled.x * 2,
                y: data.measurements.frameUnscaled.y * 2,
              };

              data.measurements.frameScaledAndPadded = {
                x: data.measurements.frameScaled.x,
                y: data.measurements.frameScaled.y,
              };

              data.measurements.xCenteringDiff = WINDOW_X_CENTER;
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
            x: actor.pos.x,
            y: actor.pos.y,
          },
        }));

      const viewportCoordinateToMapCoordinate = (
        pos: Pos.Type["pos"]
      ): Pos.Type["pos"] => {
        const center = {
          x: 0,
          y: 0,
        };
        const relativeToCenter = {
          x: pos.x - center.x,
          y: pos.y - center.y,
        };
        const descaled = {
          x: relativeToCenter.x,
          y: relativeToCenter.y,
        };
        return descaled;
      };

      const setFrameContainerPos = () => {
        data.measurements.containerDimension = {
          x: WINDOW_X_SIZE,
          y: WINDOW_Y_SIZE,
        };
        data.measurements.containerPos = { x: 0, y: 0 };
        data.measurements.fromViewport = { x: WINDOW_X_SIZE, y: WINDOW_Y_SIZE };
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
