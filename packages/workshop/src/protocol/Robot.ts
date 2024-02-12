import { MachineEvent, createMachineRunner } from "@actyx/machine-runner";
import { Actyx, AqlEventMessage } from "@actyx/sdk";
import { Events, manifest, protocol, PlantRequest } from "./protocol";
import { sleep } from "systemic-ts-utils/async-utils";

const machine = protocol.makeMachine("robot");

namespace States {
    export const Initial = machine
        .designEmpty("Initial")
        .command("create", [Events.PlantRequestedWater], (_, request: PlantRequest) => [request])
        .finish()

    export const Idle = machine
        .designState("Idle")
        .withPayload<PlantRequest>()
        .command("moveToPlant", [Events.PlantRequestedWater], (context) => [context.self])
        .finish()

    export const MovingToPlant = machine
        .designState("MovingToPlant")
        .withPayload<PlantRequest>()
        .command("reachedPlant", [Events.ReachedPlant], (context) => [context.self])
        .finish()

    export const WateringPlant = machine
        .designState("WateringPlant")
        .withPayload<PlantRequest>()
        .command("stopWateringPlant", [Events.PlantHasWater], (context) => [context.self])
        .finish()

    export const FinishedWateringPlant = machine
        .designState("FinishedWateringPlant")
        .withPayload<PlantRequest>()
        .command("done", [Events.Done], (context) => [context.self])
        .finish()

    export const Done = machine
        .designState("Done")
        .withPayload<PlantRequest>()
        .finish()

    export const All = [
        Initial,
        MovingToPlant,
        WateringPlant,
        FinishedWateringPlant,
        Done
    ] as const
}

States.Initial.react(
    [Events.PlantRequestedWater],
    States.Idle,
    (_, event) => ({
        pos: event.payload.pos,
        requestId: event.payload.requestId,
    })
)

States.Idle.react(
    [Events.PlantRequestedWater],
    States.MovingToPlant,
    (state, _) => ({
        pos: state.self.pos,
        requestId: state.self.requestId,
    })
)

States.MovingToPlant.react(
    [Events.ReachedPlant],
    States.WateringPlant,
    (state, _) => ({
        pos: state.self.pos,
        requestId: state.self.requestId,
    })
)

States.WateringPlant.react(
    [Events.PlantHasWater],
    States.FinishedWateringPlant,
    (state, _) => ({
        pos: state.self.pos,
        requestId: state.self.requestId,
    })
)

States.FinishedWateringPlant.react(
    [Events.Done],
    States.Done,
    (state, _) => ({
        pos: state.self.pos,
        requestId: state.self.requestId,
    })
)

async function loop(sdk: Actyx) {
    while (true) {
        const unwateredPlant = await sdk.queryAql(`
            PRAGMA features := interpolation subQuery

            FROM '${machine.swarmName}:Created'

            LET doneEvents :=
                FROM \`${machine.swarmName}:{_.requestId}\`
                & '${machine.swarmName}:PlantHasWater'

            LET done := IsDefined(doneEvents[0])

            FILTER !done
        `).then((responses) => (
            responses.filter(
                (event): event is AqlEventMessage => (event.type === "event")
            )[0] || undefined
        ));

        if (!unwateredPlant) {
            continue
        }

        const payload = unwateredPlant.payload as MachineEvent.Of<typeof Events.PlantRequestedWater>

        const runner = createMachineRunner(
            sdk,
            protocol.tagWithEntityId(payload.requestId),
            States.Initial,
            undefined
        )

        console.log("machine created")

        for await (const state of runner) {
            if (state.is(States.Initial)) {
                console.log("initial")
                state.cast().commands()?.create(payload)
            } else if (state.is(States.Idle)) {
                console.log("idle")
                state.cast().commands()?.moveToPlant()
            } else if (state.is(States.MovingToPlant)) {
                console.log("moving")
                state.cast().commands()?.reachedPlant()
            } else if (state.is(States.WateringPlant)) {
                console.log("watering")
                state.cast().commands()?.stopWateringPlant()
            } else if (state.is(States.FinishedWateringPlant)) {
                console.log("finished")
                state.cast().commands()?.done()
            }
        }

        await sleep(100)
    }
}

export async function main() {
    const sdk = await Actyx.of(manifest);
    try {
        await loop(sdk)
    } finally {
        sdk.dispose()
    }
}

main();
