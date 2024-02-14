/* eslint-disable @typescript-eslint/no-unused-vars */
import { sleep } from "systemic-ts-utils/async-utils";
import { Actyx } from "@actyx/sdk";
import { manifest } from "../protocol/protocol";
import { randomUUID } from "crypto";
import { Sensor as WaterSensor } from "../../../../common-types/actors";
import * as z from "zod";

const MINIMUM_WATER_LEVEL = 50;
const RESTORE_WATER_LEVEL = 80;
const MAXIMUM_WATER_LEVEL = 100;

export const SpawnedSensor = z.object({
  id: z.string(),
  pos: z.object({ x: z.number(), y: z.number() }),
});
export type SpawnedSensor = z.TypeOf<typeof SpawnedSensor>;

// export const WaterSensor = z.object(
//     {
//         t: z.string(),
//         id: z.string(),
//         pos: z.object({ x: z.number(), y: z.number() }),
//         data: z.object({ decay: z.number(), water: z.number(), })
//     }
// );
// export type WaterSensor = z.TypeOf<typeof WaterSensor>;

async function readSensor(id: string): Promise<WaterSensor.Type> {
  const response = await fetch(`http://localhost:3000/id/${id}`);
  return WaterSensor.Type.parse(await response.json());
}

async function plantSensorLoop(actyx: Actyx) {
  const response: Response = await fetch(`http://127.0.0.1:3000/spawn/sensor`, {
    method: "POST",
  });

  const sensor = SpawnedSensor.parse(await response.json());

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(1000);
    const waterSensor = await readSensor(sensor.id);

    if (waterSensor.data.water < MINIMUM_WATER_LEVEL) {
      console.log("requesting water");
      const requestId = randomUUID();
      actyx.publish({
        event: {
          requestId,
          pos: sensor.pos,
        },
        tags: [
          "WateringRobot",
          `WateringRobot:${requestId}`,
          "WateringRobot:Created",
        ],
      });

      while ((await readSensor(sensor.id)).data.water < RESTORE_WATER_LEVEL) {
        await sleep(500);
      }

      console.log("got water back");
      actyx.publish({
        event: {
          plantId: sensor.id,
        },
        tags: [
          "WateringRobot",
          `WateringRobot:${requestId}`,
          "WateringRobot:PlantHasWater",
        ],
      });
    }
  }
}

async function withActyx() {
  const actyx = await Actyx.of(manifest);
  try {
    plantSensorLoop(actyx);
  } finally {
    actyx.dispose();
  }
}

withActyx();
