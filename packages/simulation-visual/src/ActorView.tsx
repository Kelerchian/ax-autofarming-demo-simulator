import { ActorCoord } from "./worker/visualizer";
import cls from "classnames";
import * as styles from "./sim.module.scss";
import { Actor } from "../../common-types/actors";
import { pipe } from "effect";
import { SelectorCtx } from "./worker/selector";
import { useEffect, useMemo } from "react";
import { ActorAssumerCtx } from "./worker/assume";

export const ActorViewDimension = 40;
export const ActorView = ({
  actorCoord: {
    actor,
    pos: { x, y },
  },
}: {
  actorCoord: ActorCoord;
}) => {
  const selector = SelectorCtx.borrow();
  const assumer = ActorAssumerCtx.borrowListen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hoverAgent = useMemo(selector.api.createHoverAgent, []);
  const isSelecting = selector.api.shouldHighlight(actor);
  const isAssumed = assumer.api.getAssumed()?.actor.id === actor.id

  useEffect(() => {
    return () => {
      hoverAgent.unhover();
    };
  }, [hoverAgent]);

  return (
    <div
      onMouseEnter={() => hoverAgent.hover(actor)}
      onMouseLeave={() => hoverAgent.unhover()}
      className={cls(styles.actorCoord, isSelecting && styles.actorHighlight, isAssumed && styles.actorSelected)}
      style={{
        left: x - ActorViewDimension / 2,
        top: y - ActorViewDimension / 2,
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

export const ActorLogo = ({ actor }: { actor: Actor.Type }) =>
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
