import { ActorAssumerCtx } from "../../simulator/assume";
import * as style from "./AssumeView.module.scss";
import cls from "classnames";
import { ActorLogo } from "../actor/ActorView";
import { useEffect, useMemo, useState } from "react";
import { SelectorCtx } from "../../simulator/selector";
import { pipe } from "effect";
import { Pos, RobotData, PlantData } from "../../common/actors";
import {
  ControlHandle,
  RobotControlHandle,
  PlantControlHandle,
  SimulatorCtx,
} from "../../simulator/sim";
import React from "react";
import { Box } from "../Box";
import { WINDOW_X_CENTER, WINDOW_Y_CENTER } from "../../common/window";

export const AssumeView = React.memo(() => {
  const [selecting, setSelecting] = useState(false);

  const assumer = ActorAssumerCtx.borrowListen();
  const assumed = assumer.api.getAssumed();

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
      {selecting && <AssumeSelect onDone={() => setSelecting(false)} />}
      {assumed && !selecting && <AssumeControl control={assumed} />}
    </div>
  );
});

export const AssumeSelect = ({ onDone }: { onDone: () => unknown }) => {
  const assumer = ActorAssumerCtx.borrowListen();
  const selector = SelectorCtx.borrowListen();
  const selections = selector.api.selections();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hoverAgent = useMemo(selector.api.createHoverAgent, []);

  useEffect(() => {
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
      </div>
      <div className={cls("flex column nowrap justify-start")}>
        {selections.map((actor) => (
          <Box
            key={actor.id}
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

export const AssumeControl = ({ control }: { control: ControlHandle }) => {
  if (control.actor.t === "Robot") {
    return <AssumeControlRobot control={control as RobotControlHandle} />;
  }
  if (control.actor.t === "Plant") {
    return <AssumeControlPlant control={control as PlantControlHandle} />;
  }
  return <AssumeControlUnsupported control={control} />;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AssumeControlRobotMode {
  export const MoveTo: unique symbol = Symbol();
  export type MoveTo = typeof MoveTo;

  export const WaterPlant: unique symbol = Symbol();
  export type WaterPlant = typeof WaterPlant;

  export type Type = MoveTo | WaterPlant;
}

export const AssumeControlRobot = ({
  control,
}: {
  control: RobotControlHandle;
}) => {
  const [mode, setMode] = useState<null | AssumeControlRobotMode.Type>(null);

  return (
    <Box>
      {mode === null && (
        <>
          <Box
            role="button"
            onClick={() => setMode(AssumeControlRobotMode.MoveTo)}
          >
            Move
          </Box>
          <Box
            role="button"
            onClick={() => setMode(AssumeControlRobotMode.WaterPlant)}
          >
            Water
          </Box>
        </>
      )}
      {mode === AssumeControlRobotMode.MoveTo && (
        <AssumeControlRobotMoveTo
          onExec={(pos) => {
            control.control.moveToCoord(pos);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
      {mode === AssumeControlRobotMode.WaterPlant && (
        <AssumeControlRobotWaterPlant
          robot={control.actor}
          onExec={(plantId) => {
            control.control.waterPlant({
              id: plantId,
              pos: control.actor.pos,
            });
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
    </Box>
  );
};

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AssumeControlPlantMode {
  export const SetWaterLevel: unique symbol = Symbol();
  export type SetWaterLevel = typeof SetWaterLevel;

  export type Type = SetWaterLevel;
}

export const AssumeControlPlant = ({
  control,
}: {
  control: PlantControlHandle;
}) => {
  const [mode, setMode] = useState<null | AssumeControlPlantMode.Type>(null);

  return (
    <Box>
      {mode === null && (
        <>
          <Box
            role="button"
            onClick={() => setMode(AssumeControlPlantMode.SetWaterLevel)}
          >
            Set Water Level (current: {control.actor.water}) %
          </Box>
        </>
      )}
      {mode === AssumeControlPlantMode.SetWaterLevel && (
        <AssumeControlPlantSetWaterLevel
          onExec={(value) => {
            control.control.setWaterLevel(value);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
    </Box>
  );
};

export const AssumeControlPlantSetWaterLevel = ({
  onExec,
  onCancel,
}: {
  onExec: (val: number) => unknown;
  onCancel: () => unknown;
}) => {
  return (
    <>
      <h4>Setting water level:</h4>
      <Box role="button" onClick={() => onCancel()}>
        Cancel
      </Box>
      <Box role="button" onClick={() => onExec(150)}>
        Overwatered (150%)
      </Box>
      <Box role="button" onClick={() => onExec(100)}>
        Optimal (100%)
      </Box>
      <Box role="button" onClick={() => onExec(80)}>
        Dry (80)
      </Box>
    </>
  );
};

export const AssumeControlRobotMoveTo = (props: {
  onExec: (pos: Pos.Type["pos"]) => unknown;
  onCancel: () => unknown;
}) => {
  const simulator = SimulatorCtx.borrow();
  useEffect(() => {
    const captureClick = (e: MouseEvent) => {
      props.onExec({ x: e.x - WINDOW_X_CENTER, y: e.y - WINDOW_Y_CENTER });
      window.removeEventListener("mousedown", captureClick);
    };
    window.addEventListener("mousedown", captureClick);
    return () => {
      window.removeEventListener("mousedown", captureClick);
    };
  }, [simulator.id]);

  return (
    <>
      <h4>Moving to coordinate</h4>
      <div>Select a spot to move to</div>
      <Box role="button" onClick={props.onCancel}>
        Cancel
      </Box>
    </>
  );
};

export const AssumeControlRobotWaterPlant = ({
  onExec,
  onCancel,
}: {
  robot: Readonly<RobotData.Type>;
  onExec: (plantId: string) => unknown;
  onCancel: () => unknown;
}) => {
  const selector = SelectorCtx.borrow();
  const hoverAgent = useMemo(selector.api.createHoverAgent, []);

  useEffect(() => {
    const unsub = selector.api.registerListener((plant) => {
      if (plant.t !== "Plant") return;
      onExec(plant.id);
    });

    return () => {
      hoverAgent.unhover();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverAgent, selector.api]);

  return (
    <>
      <Box role="button" onClick={onCancel}>
        Cancel
      </Box>
      <h4>Select a plant to water</h4>
      <div>
        {selector.api
          .selections()
          .filter((actor): actor is PlantData.Type => actor.t === "Plant")
          .map((actor) => (
            <Box
              key={actor.id}
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
    </>
  );
};

export const AssumeControlUnsupported = ({
  control,
}: {
  control: ControlHandle;
}) => <Box>No actions for {control.actor.t}</Box>;
