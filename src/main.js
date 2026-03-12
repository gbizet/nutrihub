import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { bootstrapRemoteStateIntoLocalStorage } from './lib/remoteStateBootstrap.js';
import './css/custom.css';
import './app/app.css';

await bootstrapRemoteStateIntoLocalStorage().catch(() => null);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
