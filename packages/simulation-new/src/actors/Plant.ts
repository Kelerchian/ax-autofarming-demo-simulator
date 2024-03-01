import { Actyx } from "@actyx/sdk";
import { PlantHappenings } from "../common/happenings";
import { PlantData } from "../common/actors";
import { v4 } from "uuid";
import { sleep } from "systemic-ts-utils/async-utils";

/** Water drain level, in units / second. */
const WATER_DRAIN = 5;

export class Plant {
  /** The time at which the last water measurement was made (in milliseconds since the UNIX epoch). */
  private lastMeasurement: number;

  private constructor(
    private actyx: Actyx,
    private data: PlantData.Type,
    private initializationLamportTime: number,
    private coordination: (actyx: Actyx, data: PlantData.Type) => Promise<void>
  ) {
    this.lastMeasurement = Date.now();
  }

  private static initId(): string {
    let plantId = localStorage.getItem("plantId");
    if (!plantId) {
      plantId = v4();
      localStorage.setItem("plantId", plantId);
    }
    return plantId;
  }

  static async init(
    actyx: Actyx,
    waterRequest: (actyx: Actyx, data: PlantData.Type) => Promise<void>
  ): Promise<void> {
    const id = Plant.initId();
    const existingPlant = await PlantHappenings.retrieveById(actyx, id);
    const plant = await (async () => {
      if (existingPlant) {
        const latestWaterEvent = await PlantHappenings.retrieveWaterLevelOfId(
          actyx,
          id
        );

        return new Plant(
          actyx,
          PlantData.make({
            id,
            water: latestWaterEvent?.data ?? existingPlant.data.water,
            pos: existingPlant.data.pos,
          }),
          latestWaterEvent?.lamport || existingPlant.lamport,
          waterRequest
        );
      } else {
        const plant = new Plant(
          actyx,
          PlantData.make({
            id,
            pos: {
              x: Math.round(Math.random() * 400) - 200,
              y: Math.round(Math.random() * 100) + 100,
            },
          }),
          0,
          waterRequest
        );

        await PlantHappenings.publishPlantCreated(actyx, plant.getData());

        return plant;
      }
    })();

    return await plant.runLoop();
  }

  async runWaterLevelUpdateLoop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(50);
      this.measureWater();
      if (this.data.water > 0) {
        await PlantHappenings.publishWaterLevelUpdate(this.actyx, this.data);
      }
    }
  }

  async runWateringRequestLoop() {
    await this.coordination(this.actyx, this.data);
  }

  async runLoop() {
    this.runWaterLevelUpdateLoop();
    this.runWateringRequestLoop();
    PlantHappenings.subscribeWaterEventById(
      this.actyx,
      this.data.id,
      (meta) => {
        if (meta.lamport < this.initializationLamportTime) return;
        PlantData.WaterLevel.applyWater(this.data);
      }
    );
  }

  private measureWater(): number {
    const currentMeasurement = Date.now();
    const elapsed = currentMeasurement - this.lastMeasurement;
    const drainedWaterAmount = (elapsed / 1000) * WATER_DRAIN;
    const newWaterAmount = this.data.water - drainedWaterAmount;
    // rounds to 2 decimal places
    const roundedWaterLevel = Math.round(newWaterAmount * 100) / 100;

    this.data.water = Math.max(roundedWaterLevel, 0);
    this.lastMeasurement = currentMeasurement;

    return this.data.water;
  }

  private getData(): PlantData.Type {
    return { ...this.data };
  }
}
