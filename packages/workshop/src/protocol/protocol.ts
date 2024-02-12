import { AppManifest } from "@actyx/sdk";
import { MachineEvent, SwarmProtocol } from "@actyx/machine-runner";

export type RequestId = { requestId: string }
export type PlantRequest = { pos: { x: number, y: number } } & RequestId

export namespace Events {
    export const PlantRequestedWater = MachineEvent
        .design("Created")
        .withPayload<PlantRequest>();

    // TODO(duarte): I think a moving state would be helpful to filter out requests that are being acted on (just to provide more granularity)

    export const ReachedPlant = MachineEvent
        .design("ReachedPlant")
        .withPayload<RequestId>();

    export const PlantHasWater = MachineEvent
        .design("PlantHasWater")
        .withPayload<RequestId>();

    export const Done = MachineEvent
        .design("Done")
        .withPayload<RequestId>();

    export const All = [
        PlantRequestedWater,
        ReachedPlant,
        PlantHasWater,
        Done
    ] as const;
}

export const protocol = SwarmProtocol.make("WateringRobot", Events.All);

export const manifest: AppManifest = {
    appId: "com.example.plant-farm",
    displayName: "Plant Farm",
    version: "1.0.0",
}
