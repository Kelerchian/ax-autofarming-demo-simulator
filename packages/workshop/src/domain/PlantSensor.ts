import { sleep } from "systemic-ts-utils/async-utils"
import { Actyx } from "@actyx/sdk"
import { manifest } from "../protocol/protocol"
import fetch, { Response } from "node-fetch"
import * as z from "zod"
import { randomUUID } from "crypto"
import { Sensor as WaterSensor } from "../../../common-types/actors"

const MINIMUM_WATER_LEVEL = 75
const RESTORE_WATER_LEVEL = 80
const MAXIMUM_WATER_LEVEL = 100


export const SpawnedSensor = z.object({ id: z.string(), pos: z.object({ x: z.number(), y: z.number() }) })
export type SpawnedSensor = z.TypeOf<typeof SpawnedSensor>;

async function readSensor(id: string): Promise<WaterSensor.Type> {
    const response = await fetch(`http://localhost:3000/id/${id}`)
    return WaterSensor.Type.parse(await response.json())
}

async function plantSensorLoop(actyx: Actyx) {
    const response: Response = await fetch(`http://127.0.0.1:3000/spawn/sensor`, {
        method: "POST",
    });

    const sensor = SpawnedSensor.parse(await response.json())

    while (true) {
        await sleep(1000)
        const waterSensor = await readSensor(sensor.id)

        if (waterSensor.data.water < MINIMUM_WATER_LEVEL) {
            const requestId = randomUUID()
            const tags = ["WateringRobot", `WateringRobot:${requestId}`]

            // NOTE(duarte): this is where I publish the event that should trigger everything else
            actyx.publish({
                event: {
                    requestId,
                    pos: sensor.pos,
                    type: "Created"
                },
                tags
            })

            while ((await readSensor(sensor.id)).data.water < RESTORE_WATER_LEVEL) {
                await sleep(500)
            }

            console.log("got water back")
            actyx.publish({ event: { plantId: sensor.id, }, tags })
        }
    }
}

async function withActyx() {
    const actyx = await Actyx.of(manifest)
    try {
        plantSensorLoop(actyx)
    } finally {
        actyx.dispose()
    }
}

withActyx()
