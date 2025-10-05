export const config = {
  matcher: [
    // All routes except webhook or checkout
    '/((?!api/webhook|api/checkout).*)',
  ],
};