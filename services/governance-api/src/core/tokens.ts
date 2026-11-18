/** Injection tokens for non-class providers. */
export const APP_CONFIG = Symbol('APP_CONFIG');
export const DB = Symbol('DB');
export const HANDLERS = Symbol('HANDLERS');
export const CLOCK = Symbol('CLOCK');

export type Clock = () => Date;
