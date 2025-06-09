import { app } from "../../../server2";
import { ServerOptions } from "fortify2-js";

export const nested_dir_config: ServerOptions = {
  server: {
    autoPortSwitch: {
      enabled: true,
      onPortSwitch(originalPort, newPort) {
        app.forceClosePort(originalPort);
        console.log("😎 Switched from port " + originalPort + " to " + newPort);
      },
    },
  },
};
