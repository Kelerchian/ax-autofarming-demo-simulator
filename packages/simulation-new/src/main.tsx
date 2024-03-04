/* eslint-disable no-constant-condition */
import { Actyx } from "@actyx/sdk";
import { Robot } from "./actors/Robot.ts";
import { Plant } from "./actors/Plant.ts";
import { plantCoordinationCode } from "./workshop/Plant.ts";
import { robotCoordinationCode } from "./workshop/Robot.ts";
import { runSimulator } from "./simulator/SimulatorView.tsx";

// Bootstrap actyx network and world simulator
// ===============
// Ignore this section

// skips are used to un-even the actors count when starting up a browser tab
const skipRobot =
  new URL(window.location.toString()).searchParams.get("skiprobot") !== null;
const skipPlant =
  new URL(window.location.toString()).searchParams.get("skipplant") !== null;

const actyx = await Actyx.of(
  {
    appId: "com.example.workshop",
    displayName: "Workshop Demo",
    version: "1.0.0",
  },
  { actyxHost: "127.0.0.1", actyxPort: 4454 }
);

runSimulator(actyx);

// Workshop code
// ===============
// plantCoordinationCode and robotCoordinationCode are editable

// Plant Code & Robot Code
// ===============

if (!skipPlant) {
  Plant.run(actyx, plantCoordinationCode);
}

if (!skipRobot) {
  Robot.run(actyx, robotCoordinationCode);
}
