import { spawn } from "node:child_process";
import { MAKERS } from "./config.ts";

/** Starts each maker as its own process, so one can be killed live in the demo. */
const children = Object.keys(MAKERS).map((id) =>
  spawn("pnpm", ["exec", "tsx", "src/index.ts", id], { stdio: "inherit", env: { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER } }),
);

const stop = () => children.forEach((child) => child.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
