import * as styles from "./sim.module.scss";
import "./App.scss";
import cls from "classnames";
import { VaettirReact } from "vaettir-react";
import { useEffect } from "react";
import { ActorCoord, Visualizer } from "./visualizer";
import { pipe } from "effect";
import { Actor } from "../../common-types/actors";

export const App = () => {
  const visualizer = VaettirReact.useOwned(Visualizer);

  useEffect(() => {
    visualizer.api.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualizer.id]);

  const dimension = visualizer.api.dimension();
  const coords = visualizer.api.coords();

  console.log(coords);

  return (
    <>
      <div className={cls(styles.frame)}>
        <div
          className={cls(styles.simulation)}
          style={{ width: dimension.x, height: dimension.y }}
        >
          {coords.map((coord) => (
            <ActorView actorCoord={coord} />
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
