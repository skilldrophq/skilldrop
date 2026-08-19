const ESC = "\u001b[";

const colorEnabled = () => {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined)
    return process.env.FORCE_COLOR !== "0";
  return process.stdout.isTTY === true;
};

const wrap = (open: number, close: number) => (text: string) =>
  colorEnabled() ? `${ESC}${open}m${text}${ESC}${close}m` : text;

export const ui = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  accent: wrap(94, 39),
  success: wrap(92, 39),
  warning: wrap(93, 39),
  danger: wrap(91, 39),
  path: wrap(96, 39),
};

export const heading = (title: string, detail?: string) =>
  `${ui.accent("◆")} ${ui.bold(title)}${detail === undefined ? "" : ` ${ui.dim(detail)}`}`;

export const section = (title: string, count?: number) =>
  `${ui.bold(title)}${count === undefined ? "" : ` ${ui.dim(`· ${count}`)}`}`;

export const rows = (
  entries: ReadonlyArray<readonly [label: string, value: string]>,
  indent = "  ",
) => {
  const width = Math.max(...entries.map(([label]) => label.length));
  return entries.map(
    ([label, value]) => `${indent}${ui.dim(label.padEnd(width))}  ${value}`,
  );
};

export const commandHint = (command: string) =>
  `${ui.dim("Run")}  ${ui.accent(command)}`;

export const successMessage = (message: string) =>
  `${ui.success("✓")} ${message}`;

export const warningMessage = (message: string) =>
  `${ui.warning("!")} ${message}`;

export const errorMessage = (message: string) => `${ui.danger("✗")} ${message}`;
