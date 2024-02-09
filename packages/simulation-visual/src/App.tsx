import * as styles from "./sim.module.scss";
import "./App.scss";
import cls from "classnames";
import { VaettirReact } from "vaettir-react";
import { useEffect, useRef } from "react";
import { Visualizer, VisualizerCtx } from "./worker/visualizer";
import { ActorAssumer, ActorAssumerCtx } from "./worker/assume";
import { ActorView } from "./ActorView";
import { AssumeView } from "./AssumeView";
import { Selector, SelectorCtx } from "./worker/selector";
import { WINDOW_X_SIZE, WINDOW_Y_SIZE } from "../../common-types/window";

const SERVER = "http://localhost:3000";

export const App = () => {
  const visualizer = VaettirReact.useOwned(() => Visualizer(SERVER));
  const selector = VaettirReact.useOwned(() => Selector(visualizer));
  const assumer = VaettirReact.useOwned(() => ActorAssumer(SERVER));
  const simulationRef = useRef<HTMLDivElement>(null);
  const coords = visualizer.api.coords();

  useEffect(() => {
    // Init
    visualizer.api.init();

    // Auto resize
    const setFrameContainerPos = () => {
      const elem = simulationRef.current;
      if (!elem) return;
      visualizer.api.setFrameContainerPos();
    };

    window.addEventListener("resize", setFrameContainerPos);
    setTimeout(setFrameContainerPos, 1);

    return () => {
      window.removeEventListener("resize", setFrameContainerPos);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualizer.id]);

  return (
    <VisualizerCtx.Provider value={visualizer}>
      <SelectorCtx.Provider value={selector}>
        <ActorAssumerCtx.Provider value={assumer}>
          <div className={cls(styles.frame)}>
            <div
              ref={simulationRef}
              className={cls(styles.simulation)}
              style={{
                width: WINDOW_X_SIZE,
                maxWidth: WINDOW_X_SIZE,
                height: WINDOW_Y_SIZE,
                maxHeight: WINDOW_Y_SIZE,
              }}
            >
              {coords.map((coord) => (
                <ActorView key={coord.actor.id} actorCoord={coord} />
              ))}
            </div>
          </div>
          <AssumeView />
        </ActorAssumerCtx.Provider>
      </SelectorCtx.Provider>
    </VisualizerCtx.Provider>
  );
};

export default App;
