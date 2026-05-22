export { COOKIE_NAME } from '@shared/const';

/**
 * Get the login URL.
 * Now points to the local /login page (magic link flow)
 * instead of external Manus OAuth portal.
 */
export const getLoginUrl = (returnPath?: string) => {
  const loginPath = '/login';
  if (returnPath) {
    return `${loginPath}?returnTo=${encodeURIComponent(returnPath)}`;
  }
  return loginPath;
};
