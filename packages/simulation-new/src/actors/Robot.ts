import { v4 as v4 } from "uuid";
import { PlantHappenings, RobotHappenings } from "../common/happenings";
import { Actyx } from "@actyx/sdk";
import { PlantData, Pos, RobotData } from "../common/actors";
import { sleep } from "systemic-ts-utils/async-utils";

const ROBOT_SPEED = 1; // unit / milliseconds

/**
 * A callback that contains the code to coordinate this particular robot and the
 * rest of robots and plants in the swarm. The goal of the coordination is to
 * make the robots and the plants work together so that plants are watered
 * optimally (not underwatered nor overwatered).
 *
 * It is run on initialization. Actyx, the robot data getter, and the watering
 * functionality is exposed through its parameter.
 */
export type RobotCoordinationCode = (
  params: RobotExposedInterface
) => Promise<unknown>;

/**
 * Exposed data getter and functionalities
 */
export type RobotExposedInterface = {
  actyx: Actyx;
  getId: () => string;
  getPosition: () => Pos.Type["pos"];
  waterPlant: ExecutePlantWatering;
};

/**
 * Moves the robot to the targeted plant and waters it.
 */
export type ExecutePlantWatering = (
  data: PlantData.Watered.Type
) => Promise<unknown>;

export class Robot {
  private task: RobotData.Task.MoveToCoordinate | undefined;

  private constructor(
    private actyx: Actyx,
    private data: RobotData.Type,
    private coordinationCode: RobotCoordinationCode
  ) {}

  /** Initialize the Robot ID by first checking if `localStorage` has an ID and if not, creating a new one and setting it. */
  private static initId(): string {
    let robotId = localStorage.getItem("robotId");
    if (!robotId) {
      robotId = v4();
      localStorage.setItem("robotId", robotId);
    }
    return robotId;
  }

  private static async loadExisting(actyx: Actyx, id: string) {
    const creationData = await RobotHappenings.retrieveById(actyx, id);
    if (!creationData) return null;
    const latestState = await RobotHappenings.retrievePositionById(
      actyx,
      creationData.id
    );
    const latestPosition = latestState?.pos || creationData.pos;
    return RobotData.make({
      ...creationData,
      pos: latestPosition,
    });
  }

  /** Initialize a Robot, attempting to restore previous from the browser and Actyx if possible. */
  private static async init(actyx: Actyx, coordination: RobotCoordinationCode) {
    const id = Robot.initId();
    // Fetch existing data
    const existingData = await Robot.loadExisting(actyx, id);
    if (existingData) return new Robot(actyx, existingData, coordination);

    // Create a new data and publish its "creation" event
    const newData = RobotData.make({
      id,
      pos: {
        x: Math.round(Math.random() * 400) - 200,
        y: (Math.round(Math.random() * 100) + 100) * -1,
      },
    });
    await RobotHappenings.publishCreateRobotEvent(actyx, newData);

    return new Robot(actyx, newData, coordination);
  }

  static async run(
    actyx: Actyx,
    coordinationCode: RobotCoordinationCode
  ): Promise<unknown> {
    const robot = await this.init(actyx, coordinationCode);
    return await robot.runLoop();
  }

  async runApplyTaskLoop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(50);
      const task = this.task;
      if (task?.t === "MoveToCoordinate") {
        const newPosition = Robot.calculateNewPosition(
          task.from.pos,
          task.to.pos,
          task.start
        );
        if (newPosition) {
          this.data.pos = newPosition;
          await this.publishPosUpdate(newPosition);
          continue;
        }

        await this.publishPosUpdate(task.to.pos);
        // again to avoid race condition caused by subscription
        // to the above event that sometimes come late
        this.data.pos = task.to.pos;
        this.task = undefined;
      }
    }
  }

  /** Start executing the robot.
   *
   * It will start by subscribing to relevant events, followed by attempting to perform new tasks.
   */
  async runLoop() {
    this.subscribeToNewTasks();
    this.subscribeToMovementUpdates();

    this.runApplyTaskLoop();
    this.coordinationCode({
      actyx: this.actyx,
      getId: () => this.data.id,
      getPosition: () => this.data.pos,
      waterPlant: (arg) => this.waterPlant(arg),
    });
  }

  /** Calculate a new position for the robot. */
  private static calculateNewPosition(
    from: { x: number; y: number },
    to: { x: number; y: number },
    start: number
  ): { x: number; y: number } | undefined {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const totalDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const currentDist = (Date.now() - start) * ROBOT_SPEED;

    // hasn't reached destination
    if (currentDist < totalDist) {
      const angle = Math.atan2(deltaY, deltaX);
      return {
        x: from.x + currentDist * Math.cos(angle),
        y: from.y + currentDist * Math.sin(angle),
      };
    }
    return undefined;
  }

  /** Subscribe to `RobotNewMoveTask`. */
  private subscribeToNewTasks() {
    return RobotHappenings.subscribeToNewTasksById(
      this.actyx,
      this.data.id,
      (destination) => {
        // NOTE: instead of checking here if theres an ongoing task,
        // we should check in the UI and stop the user from submitting one
        this.task = {
          ...destination,
          from: { pos: this.data.pos },
          start: Date.now(),
        };
      }
    );
  }

  /** Subscribe to `RobotPosUpdate` events. */
  private subscribeToMovementUpdates() {
    return RobotHappenings.subscribeToMovementUpdatesById(
      this.actyx,
      this.data.id,
      (posUpdate) => {
        this.data.pos = posUpdate.pos;
      }
    );
  }

  private async moveTo(destination: Pos.Type) {
    if (Pos.equal(destination.pos, this.data.pos)) return;
    await RobotHappenings.publishNewMoveTask(this.actyx, {
      id: this.data.id,
      to: destination,
    });

    let checkAttempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // wait until 'subscribe' catch the new task
      if (
        this.task?.t === "MoveToCoordinate" &&
        Pos.equal(this.task.to.pos, destination.pos)
      ) {
        break;
      }
      await sleep(5);
      checkAttempt += 1;
      if (checkAttempt > 5) {
        throw new Error("task not caught by subscribe");
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // wait until task is successfully done
      if (!this.task) {
        if (!Pos.equal(this.data.pos, destination.pos)) {
          throw new Error("task is overridden");
        }
        break;
      } else {
        switch (this.task.t) {
          case "MoveToCoordinate": {
            if (!Pos.equal(this.task.to.pos, destination.pos)) {
              throw new Error("task is overridden");
            }
            break;
          }
        }
      }
      await sleep(10);
    }
  }

  private async publishPosUpdate(pos: Pos.Type["pos"]) {
    return RobotHappenings.publishPosUpdate(this.actyx, {
      id: this.data.id,
      pos: pos,
    });
  }

  private async waterPlant(watered: PlantData.Watered.Type) {
    await this.moveTo({ pos: watered.pos });
    return PlantHappenings.publishWatered(this.actyx, watered);
  }
}
