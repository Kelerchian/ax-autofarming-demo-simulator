import ReactDOM from "react-dom/client";
import { SimulatorView } from "./Simulator.tsx";
import "./index.scss";
import { Simulator } from "./worker/sim.tsx";
import { Pos, Robot, Sensor } from "../../common-types/actors.tsx";

const simulator = Simulator();
simulator.api.init();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SimulatorView simulator={simulator} />
);

[
  "2476e38f-2f18-4c76-9793-a9e850415d68",
  "12f47d73-a352-4e83-8f9a-27703e2b2b79",
  "fb1c464f-1f45-4010-b06e-9b230708bb9b",
  "508259f6-03a0-4d85-8d00-9971b1c46691",
]
  .map((id, index) => ({
    id,
    x: (index - 1.5) * 200,
  }))
  .map(({ id, x }) => {
    simulator.api.add(Sensor.make({ id, pos: Pos.make({ x, y: -200 }) }));
  });

[
  "366a4af4-4624-455d-8157-2f597d9f22e0",
  "b4f2b9ea-13fd-4e25-86ee-993d6b8c566a",
  "1b458bd5-6806-4fec-9946-d13571d5a3bd",
]
  .map((id, index) => ({
    id,
    x: (index - 1) * 200,
  }))
  .map(({ id, x }) => {
    simulator.api.add(Robot.make({ id, pos: Pos.make({ x, y: +200 }) }));
  });
