import { Destruction } from "systemic-ts-utils/destruction";
import { Vaettir, VaettirReact } from "vaettir-react";
import { ActorSim, ControlHandle, Simulator } from "./sim";

export const ActorAssumerCtx = VaettirReact.Context.make<ActorAssumer>();

export type ActorAssumer = ReturnType<typeof ActorAssumer>;
export const ActorAssumer = (simulator: Simulator) =>
  Vaettir.build()
    .api(({ channels }) => {
      const data = {
        assumedActor: null as
          | null
          | ({
              sim: ActorSim;
            } & ControlHandle),
        cleanup: Destruction.make(),
      };

      const cleanUpAndSwap = () => {
        data.cleanup.destroy();
        const newCleanup = Destruction.make();
        data.cleanup = newCleanup;
      };

      const assume = (id: string) => {
        cleanUpAndSwap();

        const sim = simulator.api.actorsMap().get(id);
        if (!sim) return;

        const controlHandle: ControlHandle = sim.api.controlHandle();

        data.assumedActor = {
          ...controlHandle,
          sim,
        };

        channels.change.emit();

        data.cleanup.onDestroy(
          sim.channels.change.sub(() => {
            channels.change.emit();
          })
        );
      };

      return {
        assume,
        getAssumed: () => data.assumedActor,
      };
    })
    .finish();
