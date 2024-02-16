import ReactDOM from "react-dom/client";
import { SimulatorView } from "./Simulator.tsx";
import "./index.scss";
import { Simulator } from "./worker/sim.tsx";
import { Actyx, AqlEventMessage } from "@actyx/sdk";
import { PlantHappenings, RobotHappenings } from "./common/happenings.tsx";
import { v4 as uuid } from "uuid";
import { Robot, Sensor } from "./common/actors.tsx";
import { sleep } from "systemic-ts-utils/async-utils";

const actyx = await Actyx.of(
  {
    appId: "com.example.workshop",
    displayName: "Workshop Demo",
    version: "1.0.0",
  },
  {
    actyxHost: "127.0.0.1",
    actyxPort: 4454,
  }
);

async function setupPlant() {
  let plantId = localStorage.getItem("plantId");
  if (!plantId) {
    plantId = uuid();
    localStorage.setItem("plantId", plantId);
    await PlantHappenings.publishPlantCreated(
      actyx,
      Sensor.make({
        id: plantId,
        pos: { x: 0, y: 0 },
      })
    );
  }

  const createdPlants = await actyx.queryAql({
    query: `FROM ${PlantHappenings.TagPlantCreated}`,
  });
  const createdPlant = createdPlants
    .filter((e): e is AqlEventMessage => e.type === "event")
    .map((msg) => {
      const parsed = Sensor.Type.safeParse(msg.payload);
      return parsed.success ? parsed.data : undefined;
    })
    .filter((msg) => msg && msg.id === plantId)
    .at(0);

  if (!createdPlant) {
    localStorage.removeItem("plantId");
    throw new Error(
      "did not find a uuid for the current plant, please refresh"
    );
  }

  runWaterLoop(createdPlant);
}

async function runWaterLoop(plant: Sensor.Type) {
  actyx.subscribe(
    // TODO: review event payload / tag
    `FROM ${RobotHappenings.WateredEvent}`, //  FILTER _.id = ${plant.id}
    (event) => {
      const parsed = RobotHappenings.WateredEvent.Type.safeParse(event.payload);
      if (parsed.success && parsed.data.id === plant.id) {
        // TODO: this needs to reflect on UI
        Sensor.WaterLevel.applyWater(plant);
      }
    }
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(100);
    plant.water = plant.water - 1;
    await PlantHappenings.publishWaterLevelUpdate(actyx, {
      id: plant.id,
      water: plant.water,
    });
  }
}

async function setupRobot() {
  let robotId = localStorage.getItem("robotId");
  if (!robotId) {
    robotId = uuid();
    localStorage.setItem("robotId", robotId);
    await RobotHappenings.publishCreateRobotEvent(
      actyx,
      Robot.make({
        id: robotId,
        pos: { x: 0, y: 0 },
      })
    );
  }

  const createdRobots = await actyx.queryAql({
    query: `FROM ${RobotHappenings.TagRobotCreated}`,
  });
  const createdRobot = createdRobots
    .filter((e): e is AqlEventMessage => e.type === "event")
    .filter((msg) => {
      const parsed = RobotHappenings.CreateEvent.Robot.safeParse(msg.payload);
      if (parsed.success && parsed.data.id === robotId) {
        return true;
      }
      return false;
    })
    .at(0);

  if (!createdRobot) {
    localStorage.removeItem("robotId");
    throw new Error(
      "did not find a uuid for the current robot, please refresh"
    );
  }
}

const simulator = Simulator();
simulator.api.init();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SimulatorView simulator={simulator} />
);

// spawnStart(sdk);

// [
//   "2476e38f-2f18-4c76-9793-a9e850415d68",
//   "12f47d73-a352-4e83-8f9a-27703e2b2b79",
//   "fb1c464f-1f45-4010-b06e-9b230708bb9b",
//   "508259f6-03a0-4d85-8d00-9971b1c46691",
// ]
//   .map((id, index) => ({
//     id,
//     x: (index - 1.5) * 200,
//   }))
//   .map(({ id, x }) => {
//     simulator.api.add(Sensor.make({ id, pos: Pos.make({ x, y: -200 }) }));
//   });

// [
//   "366a4af4-4624-455d-8157-2f597d9f22e0",
//   "b4f2b9ea-13fd-4e25-86ee-993d6b8c566a",
//   "1b458bd5-6806-4fec-9946-d13571d5a3bd",
// ]
//   .map((id, index) => ({
//     id,
//     x: (index - 1) * 200,
//   }))
//   .map(({ id, x }) => {
//     RobotCode.main(
//       simulator.api.add(Robot.make({ id, pos: Pos.make({ x, y: +200 }) }))
//     );
//   });
