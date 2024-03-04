import { Actyx } from "@actyx/sdk";
import { PlantHappenings } from "../common/happenings";
import { PlantData } from "../common/actors";
import { v4 as v4 } from "uuid";
import { sleep } from "systemic-ts-utils/async-utils";

/** Water drain level, in units / second. */
const WATER_DRAIN = 5;

/**
 * A callback that contains the code to coordinate this particular plant and the
 * rest of robots and plants in the swarm. The goal of the coordination is to
 * make the robots and the plants work together so that plants are watered
 * optimally (not underwatered nor overwatered).
 *
 * It is run on initialization. Actyx, the plant data getter, and the watering
 * functionality is exposed through its parameter.
 */
export type PlantExposedInterface = {
  actyx: Actyx;
  getData: () => PlantData.Type;
};

export type PlantCoordinationCode = (
  params: PlantExposedInterface
) => Promise<void>;

export class Plant {
  /** The time at which the last water measurement was made (in milliseconds since the UNIX epoch). */
  private lastMeasurement: number;

  private constructor(
    private actyx: Actyx,
    private data: PlantData.Type,
    private initializationLamportTime: number,
    private coordination: PlantCoordinationCode
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

  private static async loadExisting(actyx: Actyx, id: string) {
    const creation = await PlantHappenings.retrieveById(actyx, id);
    if (!creation) return null;
    const latestWaterState = await PlantHappenings.retrieveWaterLevelOfId(
      actyx,
      id
    );
    return {
      data: PlantData.make({
        ...creation.data,
        water: latestWaterState?.data ?? creation.data.water,
      }),
      lamport: latestWaterState?.lamport || creation.lamport,
    };
  }

  private static async init(
    actyx: Actyx,
    coordination: PlantCoordinationCode
  ): Promise<Plant> {
    const id = Plant.initId();
    const existing = await Plant.loadExisting(actyx, id);

    if (existing) {
      return new Plant(actyx, existing.data, existing.lamport, coordination);
    }

    const data = PlantData.make({
      id,
      pos: {
        x: Math.round(Math.random() * 400) - 200,
        y: Math.round(Math.random() * 100) + 100,
      },
    });
    await PlantHappenings.publishPlantCreated(actyx, data);

    return new Plant(actyx, data, 0, coordination);
  }

  static async run(
    actyx: Actyx,
    coordination: PlantCoordinationCode
  ): Promise<unknown> {
    const plant = await this.init(actyx, coordination);
    return await plant.runLoop();
  }

  private async runWaterLevelUpdateLoop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(50);
      this.measureWater();
      if (this.data.water > 0) {
        await PlantHappenings.publishWaterLevelUpdate(this.actyx, this.data);
      }
    }
  }

  private async runLoop() {
    this.runWaterLevelUpdateLoop();
    this.coordination({
      actyx: this.actyx,
      getData: () => ({ ...this.data }),
    });
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
}
