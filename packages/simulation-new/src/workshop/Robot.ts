/* eslint-disable @typescript-eslint/no-unused-vars */
import { sleep } from "systemic-ts-utils/async-utils";
import { RobotCoordinationCode } from "../actors/Robot";
import { queryUnderwatered } from "./queries";

/**
 * Query for underwatered plants to water.
 *
 * This works in tandem with the rest of the code within `workshop` folder.
 *
 * HOWEVER, this mechanism is not enough to prevent several robots from
 * overwatering a plant during the period between "water request" and "ok".
 *
 * Your task is to fix this overwatering problem.
 */
export const robotCoordinationCode: RobotCoordinationCode = async (params) => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(50);
    try {
      const request = (await queryUnderwatered(params.actyx)).at(0);
      if (request) {
        await params.waterPlant({ id: request.plantId, pos: request.pos });
      }
    } catch (error) {
      console.error(error);
    }
  }
};
