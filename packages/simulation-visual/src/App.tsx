import * as styles from "./sim.module.scss";
import "./App.scss";
import cls from "classnames";
import { VaettirReact } from "vaettir-react";
import { useEffect, useRef } from "react";
import { ActorCoord, Visualizer } from "./visualizer";
import { Effect, pipe } from "effect";
import { Actor, Robot } from "../../common-types/actors";
import { assumeRobot } from "../../common-types/client";
import { sleep } from "systemic-ts-utils/async-utils";

const SERVER = "http://localhost:3000";

export const App = () => {
  const visualizer = VaettirReact.useOwned(() => Visualizer(SERVER));
  const simulationRef = useRef<HTMLDivElement>(null);
  const dimension = visualizer.api.frame();
  const coords = visualizer.api.coords();

  useEffect(() => {
    // Init
    visualizer.api.init();

    // Auto resize
    const setFrameContainerPos = () =>
      visualizer.api.setFrameContainerPos({
        x: simulationRef.current?.clientWidth || 0,
        y: simulationRef.current?.clientHeight || 0,
      });

    window.addEventListener("resize", setFrameContainerPos);
    setTimeout(setFrameContainerPos, 1);

    return () => {
      window.removeEventListener("resize", setFrameContainerPos);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualizer.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const firstRobot = await (async () => {
        // eslint-disable-next-line no-constant-condition
        while (alive) {
          const coords = visualizer.api.coords();
          const robot = coords
            .map((x) => x.actor)
            .find((actor): actor is Robot.Type => actor.t === "Robot");
          if (robot) return assumeRobot(SERVER, robot.id);

          await sleep(1000);
        }
        throw new Error("");
      })();

      while (alive) {
        await Effect.runPromiseExit(
          Effect.tryPromise(() =>
            firstRobot.moveToCoord({
              x: Math.random() * 10,
              y: Math.random() * 10,
            })
          )
        );
        await sleep(1000);
      }
    })();

    return () => {
      alive = false;
    };
  }, [visualizer.api, visualizer.id]);

  return (
    <>
      <div className={cls(styles.frame)}>
        <div
          ref={simulationRef}
          className={cls(styles.simulation)}
          style={{ width: dimension.x, height: dimension.y }}
        >
          {coords.map((coord) => (
            <ActorView key={coord.actor.id} actorCoord={coord} />
          ))}
        </div>
      </div>
    </>
  );
};

const actorCoordToChar = (actor: Actor.Type) =>
  pipe(actor.t, (t) => {
    switch (t) {
      case "Robot":
        return "🤖";
      case "Sensor":
        return "🌱";
      case "WaterPump":
        return "🚰";
    }
  });

const actorTip = (actor: Actor.Type) =>
  `
type: ${actor.t}
coord: ${Math.round(actor.pos.x * 100) / 100}, ${
    Math.round(actor.pos.y * 100) / 100
  }
`.trim();

export const ActorViewDimension = 40;
export const ActorView = ({
  actorCoord: {
    actor,
    pos: { x, y },
  },
}: {
  actorCoord: ActorCoord;
}) => (
  <div
    className={cls(styles.actorCoord)}
    style={{
      left: x - ActorViewDimension / 2,
      top: y - ActorViewDimension / 2,
    }}
  >
    {actorCoordToChar(actor)}
    <div className={cls(styles.tip)}>
      <pre>{actorTip(actor)}</pre>
    </div>
  </div>
);

export default App;
