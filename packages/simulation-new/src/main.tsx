/* eslint-disable no-constant-condition */
import ReactDOM from "react-dom/client";
import { SimulatorView } from "./simulator/SimulatorView.tsx";
import { Actyx } from "@actyx/sdk";
import { Robot } from "./actors/Robot.ts";
import { Plant } from "./actors/Plant.ts";
import { performWateringRequest } from "./workshop/protocol/Plant.ts";

const actyx = await Actyx.of(
  {
    appId: "com.example.workshop",
    displayName: "Workshop Demo",
    version: "1.0.0",
  },
  { actyxHost: "127.0.0.1", actyxPort: 4454 }
);

const skipRobot =
  new URL(window.location.toString()).searchParams.get("skiprobot") !== null;
const skipPlant =
  new URL(window.location.toString()).searchParams.get("skipplant") !== null;

await Promise.all([
  !skipRobot && (await Robot.init(actyx)).runLoop(),
  !skipPlant && (await Plant.init(actyx, performWateringRequest)).runLoop(),
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SimulatorView actyx={actyx} />
);
