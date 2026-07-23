import { customAlphabet, nanoid } from "nanoid";

/** URL-safe, unambiguous slug alphabet (no look-alikes). */
const slugAlphabet = "23456789abcdefghijkmnpqrstuvwxyz";
const slugGen = customAlphabet(slugAlphabet, 8);

export const newId = (): string => nanoid();
export const newSlug = (): string => slugGen();
export const newToken = (): string => nanoid(32);
