import { ActorSim } from "../../worker/sim";
import cls from "classnames";
import * as styles from "./ActorView.module.scss";
import { Actor, Sensor } from "../../common/actors";
import { SelectorCtx } from "../../worker/selector";
import React, { useEffect, useMemo } from "react";
import { ActorAssumerCtx } from "../../worker/assume";
import {
  WINDOW_X_CENTER,
  WINDOW_X_SIZE,
  WINDOW_Y_CENTER,
  WINDOW_Y_SIZE,
} from "../../common/window";

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

export const ActorLogo = ({ actor }: { actor: Actor.Type }) => {
  if (actor.t === "Robot") {
    return "🤖";
  }
  if (actor.t === "Sensor") {
    if (Sensor.WaterLevel.isNormal(actor)) {
      return "🌹";
    } else if (Sensor.WaterLevel.isUnderwatered(actor)) {
      return (
        <span style={{ filter: "saturate(0.3) sepia(0.9) saturate(2)" }}>
          🥀
        </span>
      );
    } else {
      return "🥀";
    }
  }
  if (actor.t === "WaterPump") {
    return "🚰";
  }
};

const actorTip = (actor: Actor.Type) =>
  [
    `type: ${actor.t}`,
    `coord: ${Math.round(actor.pos.x * 100) / 100}, ${
      Math.round(actor.pos.y * 100) / 100
    }`,
    robotTaskTip(actor),
    plantWaterLevelTip(actor),
  ]
    .filter((x) => !!x)
    .join("\n");

const robotTaskTip = (actor: Actor.Type) => {
  if (actor?.t !== "Robot" || actor.data.task == null) {
    return undefined;
  }
  return `task: ${actor.data.task.t}`;
};

const plantWaterLevelTip = (actor: Actor.Type) => {
  if (actor?.t !== "Sensor") {
    return undefined;
  }
  return `water: ${Math.round(actor.data.water)}%`;
};
