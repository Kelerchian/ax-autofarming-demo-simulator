import { VaettirReact } from "vaettir-react";
import { Simulator, SimulatorCtx } from "./worker/sim";
import { ActorAssumer, ActorAssumerCtx } from "./worker/assume";
import { ActorView, VisualizerFrame } from "./views/actor/ActorView";
import { AssumeView } from "./views/assumption/AssumeView";
import { Selector, SelectorCtx } from "./worker/selector";

export const SimulatorView = ({ simulator }: { simulator: Simulator }) => {
  VaettirReact.useObs(simulator.channels.change);
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
