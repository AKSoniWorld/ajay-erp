import '@fontsource-variable/noto-sans';
import '@fontsource/playfair-display/500.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './index.css';

registerSW({ immediate: true });   // the service worker keeps the app itself available with no internet and updates it quietly

// networkMode "offlineFirst": cached data is shown immediately and requests fail quietly when there is no connection.
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, networkMode: 'offlineFirst', refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></React.StrictMode>,
);
