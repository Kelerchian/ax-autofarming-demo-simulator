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

export type PlantControl = ReturnType<typeof makePlantControl>;
export const makePlantControl = (server: string, actor: Sensor.Type) => {
  return {
    get: () => getPlant(server, actor.id),
  };
};

export type RobotControl = ReturnType<typeof makeRobotControl>;
export const makeRobotControl = (server: string, actor: Robot.Type) => {
  return {
    get: () => getRobot(server, actor.id),
    moveToCoord: (pos: Pos.Type["pos"]) =>
      act(server, {
        id: actor.id,
        action: {
          t: "MoveToCoordinate",
          to: { pos },
        },
      }),
    waterPlant: (plantId: string) =>
      act(server, {
        id: actor.id,
        action: {
          t: "WaterPlant",
          sensorId: plantId,
        },
      }),
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
