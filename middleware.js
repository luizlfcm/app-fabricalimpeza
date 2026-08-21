export default function middleware(request) {
  // Autenticação feita dentro do app via login por email
  // Middleware apenas deixa passar
  return;
}

export const config = {
  matcher: '/(.*)',
};
