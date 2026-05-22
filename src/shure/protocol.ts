export type ShureFrame = {
  raw: string;
  body: string;
  type: string;
  tokens: string[];
  parameter?: string;
  index?: string;
  valueTokens: string[];
  isError: boolean;
};

export type ParsedShureResponse = {
  raw: string;
  frames: ShureFrame[];
  trailingText: string;
};

const commandPattern = /^<\s*(GET|SET)\b[^<>]*>$/i;

export function normalizeCommand(command: string): string {
  const normalized = command.trim().replace(/\s+/g, " ");

  if (!commandPattern.test(normalized)) {
    throw new Error("Shure commands must look like '< GET ... >' or '< SET ... >'.");
  }

  return normalized
    .replace(/^<\s*/, "< ")
    .replace(/\s*>$/, " >");
}

export function tokenizeFrameBody(body: string): string[] {
  const tokens: string[] = [];
  const tokenPattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(body)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }

  return tokens;
}

export function parseShureResponse(raw: string): ParsedShureResponse {
  const frames: ShureFrame[] = [];
  const consumedRanges: Array<[number, number]> = [];
  const framePattern = /<([^<>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = framePattern.exec(raw)) !== null) {
    const frameRaw = match[0];
    const body = match[1].trim();
    const tokens = tokenizeFrameBody(body);
    const type = tokens[0]?.toUpperCase() ?? "";
    const isError = type === "REP" && tokens[1]?.toUpperCase() === "ERR";
    const parsed = parseFrameShape(frameRaw, body, type, tokens, isError);

    frames.push(parsed);
    consumedRanges.push([match.index, match.index + frameRaw.length]);
  }

  return {
    raw,
    frames,
    trailingText: removeConsumedRanges(raw, consumedRanges).trim(),
  };
}

export function firstValueForParameter(response: ParsedShureResponse, parameter: string): string | undefined {
  const upperParameter = parameter.toUpperCase();
  const frame = response.frames.find((candidate) => candidate.parameter === upperParameter && !candidate.isError);
  return frame?.valueTokens.join(" ").trim();
}

function parseFrameShape(
  raw: string,
  body: string,
  type: string,
  tokens: string[],
  isError: boolean,
): ShureFrame {
  if (type === "REP" && !isError) {
    const maybeIndex = tokens[1];
    const hasIndex = maybeIndex !== undefined && /^\d{1,2}$/.test(maybeIndex);
    const parameter = hasIndex ? tokens[2]?.toUpperCase() : maybeIndex?.toUpperCase();
    const valueTokens = hasIndex ? tokens.slice(3) : tokens.slice(2);

    return {
      raw,
      body,
      type,
      tokens,
      parameter,
      index: hasIndex ? maybeIndex.padStart(2, "0") : undefined,
      valueTokens,
      isError,
    };
  }

  if (type === "SAMPLE") {
    return {
      raw,
      body,
      type,
      tokens,
      parameter: tokens[1]?.toUpperCase(),
      valueTokens: tokens.slice(2),
      isError: false,
    };
  }

  return {
    raw,
    body,
    type,
    tokens,
    parameter: isError ? "ERR" : tokens[1]?.toUpperCase(),
    valueTokens: isError ? tokens.slice(2) : tokens.slice(2),
    isError,
  };
}

function removeConsumedRanges(raw: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) {
    return raw;
  }

  let output = "";
  let cursor = 0;

  for (const [start, end] of ranges) {
    output += raw.slice(cursor, start);
    cursor = end;
  }

  output += raw.slice(cursor);
  return output;
}
