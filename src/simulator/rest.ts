import http from "node:http";

export type RestSimulatorOptions = {
  model?: string;
  firmwareVersion?: string;
};

export class MxaRestSimulator {
  private readonly server: http.Server;
  private muted = false;
  private preset = 1;
  port = 0;

  constructor(private readonly options: RestSimulatorOptions = {}) {
    this.server = http.createServer((request, response) => {
      this.handle(request, response).catch((error) => {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      });
    });
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<this> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        const address = this.server.address();
        if (!address || typeof address === "string") {
          reject(new Error("REST simulator did not receive a port."));
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

  private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", this.baseUrl);

    if (request.method === "GET" && url.pathname === "/api/v1/device") {
      this.json(response, {
        model: this.options.model ?? "MXA920",
        firmwareVersion: this.options.firmwareVersion ?? "6.6.1",
        api: "simulated",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/mute") {
      this.json(response, { muted: this.muted });
      return;
    }

    if (["PATCH", "PUT", "POST"].includes(request.method ?? "") && url.pathname === "/api/v1/mute") {
      const body = await readJson(request);
      this.muted = Boolean(body.muted);
      this.json(response, { muted: this.muted });
      return;
    }

    if (["PATCH", "PUT", "POST"].includes(request.method ?? "") && url.pathname === "/api/v1/presets/current") {
      const body = await readJson(request);
      this.preset = Number(body.preset);
      this.json(response, { preset: this.preset });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/talker-positions") {
      this.json(response, {
        positions: [{ lobeId: 1, coverageAreaId: 2, xCm: 137, yCm: -168, zCm: 152 }],
      });
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  }

  private json(response: http.ServerResponse, payload: unknown): void {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  }
}

async function readJson(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}
