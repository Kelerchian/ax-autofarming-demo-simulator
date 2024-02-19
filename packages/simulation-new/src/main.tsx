/* eslint-disable no-constant-condition */
import ReactDOM from "react-dom/client";
import { SimulatorView } from "./Simulator.tsx";
import "./index.scss";
import { Simulator } from "./worker/sim.tsx";
import { Actyx } from "@actyx/sdk";
import { PlantHappenings, RobotHappenings } from "./common/happenings.tsx";
import { v4 as uuid } from "uuid";
import { Robot, Sensor } from "./common/actors.tsx";
import { sleep } from "systemic-ts-utils/async-utils";
import { pipe } from "effect";

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

// We run simulator
const simulator = Simulator(actyx);
simulator.api.init();

async function setupPlant() {
  let plantId = localStorage.getItem("plantId");
  if (!plantId) {
    plantId = uuid();
    await PlantHappenings.publishPlantCreated(
      actyx,
      Sensor.make({
        id: plantId,
        pos: { x: 0, y: 200 },
      })
    );
    localStorage.setItem("plantId", plantId);
  }

  // Since simulator is running
  const plant = await (async () => {
    while (true) {
      const actor = simulator.api.simsMap().get(plantId)?.api.actor();
      if (actor?.t === "Sensor") {
        return actor;
      }
      await sleep(100);
    }
  })();

  runWaterLoop(plant);
}

async function runWaterLoop(plant: Sensor.Type) {
  actyx.subscribeAql(
    // TODO: review event payload / tag
    `FROM ${RobotHappenings.WateredEvent} FILTER _.id = '${plant.id}'`,
    (event) => {
      if (event.type !== "event") return;
      const parsed = RobotHappenings.WateredEvent.Type.safeParse(event.payload);
      if (!parsed.success || parsed.data.id !== plant.id) return;
      Sensor.WaterLevel.applyWater(plant); // TODO: this needs to reflect on UI
    }
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(100);
    const newWaterAmount = Math.max(plant.water - 1, 0);
    if (newWaterAmount !== plant.water) {
      plant.water = newWaterAmount;
      await PlantHappenings.publishWaterLevelUpdate(actyx, {
        id: plant.id,
        water: plant.water,
      });
    }
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
        pos: { x: 0, y: -200 },
      })
    );
  }

  // Since simulator is running
  const robot = await (async () => {
    while (true) {
      const actor = simulator.api.simsMap().get(robotId)?.api.actor();
      if (actor?.t === "Robot") {
        return actor;
      }
      await sleep(100);
    }
  })();

  runRobotLoop(robot);
}

async function runRobotLoop(robot: Robot.Type) {
  const ROBOT_SPEED = 0.5; // unit / milliseconds
  const WATERING_DURATION = 3000; // milliseconds

  const localReality = {
    pos: robot.pos,
    task: null as null | Robot.Task.MoveToCoordinate,
  };

  const moveToCoord = async (task: Robot.Task.MoveToCoordinate) => {
    const { from, to, start } = task;
    const deltaX = to.pos.x - from.pos.x;
    const deltaY = to.pos.y - from.pos.y;
    const totalDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const currentDist = (Date.now() - start) * ROBOT_SPEED;

    // hasn't reached destination
    if (currentDist < totalDist) {
      const pos = pipe(Math.atan2(deltaY, deltaX), (angle) => ({
        x: from.pos.x + currentDist * Math.cos(angle),
        y: from.pos.y + currentDist * Math.sin(angle),
      }));
      await RobotHappenings.publishPosUpdate(actyx, { id: robot.id, pos });
      return;
    }

    // robot reached destination
    const pos = to.pos;
    await RobotHappenings.publishPosUpdate(actyx, { id: robot.id, pos });
    localReality.task = null;
  };

  const attemptToDoTask = async () => {
    const task = localReality.task;
    if (task?.t === "MoveToCoordinate") {
      await moveToCoord(task);
    }
  };

  // Subscribe to new tasks, whenever they arrive, set them as the current task
  actyx.subscribeAql(
    `FROM ${RobotHappenings.TagRobotNewMoveTask} FILTER _.id = '${robot.id}'`,
    (event) => {
      if (event.type !== "event") return;
      const parsed = RobotHappenings.PosUpdate.Type.safeParse(event.payload);
      if (!parsed.success || parsed.data.id !== robot.id) return;
      if (localReality.task) throw new Error("theres an ongoing task");
      localReality.task = {
        t: "MoveToCoordinate",
        from: { pos: localReality.pos },
        to: { pos: parsed.data.pos },
        start: Date.now(),
      };
    }
  );

  actyx.subscribeAql(
    // TODO: review event payload / tag
    `FROM ${RobotHappenings.TagRobotPosUpdate} FILTER _.id = '${robot.id}'`,
    (event) => {
      if (event.type !== "event") return;
      const parsed = RobotHappenings.PosUpdate.Type.safeParse(event.payload);
      if (!parsed.success || parsed.data.id !== robot.id) return;
      localReality.pos = parsed.data.pos;
    }
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(10);
    await attemptToDoTask();
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SimulatorView simulator={simulator} />
);

setupRobot();
setupPlant();

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
