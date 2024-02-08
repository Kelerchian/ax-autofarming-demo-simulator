import { sleep } from "systemic-ts-utils/async-utils"
import { Actyx } from "@actyx/sdk"
import { manifest } from "../protocol/protocol"

const MINIMUM_WATER_LEVEL = 50
const RESTORE_WATER_LEVEL = 80
const MAXIMUM_WATER_LEVEL = 100


export type PlantSensor = { plantId: string }
export type PlantEvent = { plantId: string, action: "needsWater" | "ok" }

async function plantSensorLoop() {
    const actyx = await Actyx.of(manifest)

    while (true) {
        await sleep(1000)
        const waterLevel = await readFromSensor(plantId)
        if (waterLevel < MINIMUM_WATER_LEVEL) {
            actyx.publish({
                event: {
                    plantId: plantId,
                    action: "needsWater"
                },
                tags: [ /* ??? */]
            })

            while (await readFromSensor(plantId) < RESTORE_WATER_LEVEL) {
                await sleep(500)
            }

            actyx.publish({
                event: {
                    plantId: plantId,
                    action: "ok"
                },
                tags: [/* ??? */]
            })
        }
    }
}
