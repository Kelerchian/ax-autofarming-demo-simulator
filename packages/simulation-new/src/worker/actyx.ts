import { Actyx, ActyxEvent, Tags } from "@actyx/sdk";
import { z } from "zod";
import { Simulator } from "./sim";
import { Pos, Robot, Sensor } from "../common/actors";


const SpawnEvent = z.object({
    id: z.string(),
    entity: z.enum(["Robot", "Plant"]),
    pos: z.object({
        x: z.number(),
        y: z.number(),
    }),
});
type SpawnEvent = z.TypeOf<typeof SpawnEvent>;

const MoveEvent = z.object({
    id: z.string(),
    pos: z.object({ x: z.number(), y: z.number() }),
});
type MoveEvent = z.TypeOf<typeof MoveEvent>;

function tryHandleMoveEvent(e: ActyxEvent, simulator: Simulator): boolean {
    const parsedEvent = MoveEvent.safeParse(e.payload);
    if (parsedEvent.success) {
        const actor = simulator.api.actorsMap().get(parsedEvent.data.id);
        if (actor) {
            simulator.api.move(parsedEvent.data.id, parsedEvent.data.pos);
        } else {
            console.log("actor not found");
        }
        return true
    }
    console.log(`error parsing payload as MoveEvent: ${e.payload}`);
    return false
}

function tryHandleSpawnEvent(e: ActyxEvent, simulator: Simulator): boolean {
    const parsedEvent = SpawnEvent.safeParse(e.payload);
    if (parsedEvent.success) {
        if (simulator.api.actorsMap().has(parsedEvent.data.id)) {
            console.log(`got duplicate id: ${e.payload}`);
        } else {
            switch (parsedEvent.data.entity) {
                case "Robot": {
                    simulator.api.add(
                        Robot.make({
                            id: parsedEvent.data.id,
                            pos: Pos.make({
                                x: parsedEvent.data.pos.x,
                                y: parsedEvent.data.pos.y,
                            }),
                        })
                    );
                    break;
                }
                case "Plant": {
                    simulator.api.add(
                        Sensor.make({
                            id: parsedEvent.data.id,
                            pos: Pos.make({
                                x: parsedEvent.data.pos.x,
                                y: parsedEvent.data.pos.y,
                            }),
                        })
                    );
                    break;
                }
            }
        }
        return true
    }
    console.log(`error parsing payload as LocationEvent: ${e.payload}`);
    return false
}


export async function runActyxSubscription(actyx: Actyx, simulator: Simulator) {
    actyx.subscribe({ query: Tags("World") }, (e) => {
        if (tryHandleSpawnEvent(e, simulator)) { return }
        if (tryHandleMoveEvent(e, simulator)) { return }
        throw new Error(`unhandled event: ${e}`)
    });
}

export async function spawnStart(actyx: Actyx) {
    // TODO: get random uuids
    const actors = [
        {
            id: "2476e38f-2f18-4c76-9793-a9e850415d68",
            entity: "Robot",
            pos: { x: -100, y: -50 }
        },
        {
            id: "366a4af4-4624-455d-8157-2f597d9f22e0",
            entity: "Plant",
            pos: { x: -200, y: -50 }
        }
    ]
    actors.forEach((event) => {
        actyx.publish({
            tags: ["World"], event
        })
    })
}

//  '{"id":"2476e38f-2f18-4c76-9793-a9e850415d68","entity":"Robot","position":{"x":0,"y":0}}'
// const le: LocationEvent = {
//     id: "2476e38f-2f18-4c76-9793-a9e850415d68",
//     entity: "Robot",
//     position: {
//         x: 0,
//         y: 0,
//     },
// };

// '{"id":"2476e38f-2f18-4c76-9793-a9e850415d68","position":{"x":100,"y":100}}'
// const pe: PositionEvent = {
//     id: "2476e38f-2f18-4c76-9793-a9e850415d68",
//     position: {
//         x: 0,
//         y: 0,
//     },
// };
