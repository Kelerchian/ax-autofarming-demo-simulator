import { Simulation } from "./simulation";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Actor, Robot, Sensor } from "../../common-types/actors";

(async () => {
  const server = Fastify({ logger: false });
  await server.register(cors, { origin: "*" });

  // setup simulation
  const simulation = Simulation.make();
  new Array(2).fill(null).forEach((_) => simulation.api.add.robot());
  new Array(5).fill(null).forEach((_) => simulation.api.add.sensor());
  simulation.api.add.waterPump();

  server.get("/", (_req, reply) => reply.send("world"));

  server.post("/spawn/robot", (_, reply) => {
    const info = simulation.api.add.robot();
    return reply.code(200).send(info);
  });

  server.post("/spawn/sensor", (_, reply) => {
    const info = simulation.api.add.sensor();
    return reply.code(200).send(info);
  });

  server.post("/action", (req, reply) => {
    const res = Actor.Actions.safeParse(req.body);
    if (!res.success) {
      return reply
        .code(400)
        .send(`action unrecognizable ${JSON.stringify(req.body)}`);
    }
    const { id: actorId, action } = res.data;
    const actor = simulation.api.getById(actorId);
    if (!actor) {
      return reply.code(400).send(`actor not found id=${actorId}`);
    }

    const whenRobotAction = Robot.Actions.Actions.safeParse(action);
    if (whenRobotAction.success && actor.t === "Robot") {
      Robot.Actions.apply(simulation.api.getAll(), actor, whenRobotAction.data);
      return reply.code(204).send(null);
    }

    const whenSensorAction = Sensor.Actions.Actions.safeParse(action);
    if (whenSensorAction.success && actor.t === "Sensor") {
      Sensor.Actions.apply(
        simulation.api.getAll(),
        actor,
        whenSensorAction.data
      );
      return reply.code(204).send(null);
    }

    return reply
      .code(400)
      .send(`actor is not a robot ${JSON.stringify(actor)}`);
  });

  server.get<{ Params: { actorId: string } }>("/id/:actorId", (req, reply) => {
    const { actorId } = req.params;
    const actor = simulation.api.getById(actorId);
    if (!actor) return reply.code(404).send(null);
    return reply.code(200).type("application/json").send(actor);
  });

  server.get("/state", (_req, reply) =>
    reply
      .code(200)
      .type("application/json")
      .send(
        simulation.api.getAsArray().sort((a, b) => {
          switch (true) {
            case a.t > b.t:
              return 1;
            case a.t < b.t:
              return -1;
            default: {
              switch (true) {
                case a.id > b.id:
                  return 1;
                case b.id < a.id:
                  return -1;
                default:
                  return 0;
              }
            }
          }
        })
      )
  );

  await server
    .listen({
      port: 3000,
      host: "::",
      listenTextResolver: (address) => `listening on ${address}`,
    })
    .catch((err) => {
      server.log.error(err);
      process.exit(1);
    });
})();
