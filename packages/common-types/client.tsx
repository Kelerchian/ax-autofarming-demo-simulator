import { sleep } from "systemic-ts-utils/async-utils";
import { Actor, Pos, Robot, Sensor } from "./actors";

const act = (server: string, action: Actor.Actions) =>
  fetch(`${server}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });

export const getActor = (server: string, id: string) =>
  fetch(`${server}/id/${id}`)
    .then((x) => x.json())
    .then((json) => Actor.Type.parse(json));

const getRobot = async (server: string, id: string) => {
  const actor = await getActor(server, id);
  if (actor.t !== "Robot") {
    throw new Error("Assuming Robot failed");
  }
  return actor;
};

const getPlant = async (server: string, id: string) => {
  const actor = await getActor(server, id);
  if (actor.t !== "Sensor") {
    throw new Error("Assuming Plant failed");
  }
  return actor;
};

export const getAllActors = (server: string) =>
  fetch(`${server}/state`)
    .then((res) => res.json())
    .then((json) => Actor.Actors.parse(json));

export type PlantControl = {
  get: () => Promise<Sensor.Type>;
  setWaterLevel: (value: number) => Promise<unknown>;
};
export const makePlantControl = (server: string, actor: Sensor.Type) => {
  return {
    get: () => getPlant(server, actor.id),
    setWaterLevel: (value: number) => {
      const action: Sensor.Actions.SetWaterLevel = {
        t: "SetWaterLevel",
        value,
      };
      act(server, {
        id: actor.id,
        action,
      });
    },
  };
};

export const TaskOverridenError = new (class extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = "TaskOverridenError";
  }
})();

export type RobotControl = {
  get: () => Promise<Robot.Type>;
  moveToCoord: (
    pos: Pos.Type["pos"],
    REFRESH_TIME?: number
  ) => Promise<unknown>;
  waterPlant: (plantId: string, REFRESH_TIME?: number) => Promise<unknown>;
};

export const makeRobotControl = (
  server: string,
  actor: Robot.Type
): RobotControl => {
  const id = actor.id;
  const get = () => getRobot(server, actor.id);
  return {
    get,
    moveToCoord: async (pos: Pos.Type["pos"], REFRESH_TIME: number = 1000) => {
      await act(server, { id, action: { t: "MoveToCoordinate", to: { pos } } });

      while (true) {
        const actual = await get();
        if (actual.data.task === null) {
          if (Pos.equal(pos, actual.pos)) {
            return;
          } else {
            throw TaskOverridenError;
          }
        }

        if (
          actual.data.task?.t !== "MoveToCoordinate" ||
          !Pos.equal(actual.data.task.to.pos, pos)
        ) {
          throw TaskOverridenError;
        }

        await sleep(Math.max(REFRESH_TIME, 100));
      }
    },
    waterPlant: async (plantId: string, REFRESH_TIME: number = 1000) => {
      await act(server, { id, action: { t: "WaterPlant", sensorId: plantId } });

      while (true) {
        const actual = await get();
        if (actual.data.task === null) {
          return;
        }
        if (
          actual.data.task?.t !== "WaterPlant" ||
          actual.data.task.sensor.id !== plantId
        ) {
          throw TaskOverridenError;
        }
        await sleep(Math.max(REFRESH_TIME, 100));
      }
    },
  };
};

export const assumePlant = async (server: string, id: string) =>
  makePlantControl(server, await getPlant(server, id));

/**
 * @example
 * // How to assume robot and move it:
 * const SIMULATOR_URL = http://localhost:3000;
 * const ROBOT_ID = process.env.ROBOT_ID; // get from environment variable
 * const robotControl = await assumeRobot(SIMULATOR_URL, ROBOT_ID);
 *
 * await robotControl.moveToCoord({
 *   x: 0,
 *   y: 0
 * })
 */
export const assumeRobot = async (server: string, id: string) =>
  makeRobotControl(server, await getRobot(server, id));
