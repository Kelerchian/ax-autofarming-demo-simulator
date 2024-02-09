import { ActorAssumerCtx } from "./worker/assume";
import * as style from "./AssumeView.module.scss";
import cls from "classnames";
import { ActorLogo } from "./ActorView";
import { useEffect, useMemo, useState } from "react";
import { SelectorCtx } from "./worker/selector";
import { pipe } from "effect";

export const AssumeView = () => {
  const assumer = ActorAssumerCtx.borrowListen();
  const assumed = assumer.api.getAssumed();
  const [selecting, setSelecting] = useState(false);

  return (
    <div className={cls(style.assumeView, "flex column nowrap")}>
      <div className={cls("flex row nowrap", style.status)}>
        <Box
          role="button"
          title="Assume"
          onClick={() => {
            setSelecting((x) => !x);
          }}
        >
          🎮 Select
        </Box>
        {assumed &&
          pipe(assumed.actor, (actor) => (
            <Box title="Assume">
              Selected:
              <ActorLogo actor={actor} /> {actor.id}
            </Box>
          ))}
      </div>
      {selecting && (
        <div className={cls("flex row nowrap")}>
          <AssumeSelect onDone={() => setSelecting(false)} />
        </div>
      )}
    </div>
  );
};

export const AssumeSelect = ({ onDone }: { onDone: () => unknown }) => {
  const assumer = ActorAssumerCtx.borrowListen();
  const selector = SelectorCtx.borrow();
  const selections = selector.api.selections();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hoverAgent = useMemo(selector.api.createHoverAgent, []);

  useEffect(() => {
    selector.api.refresh();

    const unsub = selector.api.registerListener((actor) => {
      assumer.api.assume(actor.id);
      onDone();
    });

    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector.api, assumer.api]);

  useEffect(() => {
    return () => {
      hoverAgent.unhover();
    };
  }, [hoverAgent]);

  return (
    <Box className={cls("flex column nowrap")}>
      <div className={cls("flex row nowrap align-center")} style={{ gap: 3 }}>
        <h4>Select Actor</h4>
        <Box role="button" onClick={() => selector.api.refresh()}>
          ⟳
        </Box>
      </div>
      <div className={cls("flex column nowrap justify-start")}>
        {selections.map((actor) => (
          <Box
            onMouseEnter={() => hoverAgent.hover(actor)}
            onMouseLeave={() => hoverAgent.unhover()}
            role="button"
            className={cls(
              "flex row nowrap",
              selector.api.shouldHighlight(actor) && style.highlight
            )}
            onClick={() => selector.api.click(actor)}
          >
            <ActorLogo actor={actor} />
            {actor.id}
          </Box>
        ))}
      </div>
    </Box>
  );
};

export const Box = (
  props: React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  >
) => <div {...props} className={cls(style.box, props.className)} />;
