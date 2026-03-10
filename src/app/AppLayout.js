import React, { useEffect } from 'react';
import GlobalSyncBar from './GlobalSyncBar';

const ensureMeta = (name) => {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  return tag;
};

export default function AppLayout({ title, description, children }) {
  useEffect(() => {
    const pageTitle = title ? `${title} | Nutri Sport Hub` : 'Nutri Sport Hub';
    document.title = pageTitle;
    if (description) ensureMeta('description').setAttribute('content', description);
  }, [description, title]);

  return (
    <>
      <GlobalSyncBar />
      {children}
    </>
  );
}
