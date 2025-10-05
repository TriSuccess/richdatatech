export const config = {
  matcher: [
    // All routes except webhook
    '/((?!api/webhook).*)',
  ],
};