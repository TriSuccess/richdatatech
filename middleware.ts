export function middleware(request: Request) {
  // No logic needed; just an empty function to satisfy Next.js
  return;
}

export const config = {
  matcher: [
    // All routes except webhook or checkout
    '/((?!api/webhook|api/checkout).*)',
  ],
};