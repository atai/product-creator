/**
 * Minimal `next/navigation` replacement on top of react-router (HashRouter).
 */
import { useMemo } from 'react';
import { useLocation, useNavigate, useParams as useRouterParams } from 'react-router-dom';

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => window.location.reload(),
      prefetch: () => undefined,
    }),
    [navigate]
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useRouterParams() as T;
}

export function notFound(): never {
  throw new Error('Not found');
}
