import { customAlphabet } from "nanoid";
const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
export type IdPrefix =
  | "cl"
  | "usr"
  | "mem"
  | "inv"
  | "doc"
  | "svc"
  | "pat"
  | "apt"
  | "ast"
  | "call"
  | "turn"
  | "cb"
  | "ntf"
  | "dr"
  | "aud"
  | "wh"
  | "to"
  | "hol";
export const newId = (prefix: IdPrefix) => `${prefix}_${nano()}`;
