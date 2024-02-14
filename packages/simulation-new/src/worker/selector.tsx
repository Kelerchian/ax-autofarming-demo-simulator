import { Vaettir } from "vaettir";
import { Simulator } from "./sim";
import { VaettirReact } from "vaettir-react";
import { Obs } from "systemic-ts-utils/obs";
import { Actor } from "../common/actors";
import { pipe } from "effect";

export const SelectorCtx =
  VaettirReact.Context.make<ReturnType<typeof Selector>>();

export const Selector = (simulator: Simulator) =>
  Vaettir.build()
    .channels((x) => ({ ...x, hoverInfoChanged: Obs.make<void>() }))
    .api(({ channels }) => {
      const data = {
        hovers: {
          actorMap: new Map<symbol, Actor.Type>(),
          idSet: new Set<string>(),
        },
        onClick: Obs.make<Actor.Type>(),
      };

      const refreshIdSet = () => {
        data.hovers.idSet = pipe(
          data.hovers.actorMap.values(),
          (iter) => Array.from(iter),
          (arr) => new Set(arr.map((x) => x.id))
        );
        channels.hoverInfoChanged.emit();
      };

      return {
        selections: () =>
          Array.from(simulator.api.actors()).map((x) => x.api.actor()),
        registerListener: (fn: (actor: Actor.Type) => unknown) => {
          const unsub = data.onClick.sub(fn);
          return unsub;
        },
        createHoverAgent: () => {
          const symbol = Symbol();
          return {
            hover: (actor: Actor.Type) => {
              data.hovers.actorMap.set(symbol, actor);
              refreshIdSet();
            },
            unhover: () => {
              data.hovers.actorMap.delete(symbol);
              refreshIdSet();
            },
          };
        },
        click: (actor: Actor.Type) => data.onClick.emit(actor),
        shouldHighlight: (actor: Actor.Type) =>
          data.onClick.size() > 0 && data.hovers.idSet.has(actor.id),
      };
    })
    .finish();
