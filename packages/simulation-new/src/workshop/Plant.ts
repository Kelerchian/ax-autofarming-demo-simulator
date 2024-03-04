/* eslint-disable @typescript-eslint/no-unused-vars */
import { sleep } from "systemic-ts-utils/async-utils";
import { PlantData } from "../common/actors";
import { PlantCoordinationCode } from "../actors/Plant";
import { publishWaterOk, publishWaterRequest } from "./queries";

/**
 * NOTE:
 *
 * Loop to check if water level is low. When low, request for water once and
 * then wait until water level is healthy. After water level has been recovered,
 * emit `Ok` to stop other robots to accidentally overwater.
 *
 * This works in tandem with the rest of the code within `workshop` folder.
 *
 * HOWEVER, this mechanism is not enough to prevent several robots from
 * overwatering a plant during the period between "water request" and "ok".
 *
 * Your task is to fix this overwatering problem.
 */
export const plantCoordinationCode: PlantCoordinationCode = async ({
  actyx,
  getId,
  getWaterLevel,
  getPosition,
}) => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (getWaterLevel() < PlantData.WaterLevel.CanBeWatered) {
      await publishWaterRequest(actyx, {
        pos: getPosition(),
        plantId: getId(),
        time: Date.now(),
      });

      while (getWaterLevel() < PlantData.WaterLevel.CanBeWatered) {
        await sleep(50);
      }
      await publishWaterOk(actyx, {
        plantId: getId(),
        time: Date.now(),
      });
    }
    // sleep to avoid spamming
    await sleep(50);
  }
};
