import { v4 } from "uuid";
import {
  PlantHappenings,
  RobotHappenings,
  WorldCreate,
  WorldCreateWithId,
  WorldUpdate,
} from "../common/happenings";
import { Actyx, AqlEventMessage } from "@actyx/sdk";
import { Robot as NRobot, Pos } from "../common/actors";
import { sleep } from "systemic-ts-utils/async-utils";
import { Events, ProtocolName, protocol } from "../workshop/protocol/protocol";
import { createMachineRunner } from "@actyx/machine-runner";
import { States as RobotStates } from "../workshop/protocol/Robot.ts";

const ROBOT_SPEED = 0.5; // unit / milliseconds

export class Robot {
  private task: NRobot.Task.MoveToCoordinate | undefined;

  private constructor(
    private actyx: Actyx,
    private readonly id: string,
    private position: { x: number; y: number }
  ) {}

  /** Initialize a Robot, attempting to restore previous from the browser and Actyx if possible. */
  static async init(actyx: Actyx): Promise<Robot> {
    const id = Robot.initId();
    const data = await Robot.retrieveIdFromActyx(id, actyx);
    if (data) {
      const latestState = await Robot.retrieveLatestStateFromActyx(id, actyx);
      return new Robot(actyx, id, latestState?.pos ?? data.pos);
    }
    const robot = new Robot(actyx, id, { x: -100, y: -100 });
    await Robot.publishCreateRobotEvent(actyx, robot.toPayload());
    return robot;
  }

  async runApplyTaskLoop() {
    const actyx = this.actyx;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(100);
      const task = this.task;
      if (task?.t) {
        switch (task.t) {
          case "MoveToCoordinate": {
            const newPosition = Robot.calculateNewPosition(
              task.from.pos,
              task.to.pos,
              task.start
            );
            if (newPosition) {
              this.position = newPosition;
              await Robot.publishPosUpdate(actyx, {
                id: this.id,
                pos: newPosition,
              });
              continue;
            }
            await Robot.publishPosUpdate(actyx, {
              id: this.id,
              pos: task.to.pos,
            });
            this.task = undefined;
          }
        }
      }
    }
  }

  async runWateringRequestAssistance() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(100);
      try {
        const request =
          (await this.pickPreviouslyAcceptedRequest()) ||
          (await this.pickOpenRequest());
        if (request) {
          console.log("received request");
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

  private async pickPreviouslyAcceptedRequest() {
    const actyx = this.actyx;
    // TODO: on tab being accidentally closed, restore previously accepted task
    const query = `
            PRAGMA features := subQuery interpolation

            FROM '${ProtocolName}' ORDER DESC FILTER _.type = '${Events.WaterRequested.type}'
            LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.WateringDone.type}' END ?? []
            FILTER !IsDefined(done_events[0])
            LET accepted_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.HelpAccepted.type}' & _.robotId = '${this.id}' END ?? []
            FILTER IsDefined(accepted_events[0])
        `;
    const actyxEvents = await actyx.queryAql(query);
    let closestRequest: Events.WaterRequestedPayload | undefined = undefined;
    for (const event of actyxEvents) {
      if (event.type !== "event") continue;
      const parsed = Events.WaterRequestedPayload.safeParse(event.payload);
      if (!parsed.success) continue;
      if (!closestRequest) {
        closestRequest = parsed.data;
      } else {
        const distanceToOldRequest = Pos.distance(
          this.position,
          closestRequest.pos
        );
        const distanteToNewRequest = Pos.distance(
          this.position,
          parsed.data.pos
        );
        if (distanceToOldRequest > distanteToNewRequest) {
          closestRequest = parsed.data;
        }
      }
    }
    return closestRequest;
  }

  private async pickOpenRequest(): Promise<
    Events.WaterRequestedPayload | undefined
  > {
    const actyx = this.actyx;
    // TODO: on tab being accidentally closed, restore previously accepted task
    const query = `
            PRAGMA features := subQuery interpolation

            FROM '${ProtocolName}' ORDER DESC FILTER _.type = '${Events.WaterRequested.type}'

            LET accepted_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.HelpAccepted.type}' END ?? []
            LET done_events := FROM \`${ProtocolName}:{_.requestId}\` FILTER _.type = '${Events.WateringDone.type}' END ?? []

            FILTER !IsDefined(accepted_events[0]) & !IsDefined(done_events[0])
        `;
    const actyxEvents = await actyx.queryAql(query);
    let closestRequest: Events.WaterRequestedPayload | undefined = undefined;
    for (const event of actyxEvents) {
      if (event.type !== "event") continue;
      const parsed = Events.WaterRequestedPayload.safeParse(event.payload);
      if (!parsed.success) continue;
      if (!closestRequest) {
        closestRequest = parsed.data;
      } else {
        const distanceToOldRequest = Pos.distance(
          this.position,
          closestRequest.pos
        );
        const distanteToNewRequest = Pos.distance(
          this.position,
          parsed.data.pos
        );
        if (distanceToOldRequest > distanteToNewRequest) {
          closestRequest = parsed.data;
        }
      }
    }
    return closestRequest;
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
    const actyx = this.actyx;
    actyx.subscribeAql(
      `FROM ${RobotHappenings.TagRobotNewMoveTask} FILTER _.id = '${this.id}'`,
      (event) => {
        if (event.type !== "event") return;
        const parsed = RobotHappenings.PosUpdate.Type.safeParse(event.payload);
        if (!parsed.success || parsed.data.id !== this.id) return;
        // NOTE: instead of checking here if theres an ongoing task,
        // we should check in the UI and stop the user from submitting one
        this.task = {
          t: "MoveToCoordinate",
          from: { pos: this.position },
          to: { pos: parsed.data.pos },
          start: Date.now(),
        };
      }
    );
  }

  /** Subscribe to `RobotPosUpdate` events. */
  private subscribeToMovementUpdates() {
    const actyx = this.actyx;
    actyx.subscribeAql(
      `FROM ${RobotHappenings.TagRobotPosUpdate} FILTER _.id = '${this.id}'`,
      (event) => {
        if (event.type !== "event") return;
        const parsed = RobotHappenings.PosUpdate.Type.safeParse(event);
        if (!parsed.success || parsed.data.id !== this.id) return;
        this.position = parsed.data.pos;
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

  /** Check if the ID exists in Actyx. */
  private static async retrieveIdFromActyx(
    id: string,
    actyx: Actyx
  ): Promise<NRobot.Type | undefined> {
    const actyxEvents = await actyx.queryAql(`FROM ${WorldCreateWithId(id)}`);
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const parsed = NRobot.Type.safeParse(event?.payload);
    if (parsed.success) {
      return parsed.data;
    }
    return undefined;
  }

  /** Retrieve the latest state from Actyx. */
  private static async retrieveLatestStateFromActyx(
    id: string,
    actyx: Actyx
  ): Promise<RobotHappenings.PosUpdate.Type | undefined> {
    // NOTE: This is not the full state the robot might be in
    // we still need to take into account the current request it may be fulfilling
    const actyxEvents = await actyx.queryAql(`
            PRAGMA features := aggregate
            FROM ${RobotHappenings.TagRobotWithId(id)} & ${WorldUpdate}
            AGGREGATE LAST(_)
        `);
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const parsed = RobotHappenings.PosUpdate.Type.safeParse(event?.payload);
    if (parsed.success) {
      return parsed.data;
    }
    return undefined;
  }

  /** Convert the current Robot instance in to a payload for Actyx. */
  private toPayload(): NRobot.Type {
    return {
      id: this.id,
      pos: this.position,
      t: "Robot",
    };
  }

  private async moveTo(pos: Pos.Type) {
    if (Pos.equal(pos.pos, this.position)) return;
    console.log("move to", 1);
    await RobotHappenings.publishNewMoveTask(this.actyx, {
      id: this.id,
      ...pos,
    });
    console.log("move to", 2);

    let checkAttempt = 0;
    console.log("move to", 3);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // wait until 'subscribe' catch the new task
      if (
        this.task?.t === "MoveToCoordinate" &&
        Pos.equal(this.task.to.pos, pos.pos)
      ) {
        break;
      }
      await sleep(2);
      checkAttempt += 1;
      if (checkAttempt > 5) {
        throw new Error("task not caught by subscribe");
      }
    }
    console.log("move to", 4);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // wait until task is successfully done
      console.log("move to", 4, 1);
      if (!this.task) {
        console.log("move to", 4, 2, this.position, pos.pos);
        if (!Pos.equal(this.position, pos.pos)) {
          console.log("move to", 4, 3);
          throw new Error("task is overridden");
        }
        break;
      } else {
        switch (this.task.t) {
          case "MoveToCoordinate": {
            if (!Pos.equal(this.task.to.pos, pos.pos)) {
              console.log("move to", 4, 4);
              throw new Error("task is overridden");
            }
            break;
          }
        }
      }
      await sleep(10);
    }
    console.log("move to", 5);
  }

  /** Publish a position update. */
  private static async publishPosUpdate(
    sdk: Actyx,
    posUpdate: RobotHappenings.PosUpdate.Type
  ) {
    sdk.publish(
      WorldUpdate.and(RobotHappenings.TagRobot)
        .and(RobotHappenings.TagRobotWithId(posUpdate.id))
        .and(RobotHappenings.TagRobotPosUpdate)
        .apply(posUpdate)
    );
  }

  /** Publich a Robot creation event. */
  private static async publishCreateRobotEvent(sdk: Actyx, robot: NRobot.Type) {
    const taggedEvent = WorldCreate.and(WorldCreateWithId(robot.id))
      .and(RobotHappenings.TagRobot)
      .and(RobotHappenings.TagRobotCreated)
      .apply(robot);

    return sdk.publish(taggedEvent);
  }

  private async executeRequest(request: Events.WaterRequestedPayload) {
    const actyx = this.actyx;
    console.log("robot:executeRequest", request.requestId);
    const machine = createMachineRunner(
      actyx,
      protocol.tagWithEntityId(request.requestId),
      RobotStates.Init,
      { robotId: this.id }
    );
    machine.events.on("next", (e) => {
      console.log("next", e.type);
    });

    for await (const state of machine) {
      console.log(1);
      // nothing is happening???
      const requested = state.as(RobotStates.WaterRequested);
      if (requested && !requested.payload.offered) {
        console.log(2);
        await requested.commands()?.offer(this.position);
        console.log(2, "after");
      }

      const accepted = state.as(RobotStates.HelpAccepted);
      if (accepted) {
        console.log(3);
        // if someone else is accepted, exit from the loop
        if (accepted.payload.assignedRobotId !== this.id) {
          console.log(3, "break");
          break;
        }

        // TODO: move and watering proximity logic
        console.log(3, "before watering plant");
        await this.moveTo({ pos: accepted.payload.pos });
        await this.waterPlant({
          id: accepted.payload.robotId,
          pos: accepted.payload.pos,
        });
        console.log("watering plant", accepted.payload);
        await accepted.commands()?.markAsDone();
        console.log("watering plant", "done");
        break;
      }
    }
  }

  private async waterPlant(watered: PlantHappenings.Watered.Type) {
    const actyx = this.actyx;
    return PlantHappenings.emitWatered(actyx, watered);
  }
}
