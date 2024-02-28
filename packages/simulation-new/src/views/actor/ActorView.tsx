import { ActorSim } from "../../worker/sim";
import cls from "classnames";
import * as styles from "./ActorView.module.scss";
import { ActorData, PlantData } from "../../common/actors";
import { SelectorCtx } from "../../worker/selector";
import React, { useEffect, useMemo } from "react";
import { ActorAssumerCtx } from "../../worker/assume";
import {
  WINDOW_X_CENTER,
  WINDOW_X_SIZE,
  WINDOW_Y_CENTER,
  WINDOW_Y_SIZE,
} from "../../common/window";
import { VaettirReact } from "vaettir-react";

export const VisualizerFrame = (
  props: React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  >
) => (
  <div className={cls(styles.frame)}>
    <div
      className={cls(styles.simulation)}
      style={{
        width: WINDOW_X_SIZE,
        maxWidth: WINDOW_X_SIZE,
        height: WINDOW_Y_SIZE,
        maxHeight: WINDOW_Y_SIZE,
      }}
    >
      {props.children}
    </div>
  </div>
);
export const ActorViewDimension = 0;
export const ActorView = ({ sim }: { sim: ActorSim }) => {
  const selector = SelectorCtx.borrow();
  const actor = sim.api.actor();
  VaettirReact.useObs(sim.channels.change);
  const assumer = ActorAssumerCtx.borrowListen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hoverAgent = useMemo(selector.api.createHoverAgent, []);
  const isSelecting = selector.api.shouldHighlight(actor);
  const isAssumed = assumer.api.getAssumed()?.actor.id === actor.id;

  useEffect(() => {
    return () => {
      hoverAgent.unhover();
    };
  }, [hoverAgent]);

  return (
    <div
      onMouseEnter={() => hoverAgent.hover(actor)}
      onMouseLeave={() => hoverAgent.unhover()}
      className={cls(
        styles.actorCoord,
        isSelecting && styles.actorHighlight,
        isAssumed && styles.actorSelected
      )}
      style={{
        left: actor.pos.x + WINDOW_X_CENTER,
        top: actor.pos.y + WINDOW_Y_CENTER,
      }}
      {...((isSelecting && {
        role: "button",
        onClick: () => selector.api.click(actor),
      }) ||
        {})}
    >
      <ActorLogo actor={actor} />
      <div className={cls(styles.tip)}>
        <pre>{actorTip(actor)}</pre>
      </div>
    </div>
  );
};

export const ActorLogo = ({ actor }: { actor: ActorData.Type }) => {
  if (actor.t === "Robot") {
    return "🤖";
  }
  if (actor.t === "Plant") {
    if (PlantData.WaterLevel.isNormal(actor)) {
      return "🌹";
    } else if (PlantData.WaterLevel.isUnderwatered(actor)) {
      return (
        <span style={{ filter: "saturate(0.3) sepia(0.9) saturate(2)" }}>
          🥀
        </span>
      );
    } else {
      return "🥀";
    }
  }
};

const actorTip = (actor: ActorData.Type) =>
  [
    `id: ${actor.id}`,
    `type: ${actor.t}`,
    `coord: ${Math.round(actor.pos.x * 100) / 100}, ${
      Math.round(actor.pos.y * 100) / 100
    }`,
    plantWaterLevelTip(actor),
  ]
    .filter((x) => !!x)
    .join("\n");

const plantWaterLevelTip = (actor: ActorData.Type) => {
  if (actor?.t !== "Plant") {
    return undefined;
  }
  return `water: ${Math.round(actor.water)}%`;
};
