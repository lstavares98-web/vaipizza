export function isDeliveryRoute(pathname: string) {
  return pathname === "/delivery" || pathname.startsWith("/delivery/");
}

export function shouldShowBottomNav(hasUser: boolean, pathname: string) {
  return hasUser && !isDeliveryRoute(pathname);
}
