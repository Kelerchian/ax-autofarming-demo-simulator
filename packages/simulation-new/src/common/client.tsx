import { Pos, Robot, Sensor } from "./actors";

export type PlantControl = {
  get: () => Promise<Sensor.Type>;
  setWaterLevel: (value: number) => Promise<unknown>;
};

export type RobotControl = {
  get: () => Promise<Robot.Type>;
  moveToCoord: (
    pos: Pos.Type["pos"],
    REFRESH_TIME?: number
  ) => Promise<unknown>;
  waterPlant: (plantId: string, REFRESH_TIME?: number) => Promise<unknown>;
};

export const TaskOverridenError = new (class extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = "TaskOverridenError";
  }
})();
