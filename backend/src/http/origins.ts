const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

export function isAllowedLocalOrigin(origin: string) {
  return LOOPBACK_ORIGIN.test(origin.trim());
}
