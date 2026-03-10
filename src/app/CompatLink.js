import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

const isExternalHref = (value) => /^(https?:)?\/\//i.test(`${value || ''}`) || `${value || ''}`.startsWith('mailto:');

export default function CompatLink({ to, href, children, ...rest }) {
  const target = to || href || '#';
  if (isExternalHref(target)) {
    return (
      <a href={target} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink to={target} {...rest}>
      {children}
    </RouterLink>
  );
}
