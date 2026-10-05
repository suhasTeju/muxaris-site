export type LogFn = (level: "info" | "warn" | "error", msg: string, fields?: object) => void;

/** JSON lines. Fields are ids, counts, durations and error names only; never call content. */
export const jsonLog: LogFn = (level, msg, fields = {}) => {
  console.log(JSON.stringify({ level, msg, ...fields }));
};
