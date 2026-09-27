// Unit tests run in Node; the real module only exists inside workerd.
export function connect(): never {
  throw new Error('cloudflare:sockets is not available in unit tests');
}
