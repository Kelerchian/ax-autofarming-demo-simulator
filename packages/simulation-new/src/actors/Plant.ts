import { Actyx, AqlEventMessage } from "@actyx/sdk";
import { PlantHappenings, WorldCreate, WorldCreateWithId, WorldUpdate } from "../common/happenings";
import { Sensor } from "../common/actors";
import { v4 } from "uuid";
import { performWateringProtocol } from "../workshop/protocol/Plant";
import { sleep } from "systemic-ts-utils/async-utils";

export class Plant {

    private lastMeasure: number
    private requestId: string | undefined

    private constructor(
        private id: string,
        private water: number,
        private position: { x: number, y: number }
    ) {
        this.lastMeasure = performance.now();
        this.requestId = undefined;
    }

    static async init(actyx: Actyx): Promise<Plant> {
        const id = Plant.initId();
        const data = await Plant.retrieveFromActyx(id, actyx);
        // If we were able to retrieve an existing plant, we now need to
        if (data) {
            return new Plant(
                id,
                (await Plant.retrieveLatestStateFromActyx(id, actyx)) ?? data.water,
                data.pos,
            )
        }

        const plant = new Plant(
            id,
            100,
            { x: 100, y: 100 }
        )
        await actyx.publish(
            WorldCreate
                .and(WorldCreateWithId(plant.id))
                .and(PlantHappenings.TagPlant)
                .and(PlantHappenings.TagPlantWithId(plant.id))
                .and(PlantHappenings.TagPlantCreated)
                .apply(plant.toPayload())
        )

        return plant
    }

    async runLoop(actyx: Actyx) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // sleep to avoid spamming
            await sleep(100)
            this.measureWater()
            if (!this.requestId && this.water < 50) {
                this.requestId = v4();
                performWateringProtocol(actyx, this.position, this.requestId, this.id)
                    .then(() => { this.requestId = undefined })
            }
            if (this.water > 0) {
                await PlantHappenings.publishWaterLevelUpdate(actyx, {
                    id: this.id,
                    water: this.water
                })
            }
        }
    }

    private static initId(): string {
        let plantId = localStorage.getItem("plantId");
        if (!plantId) {
            plantId = v4()
            localStorage.setItem("plantId", plantId)
        }
        return plantId
    }

    private static async retrieveFromActyx(id: string, actyx: Actyx): Promise<Sensor.Type | undefined> {
        const actyxEvents = await actyx.queryAql({ query: `FROM ${WorldCreateWithId(id)} ` })
        const event = actyxEvents.filter((e): e is AqlEventMessage => e.type === "event").at(0)
        const parsed = Sensor.Type.safeParse(event?.payload)
        if (parsed.success) {
            return parsed.data
        }
        return undefined
    }

    private static async retrieveLatestStateFromActyx(id: string, actyx: Actyx): Promise<number | undefined> {
        const actyxEvents = await actyx.queryAql({
            query: `
                PRAGMA features := aggregate
                FROM ${PlantHappenings.TagPlantWithId(id)} & ${WorldUpdate}
                AGGREGATE LAST(_.water)
            `
        })
        const event = actyxEvents.filter((e): e is AqlEventMessage => e.type === "event").at(0)
        return event?.payload as number // should be save due to the kind of query
    }

    private measureWater(): number {
        const currentMeasure = performance.now()
        const elapsed = currentMeasure - this.lastMeasure

        this.water = Math.max(Math.round((this.water - (elapsed / 1000)) * 100) / 100, 0)
        this.lastMeasure = currentMeasure

        return this.water
    }

    private toPayload(): Sensor.Type {
        return {
            id: this.id,
            water: this.water,
            pos: this.position,
            t: "Sensor"
        }
    }
}
