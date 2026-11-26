/** Minimal `next/link` replacement on top of react-router */
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

function toPath(href: Props['href']): string {
  if (typeof href === 'string') return href;
  const query = href.query ? `?${new URLSearchParams(href.query)}` : '';
  return `${href.pathname ?? ''}${query}`;
}

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, scroll: _s, ...rest }, ref) {
  void _p;
  void _s;
  return <RouterLink ref={ref} to={toPath(href)} {...rest} />;
});

export default Link;
