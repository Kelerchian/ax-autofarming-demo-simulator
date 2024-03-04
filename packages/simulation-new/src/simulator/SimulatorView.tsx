import { VaettirReact } from "vaettir-react";
import { Simulator, SimulatorCtx } from "./sim";
import { ActorAssumer, ActorAssumerCtx } from "./assume";
import { ActorView, VisualizerFrame } from "../views/actor/ActorView";
import { AssumeView } from "../views/assumption/AssumeView";
import { Selector, SelectorCtx } from "./selector";
import { Actyx } from "@actyx/sdk";
import ReactDOM from "react-dom/client";

export const SimulatorView = ({ actyx }: { actyx: Actyx }) => {
  const simulator = VaettirReact.useOwned(() => Simulator(actyx));
  const selector = VaettirReact.useOwned(() => Selector(simulator));
  const assumer = VaettirReact.useOwned(() => ActorAssumer(simulator));
  const actors = simulator.api.actors();

  return (
    <SimulatorCtx.Provider value={simulator}>
      <SelectorCtx.Provider value={selector}>
        <ActorAssumerCtx.Provider value={assumer}>
          <VisualizerFrame>
            {actors.map((actor) => (
              <ActorView key={actor.api.id} sim={actor} />
            ))}
          </VisualizerFrame>
          <AssumeView />
        </ActorAssumerCtx.Provider>
      </SelectorCtx.Provider>
    </SimulatorCtx.Provider>
  );
};

export const runSimulator = (actyx: Actyx) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <SimulatorView actyx={actyx} />
  );
};
