import net from "node:net";

export type TcpSimulatorOptions = {
  model?: string;
  firmwareVersion?: string;
  deviceId?: string;
  serialNumber?: string;
};

export class ShureTcpSimulator {
  private readonly server: net.Server;
  private muteState: "ON" | "OFF" = "OFF";
  private gain = "1100";
  port = 0;

  constructor(private readonly options: TcpSimulatorOptions = {}) {
    this.server = net.createServer((socket) => {
      socket.once("data", (chunk) => {
        const command = chunk.toString("ascii").trim();
        socket.write(this.respond(command));
      });
    });
  }

  async start(): Promise<this> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        const address = this.server.address();
        if (!address || typeof address === "string") {
          reject(new Error("TCP simulator did not receive a port."));
          return;
        }
        this.port = address.port;
        resolve();
      });
    });

    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private respond(command: string): string {
    switch (command) {
      case "< GET MODEL >":
        return `< REP MODEL ${this.options.model ?? "MXA920"} >`;
      case "< GET FW_VER >":
        return `< REP FW_VER ${this.options.firmwareVersion ?? "6.6.1"} >`;
      case "< GET DEVICE_ID >":
        return `< REP DEVICE_ID ${this.options.deviceId ?? "Simulator"} >`;
      case "< GET SERIAL_NUM >":
        return `< REP SERIAL_NUM ${this.options.serialNumber ?? "SIM123456"} >`;
      case "< GET DEVICE_AUDIO_MUTE >":
        return `< REP DEVICE_AUDIO_MUTE ${this.muteState} >`;
      case "< SET DEVICE_AUDIO_MUTE ON >":
      case "< SET DEVICE_AUDIO_MUTE OFF >":
        this.muteState = command.includes(" ON ") ? "ON" : "OFF";
        return `< REP DEVICE_AUDIO_MUTE ${this.muteState} >`;
      case "< SET DEVICE_AUDIO_MUTE TOGGLE >":
        this.muteState = this.muteState === "ON" ? "OFF" : "ON";
        return `< REP DEVICE_AUDIO_MUTE ${this.muteState} >`;
      case "< GET 09 AUDIO_GAIN_HI_RES >":
      case "< GET 01 AUDIO_GAIN_HI_RES >":
        return `< REP 09 AUDIO_GAIN_HI_RES ${this.gain} >`;
      case "< SET 09 AUDIO_GAIN_HI_RES 1100 >":
      case "< SET 01 AUDIO_GAIN_HI_RES 1100 >":
        this.gain = "1100";
        return `< REP 09 AUDIO_GAIN_HI_RES ${this.gain} >`;
      case "< SET FLASH ON >":
        return "< REP FLASH ON >";
      case "< SET FLASH OFF >":
        return "< REP FLASH OFF >";
      case "< SET PRESET 01 >":
        return "< REP PRESET 01 >";
      default:
        return "< REP ERR >";
    }
  }
}
