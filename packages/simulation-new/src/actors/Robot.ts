import { v4 } from "uuid"
import { RobotHappenings, WorldCreate, WorldCreateWithId, WorldUpdate } from "../common/happenings"
import { Actyx, AqlEventMessage } from "@actyx/sdk"
import { Robot as NRobot } from "../common/actors"
import { sleep } from "systemic-ts-utils/async-utils"

const ROBOT_SPEED = 0.5; // unit / milliseconds

export class Robot {

    private task: NRobot.Task.MoveToCoordinate | undefined

    private constructor(
        private id: string,
        private position: { x: number, y: number }
    ) { }

    static async init(actyx: Actyx): Promise<Robot> {
        const id = Robot.initId();
        const data = await Robot.retrieveFromActyx(id, actyx);
        if (data) {
            return new Robot(id, (await Robot.retrieveLatestStateFromActyx(id, actyx))?.pos ?? data.pos)
        }
        const robot = new Robot(id, { x: -100, y: -100 })
        await actyx.publish(
            WorldCreate
                .and(WorldCreateWithId(robot.id))
                .and(RobotHappenings.TagRobot)
                .and(RobotHappenings.TagRobotCreated)
                .apply(robot.toPayload())
        )
        return robot
    }

    async runLoop(actyx: Actyx) {
        this.subscribeToNewTasks(actyx)
        this.subscribeToMovementUpdates(actyx)

        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(10);

            if (this.task?.t === "MoveToCoordinate") {
                const newPosition = this.calculateNewPosition(
                    this.task.from.pos,
                    this.task.to.pos,
                    this.task.start
                )
                if (newPosition) {
                    await RobotHappenings.publishPosUpdate(actyx, { id: this.id, pos: newPosition });
                    continue
                }
                await RobotHappenings.publishPosUpdate(actyx, { id: this.id, pos: this.task.to.pos });
                this.task = undefined
            }

        }
    }

    private calculateNewPosition(
        from: { x: number, y: number },
        to: { x: number, y: number },
        start: number,
    ): { x: number, y: number } | undefined {
        const deltaX = to.x - from.x;
        const deltaY = to.y - from.y;
        const totalDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        const currentDist = (Date.now() - start) * ROBOT_SPEED;

        // hasn't reached destination
        if (currentDist < totalDist) {
            const angle = Math.atan2(deltaY, deltaX)
            return {
                x: from.x + currentDist * Math.cos(angle),
                y: from.y + currentDist * Math.sin(angle),
            }
        }
        return undefined
    }

    private subscribeToNewTasks(actyx: Actyx) {
        actyx.subscribeAql(
            `FROM ${RobotHappenings.TagRobotNewMoveTask} FILTER _.id = '${this.id}'`,
            (event) => {
                if (event.type !== "event") return;
                const parsed = RobotHappenings.PosUpdate.Type.safeParse(event.payload);
                if (!parsed.success || parsed.data.id !== this.id) return;
                this.task = {
                    t: "MoveToCoordinate",
                    from: { pos: this.position },
                    to: { pos: parsed.data.pos },
                    start: Date.now(),
                }
            }
        )
    }

    private subscribeToMovementUpdates(actyx: Actyx) {
        actyx.subscribeAql(
            `FROM ${RobotHappenings.TagRobotPosUpdate} FILTER _.id = '${this.id}'`,
            (event) => {
                if (event.type !== "event") return;
                const parsed = RobotHappenings.PosUpdate.Type.safeParse(event)
                if (!parsed.success || parsed.data.id !== this.id) return;
                this.position = parsed.data.pos;
            }
        )
    }

    private static initId(): string {
        let robotId = localStorage.getItem("robotId")
        if (!robotId) {
            robotId = v4()
            localStorage.setItem("robotId", robotId)
        }
        return robotId
    }

    private static async retrieveFromActyx(id: string, actyx: Actyx): Promise<NRobot.Type | undefined> {
        const actyxEvents = await actyx.queryAql(`FROM ${WorldCreateWithId(id)}`)
        const event = actyxEvents.filter((e): e is AqlEventMessage => e.type === "event").at(0)
        const parsed = NRobot.Type.safeParse(event?.payload)
        if (parsed.success) {
            return parsed.data
        }
        return undefined
    }

    private static async retrieveLatestStateFromActyx(id: string, actyx: Actyx): Promise<RobotHappenings.PosUpdate.Type | undefined> {
        // NOTE: This is not the full state the robot might be in
        // we still need to take into account the current request it may be fulfilling
        const actyxEvents = await actyx.queryAql(`
            PRAGMA features := aggregate
            FROM ${RobotHappenings.TagRobotWithId} & ${WorldUpdate}
            AGGREGATE LAST(_.pos)
        `)
        const event = actyxEvents.filter((e): e is AqlEventMessage => e.type === "event").at(0)
        const parsed = RobotHappenings.PosUpdate.Type.safeParse(event?.payload)
        if (parsed.success) {
            return parsed.data
        }
        return undefined
    }

    private toPayload(): NRobot.Type {
        return {
            id: this.id,
            pos: this.position,
            t: "Robot"
        }
    }
}
