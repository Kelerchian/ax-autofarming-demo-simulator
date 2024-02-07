import { Simulation } from "./simulation";
import Fastify from "fastify";

const server = Fastify({
  logger: true,
});

server.get("/", (_req, reply) => reply.send("world"));

// setup simulation
const simulation = Simulation.make();
new Array(1).fill(null).forEach((_) => simulation.api.add.waterPump());
new Array(4).fill(null).forEach((_) => simulation.api.add.robot());
new Array(5).fill(null).forEach((_) => simulation.api.add.sensor());

server.get("/state", (_req, reply) =>
  reply
    .code(200)
    .type("application/json")
    .send(
      simulation.api.getAll().sort((a, b) => {
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

server
  .listen({
    port: 3000,
    host: "::",
    listenTextResolver: (address) => `listening on ${address}`,
  })
  .catch((err) => {
    server.log.error(err);
    process.exit(1);
  });
