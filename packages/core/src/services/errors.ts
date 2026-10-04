export type CoreErrorCode = "not_found" | "conflict" | "forbidden" | "validation";

export class CoreError extends Error {
  constructor(
    public code: CoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CoreError";
  }
}
