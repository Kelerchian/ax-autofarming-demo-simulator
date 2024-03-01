import { v4 } from "uuid";
import { PlantHappenings, RobotHappenings } from "../common/happenings";
import { Actyx } from "@actyx/sdk";
import { PlantData, Pos, RobotData } from "../common/actors";
import { sleep } from "systemic-ts-utils/async-utils";
import { Events, Queries, protocol } from "../workshop/protocol/protocol";
import { createMachineRunner } from "@actyx/machine-runner";
import { States as RobotStates } from "../workshop/protocol/Robot.ts";

const ROBOT_SPEED = 1; // unit / milliseconds

export class Robot {
  private task: RobotData.Task.MoveToCoordinate | undefined;

  private constructor(private actyx: Actyx, private data: RobotData.Type) {}

  /** Initialize a Robot, attempting to restore previous from the browser and Actyx if possible. */
  static async init(actyx: Actyx): Promise<Robot> {
    const id = Robot.initId();
    const data = await RobotHappenings.retrieveById(actyx, id);
    if (data) {
      const latestState = await RobotHappenings.retrievePositionById(actyx, id);
      return new Robot(
        actyx,
        RobotData.make({ id, pos: latestState?.pos ?? data.pos })
      );
    }
    const robot = new Robot(
      actyx,
      RobotData.make({
        id,
        pos: {
          x: Math.round(Math.random() * 400) - 200,
          y: (Math.round(Math.random() * 100) + 100) * -1,
        },
      })
    );
    await RobotHappenings.publishCreateRobotEvent(actyx, robot.getData());

    return robot;
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

  async runWateringRequestAssistance() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(50);
      try {
        const request =
          (await Queries.queryPreviouslyAcceptedRequestByRobotId(
            this.actyx,
            this.data.id
          )) || (await this.pickOpenRequest());
        if (request) {
          await this.executeRequest(request);
        }
      } catch (error) {
        console.error(error);
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
    this.runWateringRequestAssistance();
  }

  private async pickOpenRequest() {
    let closest: Events.WaterRequestedPayload | undefined = undefined;

    for (const request of await Queries.queryOpenRequest(this.actyx)) {
      if (!closest) {
        closest = request;
      } else {
        const distanceToOldRequest = Pos.distance(this.data.pos, closest.pos);
        const distanceToNewRequest = Pos.distance(this.data.pos, request.pos);
        if (distanceToNewRequest < distanceToOldRequest) {
          closest = request;
        }
      }
    }
    return closest;
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

  /** Initialize the Robot ID by first checking if `localStorage` has an ID and if not, creating a new one and setting it. */
  private static initId(): string {
    let robotId = localStorage.getItem("robotId");
    if (!robotId) {
      robotId = v4();
      localStorage.setItem("robotId", robotId);
    }
    return robotId;
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

  private async executeRequest(request: Events.WaterRequestedPayload) {
    const actyx = this.actyx;
    const machine = createMachineRunner(
      actyx,
      protocol.tagWithEntityId(request.requestId),
      RobotStates.Init,
      { robotId: this.data.id }
    );

    for await (const state of machine) {
      // nothing is happening???
      const requested = state.as(RobotStates.WaterRequested);
      if (requested && !requested.payload.offered) {
        await requested.commands()?.offer(this.data.pos);
      }

      const accepted = state.as(RobotStates.HelpAccepted);
      if (accepted) {
        // if someone else is accepted, exit from the loop
        if (accepted.payload.assignedRobotId !== this.data.id) {
          break;
        }

        await this.waterPlant({
          id: accepted.payload.plantId,
          pos: accepted.payload.pos,
        });
        await accepted.commands()?.markAsDone();
        break;
      }
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

  /** Convert the current Robot instance in to a payload for Actyx. */
  private getData(): RobotData.Type {
    return { ...this.data };
  }
}
