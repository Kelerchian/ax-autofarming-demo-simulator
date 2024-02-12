import {
  ActorAssumerCtx,
  AssumedActor,
  AssumedRobot,
  AssumedSensor,
} from "./worker/assume";
import * as style from "./AssumeView.module.scss";
import cls from "classnames";
import { ActorLogo } from "./ActorView";
import { useEffect, useMemo, useState } from "react";
import { SelectorCtx } from "./worker/selector";
import { pipe } from "effect";
import { Pos, Robot, Sensor } from "../../common-types/actors";
import { VisualizerCtx } from "./worker/visualizer";
import React from "react";
import { sleep } from "systemic-ts-utils/async-utils";

export const AssumeView = React.memo(() => {
  const [selecting, setSelecting] = useState(false);

  const assumer = ActorAssumerCtx.borrowListen();
  const assumed = assumer.api.getAssumed();
  const isAssuming = assumer.api.isAssuming();

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
        {isAssuming && <Box>Loading</Box>}
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
    let alive = true;

    selector.api.refresh();

    const unsub = selector.api.registerListener((actor) => {
      assumer.api.assume(actor.id);
      onDone();
    });

    (async () => {
      while (alive) {
        selector.api.refresh();
        await sleep(1000);
      }
    })();

    return () => {
      unsub();
      alive = false;
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

export const AssumeControl = ({ control }: { control: AssumedActor }) => {
  if (control.actor.t === "Robot") {
    return <AssumeControlRobot control={control as AssumedRobot} />;
  }
  if (control.actor.t === "Sensor") {
    return <AssumeControlSensor control={control as AssumedSensor} />;
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

export const AssumeControlRobot = ({ control }: { control: AssumedRobot }) => {
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
            control.control.waterPlant(plantId);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
    </Box>
  );
};

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AssumeControlSensorMode {
  export const SetWaterLevel: unique symbol = Symbol();
  export type SetWaterLevel = typeof SetWaterLevel;

  export type Type = SetWaterLevel;
}

export const AssumeControlSensor = ({
  control,
}: {
  control: AssumedSensor;
}) => {
  const [mode, setMode] = useState<null | AssumeControlSensorMode.Type>(null);

  return (
    <Box>
      {mode === null && (
        <>
          <Box
            role="button"
            onClick={() => setMode(AssumeControlSensorMode.SetWaterLevel)}
          >
            Set Water Level (current: {control.actor.data.water}) %
          </Box>
        </>
      )}
      {mode === AssumeControlSensorMode.SetWaterLevel && (
        <AssumeControlSensorSetWaterLevel
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

export const AssumeControlSensorSetWaterLevel = ({
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
  const visualizer = VisualizerCtx.borrow();
  useEffect(() => {
    const captureClick = (e: MouseEvent) => {
      props.onExec({ x: e.x, y: e.y });
      window.removeEventListener("mousedown", captureClick);
    };
    window.addEventListener("mousedown", captureClick);
    return () => {
      window.removeEventListener("mousedown", captureClick);
    };
  }, [visualizer.id]);

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
  robot,
  onExec,
  onCancel,
}: {
  robot: Robot.Type;
  onExec: (plantId: string) => unknown;
  onCancel: () => unknown;
}) => {
  const selector = SelectorCtx.borrow();
  const hoverAgent = useMemo(selector.api.createHoverAgent, []);

  useEffect(() => {
    const unsub = selector.api.registerListener((sensor) => {
      if (sensor.t !== "Sensor") return;
      onExec(sensor.id);
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
          .filter((actor): actor is Sensor.Type => actor.t === "Sensor")
          .filter((sensor) => {
            const distance = Pos.distance(sensor.pos, robot.pos);
            return Sensor.WaterLevel.withinWateringProximity(distance);
          })
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
  control: AssumedActor;
}) => <Box>No actions for {control.actor.t}</Box>;

// TODO: move to a "common" component
export const Box = (
  props: React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  >
) => <div {...props} className={cls(style.box, props.className)} />;
