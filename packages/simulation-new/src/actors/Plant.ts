import { Actyx, AqlEventMessage } from "@actyx/sdk";
import {
  PlantHappenings,
  WorldCreate,
  WorldCreateWithId,
  WorldUpdate,
} from "../common/happenings";
import { Sensor } from "../common/actors";
import { v4 } from "uuid";
import { performWateringProtocol } from "../workshop/protocol/Plant";
import { sleep } from "systemic-ts-utils/async-utils";
import { Helper } from "../workshop/protocol/protocol";

export class Plant {
  // TODO: move `Actyx` object here
  private lastMeasure: number;

  private constructor(
    private actyx: Actyx,
    private id: string,
    private water: number,
    private position: { x: number; y: number },
    private initializationLamportTime: number
  ) {
    this.lastMeasure = Date.now();
  }

  static async init(actyx: Actyx): Promise<Plant> {
    const id = Plant.initId();
    const data = await Plant.retrieveIdFromActyx(id, actyx);
    // If we were able to retrieve an existing plant, we now need to
    // NOTE: we also need to get the requestId
    if (data) {
      const latestWaterEvent = await Plant.retrieveLatestStateFromActyx(
        id,
        actyx
      );

      return new Plant(
        actyx,
        id,
        latestWaterEvent?.data ?? data.data.water,
        data.data.pos,
        latestWaterEvent?.lamport || data.lamport
      );
    }

    const plant = new Plant(
      actyx,
      id,
      100,
      { x: 100, y: 100 }, // TODO: make random,
      0
    );
    await actyx.publish(
      WorldCreate.and(WorldCreateWithId(plant.id))
        .and(PlantHappenings.TagPlant)
        .and(PlantHappenings.TagPlantWithId(plant.id))
        .and(PlantHappenings.TagPlantCreated)
        .apply(plant.toPayload())
    );

    return plant;
  }

  async runWaterLevelUpdateLoop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(100);
      this.measureWater();
      console.log("measure water", this.water);
      if (this.water > 0) {
        await PlantHappenings.publishWaterLevelUpdate(this.actyx, {
          id: this.id,
          water: this.water,
        });
      }
    }
  }

  async runWateringRequestLoop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // sleep to avoid spamming
      await sleep(100);
      if (this.water < 50) {
        const requestId =
          (await Helper.plantNotDoneRequest(this.actyx, this.id))?.requestId ||
          v4();
        console.log("start:performWateringProtocol");
        console.log("plant:executeRequest", requestId);
        await performWateringProtocol(
          this.actyx,
          this.position,
          requestId,
          this.id
        );
      }
    }
  }

  async runLoop() {
    this.runWaterLevelUpdateLoop();
    this.runWateringRequestLoop();
    this.actyx.subscribe(
      {
        query: PlantHappenings.TagPlantWatered,
      },
      (e) => {
        console.log("watered", e.meta.lamport, this.initializationLamportTime);
        if (e.meta.lamport < this.initializationLamportTime) {
          return;
        }

        this.water += 30;
      }
    );
  }

  private static initId(): string {
    let plantId = localStorage.getItem("plantId");
    if (!plantId) {
      plantId = v4();
      localStorage.setItem("plantId", plantId);
    }
    return plantId;
  }

  private static async retrieveIdFromActyx(
    id: string,
    actyx: Actyx
  ): Promise<{ data: Sensor.Type; lamport: number } | undefined> {
    const actyxEvents = await actyx.queryAql({
      query: `FROM ${WorldCreateWithId(id)} `,
    });
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const parsed = Sensor.Type.safeParse(event?.payload);
    if (parsed.success) {
      return { data: parsed.data, lamport: event?.meta.lamport || 0 };
    }
    return undefined;
  }

  private static async retrieveLatestStateFromActyx(
    id: string,
    actyx: Actyx
  ): Promise<{ data: number; lamport: number } | undefined> {
    const actyxEvents = await actyx.queryAql({
      query: `
                PRAGMA features := aggregate
                FROM ${PlantHappenings.TagPlantWithId(id)} & ${WorldUpdate}
                AGGREGATE LAST(_.water)
            `,
    });
    const event = actyxEvents
      .filter((e): e is AqlEventMessage => e.type === "event")
      .at(0);
    const latestWaterValue = event?.payload as number; // should be safe due to the kind of query
    return { data: latestWaterValue, lamport: event?.meta.lamport || 0 };
  }

  private measureWater(): number {
    const currentMeasure = Date.now();
    const elapsed = currentMeasure - this.lastMeasure;

    this.water = Math.max(
      Math.round((this.water - elapsed / 500) * 100) / 100,
      0
    );
    this.lastMeasure = currentMeasure;

    return this.water;
  }

  private toPayload(): Sensor.Type {
    return {
      id: this.id,
      water: this.water,
      pos: this.position,
      t: "Sensor",
    };
  }
}
