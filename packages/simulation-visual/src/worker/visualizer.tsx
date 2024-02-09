import { Actor, Pos } from "../../../common-types/actors";
import "../App.scss";
import { Vaettir, VaettirReact } from "vaettir-react";
import { BoolLock } from "systemic-ts-utils/lock";
import { sleep } from "systemic-ts-utils/async-utils";
import { Effect, Exit } from "effect";
import { getAllActors } from "../../../common-types/client";

const ZOOM = 1;

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
          containerDimension: { x: 1000, y: 1000 } as Pos.Type["pos"],
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

              data.measurements.frameUnscaled = { x: 1000, y: 1000 };

              data.measurements.frameScaled = {
                x: data.measurements.frameUnscaled.x * 2 * ZOOM,
                y: data.measurements.frameUnscaled.y * 2 * ZOOM,
              };

              data.measurements.frameScaledAndPadded = {
                x: data.measurements.frameScaled.x,
                y: data.measurements.frameScaled.y,
              };

              data.measurements.xCenteringDiff = 500;
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
            x: actor.pos.x * ZOOM,
            y: actor.pos.y * ZOOM,
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
          x: relativeToCenter.x / ZOOM,
          y: relativeToCenter.y / ZOOM,
        };
        return descaled;
      };

      const setFrameContainerPos = () => {
        data.measurements.containerDimension = { x: 1000, y: 1000 };
        data.measurements.containerPos = { x: 0, y: 0 };
        data.measurements.fromViewport = { x: 1000, y: 1000 };
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
