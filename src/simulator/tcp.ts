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
      let buffer = "";

      socket.on("data", (chunk) => {
        buffer += chunk.toString("ascii");

        let match: RegExpExecArray | null;
        while ((match = /<[^<>]*>/.exec(buffer)) !== null) {
          const frame = match[0].trim();
          buffer = buffer.slice(match.index + match[0].length);
          const response = this.respond(frame);
          if (response) {
            socket.write(response);
          }
        }
      });

      socket.on("error", () => {});
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
    const model = this.options.model ?? "MXA920";

    switch (command) {
      case "< GET MODEL >":
        return `< REP MODEL ${model} >`;
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
      // Metering
      case "< GET 01 AUDIO_IN_PEAK_LEVEL >":
        return "< REP 01 AUDIO_IN_PEAK_LEVEL -300 >";
      case "< GET 02 AUDIO_IN_PEAK_LEVEL >":
        return "< REP 02 AUDIO_IN_PEAK_LEVEL -480 >";
      case "< GET NUM_CHANNELS >":
        return "< REP NUM_CHANNELS 8 >";
      // Dante
      case "< GET DANTE_ENABLED >":
        return "< REP DANTE_ENABLED ON >";
      case "< GET DANTE_DEVICE_NAME >":
        return `< REP DANTE_DEVICE_NAME ${model}-Simulator >`;
      case "< GET DANTE_AES67 >":
        return "< REP DANTE_AES67 OFF >";
      case "< GET IP_ADDR_NET_AUDIO_PRIMARY >":
        return "< REP IP_ADDR_NET_AUDIO_PRIMARY 169.254.1.1 >";
      case "< GET IP_SUBNET_NET_AUDIO_PRIMARY >":
        return "< REP IP_SUBNET_NET_AUDIO_PRIMARY 255.255.0.0 >";
      case "< GET IP_GATEWAY_NET_AUDIO_PRIMARY >":
        return "< REP IP_GATEWAY_NET_AUDIO_PRIMARY 0.0.0.0 >";
      case "< GET CONTROL_MAC_ADDR >":
        return "< REP CONTROL_MAC_ADDR AA:BB:CC:DD:EE:FF >";
      // Wireless
      case "< GET 01 BATT_CHARGE >":
        return "< REP 01 BATT_CHARGE 85 >";
      case "< GET 01 RF_FREQUENCY >":
        return "< REP 01 RF_FREQUENCY 655600 >";
      case "< GET 01 RF_POWER >":
        return "< REP 01 RF_POWER NORMAL >";
      case "< GET 01 RF_SIGNAL_STRENGTH >":
        return "< REP 01 RF_SIGNAL_STRENGTH 80 >";
      case "< GET 01 TX_TYPE >":
        return "< REP 01 TX_TYPE QLXD2 >";
      default:
        return "< REP ERR >";
    }
  }
}
