import { AppManifest } from "@actyx/sdk";
import { MachineEvent, SwarmProtocol } from "@actyx/machine-runner";

export type PlantRequest = { plantId: string, requestId: string }

export namespace Events {
    export const PlantRequestedWater = MachineEvent
        .design("Created")
        .withPayload<PlantRequest>();

    export const ReachedPlant = MachineEvent
        .design("ReachedPlant")
        .withoutPayload();

    export const PlantHasWater = MachineEvent
        .design("PlantHasWater")
        .withoutPayload();

    export const Done = MachineEvent
        .design("Done")
        .withoutPayload();

    export const All = [
        PlantRequestedWater,
        ReachedPlant,
        PlantHasWater,
        Done
    ] as const;
}

export const protocol = SwarmProtocol.make("wateringRobot", Events.All);

export const manifest: AppManifest = {
    appId: "com.example.plant-farm",
    displayName: "Plant Farm",
    version: "1.0.0",
}
